import { logger } from '../utils/logger.js';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

interface PushTaskState {
  taskId: string;
  taskName: string;
  projectId: string;
  lastRefreshAt: Date | null;
  lastCommitSha: string | null;
  refreshCount: number;
  tags: string[];
}

interface ToolDelta {
  tool: string;
  changeType: 'added' | 'removed' | 'modified';
  details?: string;
}

interface RefreshResult {
  taskId: string;
  summary: string;
  toolDeltas: ToolDelta[];
  openQuestions: string[];
  commitRange: string | null;
}

export class WorkflowMemoryPushService {
  constructor(
    private db: { query: (sql: string, params?: any[]) => Promise<any> },
    private summarize: (prompt: string) => Promise<string>,
  ) {}

  // ── Plane Task Watcher ────────────────────────────────────

  async syncPlaneTasksToWatchlist(planeTasks: Array<{ id: string; name: string; projectId: string; labels: string[] }>): Promise<number> {
    let synced = 0;
    for (const task of planeTasks) {
      const tags = task.labels.map(l => l.toLowerCase());
      await this.db.query(
        `INSERT INTO workflow_memory_push_state (task_id, task_name, project_id, tags)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (task_id) DO UPDATE SET
           task_name = EXCLUDED.task_name,
           tags = EXCLUDED.tags,
           updated_at = NOW()`,
        [task.id, task.name, task.projectId, tags],
      );
      synced++;
    }
    return synced;
  }

  async getTasksDueForRefresh(maxAgeDays: number = 7): Promise<PushTaskState[]> {
    const res = await this.db.query(
      `SELECT task_id, task_name, project_id, last_refresh_at, last_commit_sha, refresh_count, tags
       FROM workflow_memory_push_state
       WHERE status = 'active'
         AND (last_refresh_at IS NULL OR last_refresh_at < NOW() - INTERVAL '1 day' * $1)
       ORDER BY last_refresh_at ASC NULLS FIRST
       LIMIT 10`,
      [maxAgeDays],
    );
    return res.rows.map((r: any) => ({
      taskId: r.task_id,
      taskName: r.task_name,
      projectId: r.project_id,
      lastRefreshAt: r.last_refresh_at,
      lastCommitSha: r.last_commit_sha,
      refreshCount: r.refresh_count,
      tags: r.tags ?? [],
    }));
  }

  async refreshTask(task: PushTaskState): Promise<RefreshResult> {
    // 1. Get commits since last refresh
    const since = task.lastRefreshAt
      ? task.lastRefreshAt.toISOString().slice(0, 10)
      : new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

    let commitLog = '';
    let latestSha: string | null = null;
    try {
      commitLog = execSync(
        `git log --since="${since}" --oneline --no-merges --max-count=30`,
        { encoding: 'utf-8', cwd: process.cwd(), timeout: 10000 },
      ).trim();
      latestSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: process.cwd() }).trim();
    } catch { /* not in a git repo */ }

    // 2. Get files changed
    let filesChanged = '';
    if (task.lastCommitSha && latestSha && task.lastCommitSha !== latestSha) {
      try {
        filesChanged = execSync(
          `git diff --name-only ${task.lastCommitSha}...${latestSha} 2>/dev/null | head -50`,
          { encoding: 'utf-8', cwd: process.cwd(), timeout: 10000 },
        ).trim();
      } catch { /* ignore */ }
    }

    // 3. Get tool lineage delta
    const toolDeltas = await this.computeToolLineageDelta();

    // 4. Summarize via LLM
    const prompt = `Summarize recent repository changes relevant to this task for a workflow memory system.

Task: ${task.taskName}
Task tags: ${task.tags.join(', ')}
Period: since ${since}

Recent commits:
${commitLog || '(no new commits)'}

Files changed:
${filesChanged || '(no file changes detected)'}

Tool changes:
${toolDeltas.length > 0 ? toolDeltas.map(d => `- ${d.tool}: ${d.changeType}${d.details ? ' — ' + d.details : ''}`).join('\n') : '(no tool changes)'}

Produce:
1. A 2-3 sentence executive summary of changes relevant to this task
2. Any open questions or decision points for the practitioner

Format: first paragraph is the summary, second paragraph (if any) starts with "Open questions:" followed by bullet points.`;

    const llmResponse = await this.summarize(prompt);

    const parts = llmResponse.split(/Open questions?:/i);
    const summary = parts[0].trim();
    const openQuestions = parts[1]
      ? parts[1].trim().split('\n').map(q => q.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
      : [];

    // 5. Update push state
    await this.db.query(
      `UPDATE workflow_memory_push_state
       SET last_refresh_at = NOW(), last_commit_sha = $2, refresh_count = refresh_count + 1, updated_at = NOW()
       WHERE task_id = $1`,
      [task.taskId, latestSha],
    );

    const commitRange = task.lastCommitSha && latestSha
      ? `${task.lastCommitSha.slice(0, 8)}..${latestSha.slice(0, 8)}`
      : null;

    return { taskId: task.taskId, summary, toolDeltas, openQuestions, commitRange };
  }

  // ── Tool Lineage Delta ────────────────────────────────────

  async computeToolLineageDelta(): Promise<ToolDelta[]> {
    // Get current tool definitions from tool registry
    let currentTools: Record<string, string> = {};
    try {
      const res = await this.db.query(
        `SELECT tool_names, tool_hashes FROM workflow_memory_tool_lineage
         ORDER BY snapshot_at DESC LIMIT 1`,
      );
      if (res.rows.length > 0) {
        const prev = res.rows[0];
        const prevHashes: Record<string, string> = prev.tool_hashes ?? {};
        const prevNames = new Set<string>(prev.tool_names ?? []);

        // Get current tool names from the tool registry table (if exists)
        // Fall back to checking the tool handler files
        currentTools = await this.snapshotToolHashes();
        const currentNames = new Set(Object.keys(currentTools));

        const deltas: ToolDelta[] = [];

        for (const name of currentNames) {
          if (!prevNames.has(name)) {
            deltas.push({ tool: name, changeType: 'added' });
          } else if (prevHashes[name] && prevHashes[name] !== currentTools[name]) {
            deltas.push({ tool: name, changeType: 'modified', details: 'schema hash changed' });
          }
        }

        for (const name of prevNames) {
          if (!currentNames.has(name)) {
            deltas.push({ tool: name, changeType: 'removed' });
          }
        }

        return deltas;
      }
    } catch (err: any) {
      logger.debug('No previous tool lineage snapshot', { error: err.message });
    }

    return [];
  }

  async snapshotToolHashes(): Promise<Record<string, string>> {
    // Read tool definitions from the HTTP API
    const hashes: Record<string, string> = {};
    try {
      const res = await fetch('http://localhost:3000/health');
      if (!res.ok) return hashes;
      // Use the tool registry's internal listing if available
      const toolsRes = await this.db.query(
        `SELECT DISTINCT unnest(tool_names) as name FROM workflow_memory_tool_lineage
         ORDER BY name`,
      );
      // If no previous snapshot, just return empty — first run
      if (toolsRes.rows.length === 0) return hashes;
    } catch { /* ignore */ }
    return hashes;
  }

  async saveToolSnapshot(toolNames: string[], toolHashes: Record<string, string>, deltas: ToolDelta[]): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_memory_tool_lineage (tool_count, tool_names, tool_hashes, changes_from_prev)
       VALUES ($1, $2, $3, $4)`,
      [toolNames.length, toolNames, JSON.stringify(toolHashes), JSON.stringify(deltas)],
    );
  }

  // ── Stats ─────────────────────────────────────────────────

  async getStats(): Promise<{ watchedTasks: number; totalRefreshes: number; toolSnapshots: number }> {
    const [tasks, lineage] = await Promise.all([
      this.db.query('SELECT COUNT(*) as cnt, COALESCE(SUM(refresh_count), 0) as refreshes FROM workflow_memory_push_state WHERE status = $1', ['active']),
      this.db.query('SELECT COUNT(*) as cnt FROM workflow_memory_tool_lineage'),
    ]);
    return {
      watchedTasks: Number(tasks.rows[0].cnt),
      totalRefreshes: Number(tasks.rows[0].refreshes),
      toolSnapshots: Number(lineage.rows[0].cnt),
    };
  }
}
