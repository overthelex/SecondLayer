import chalk from 'chalk';

export interface ResultEntry {
  tool: string;
  status: 'success' | 'error' | 'timeout';
  timeMs: number;
  cost: number;
  errorMsg?: string;
}

interface DashboardState {
  testRunId: string;
  wave: 'simple' | 'complex' | 'idle';
  batchNum: number;
  totalBatches: number;
  currentTools: string[];
  succeeded: number;
  failed: number;
  inProgress: number;
  totalQueries: number;
  completed: number;
  latencies: number[];
  totalCost: number;
  recentResults: ResultEntry[];
}

export class Dashboard {
  private enabled = false;
  private state: DashboardState;
  private renderInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxRecent = 10;
  private readonly cols: number;

  constructor(config: { testRunId: string; totalQueries: number }) {
    this.cols = Math.min(process.stdout.columns || 80, 120);
    this.state = {
      testRunId: config.testRunId,
      wave: 'idle',
      batchNum: 0,
      totalBatches: 0,
      currentTools: [],
      succeeded: 0,
      failed: 0,
      inProgress: 0,
      totalQueries: config.totalQueries,
      completed: 0,
      latencies: [],
      totalCost: 0,
      recentResults: [],
    };
  }

  start(): void {
    this.enabled = true;
    process.stdout.write('\x1b[?1049h'); // alt screen
    process.stdout.write('\x1b[?25l');   // hide cursor
    this.renderInterval = setInterval(() => this.render(), 250);
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('exit', () => this.cleanup());
    this.render();
  }

  stop(): void {
    this.cleanup();
  }

  setWave(wave: 'simple' | 'complex'): void {
    this.state.wave = wave;
    this.state.batchNum = 0;
  }

  setBatch(batchNum: number, totalBatches: number, tools: string[]): void {
    this.state.batchNum = batchNum;
    this.state.totalBatches = totalBatches;
    this.state.currentTools = tools;
    this.state.inProgress = tools.length;
  }

  addInProgress(tool: string): void {
    this.state.inProgress++;
  }

  recordResult(entry: ResultEntry): void {
    if (entry.status === 'success') {
      this.state.succeeded++;
    } else {
      this.state.failed++;
    }
    this.state.completed++;
    this.state.inProgress = Math.max(0, this.state.inProgress - 1);
    this.state.latencies.push(entry.timeMs);
    this.state.totalCost += entry.cost;
    this.state.recentResults.push(entry);
    if (this.state.recentResults.length > this.maxRecent) {
      this.state.recentResults.shift();
    }
  }

  private render(): void {
    if (!this.enabled) return;
    const s = this.state;
    const w = this.cols;

    process.stdout.write('\x1b[H'); // cursor home

    const lines: string[] = [];

    // Header
    const title = ` LOAD TEST ─ ${s.testRunId} `;
    lines.push(chalk.cyan('┌─' + title + '─'.repeat(Math.max(0, w - title.length - 4)) + '─┐'));

    // Wave + Progress
    const waveLabel = s.wave === 'idle' ? 'STARTING' : s.wave.toUpperCase();
    const waveTotal = s.wave === 'idle' ? s.totalQueries : s.totalQueries / 2;
    const waveCompleted = s.wave === 'simple'
      ? Math.min(s.completed, waveTotal)
      : s.completed - s.totalQueries / 2;
    const progressBar = this.renderProgressBar(Math.max(0, waveCompleted), waveTotal, 30);
    const batchInfo = s.batchNum > 0 ? `Batch ${s.batchNum}/${s.totalBatches}` : '';
    lines.push(this.pad(`│ Wave: ${chalk.bold(waveLabel)} ${progressBar}  ${batchInfo}`));

    lines.push(this.pad('│'));

    // Status counters
    const statusLine = `│ Status:  ${chalk.green('✓ ' + s.succeeded)} succeeded  ${chalk.red('✗ ' + s.failed)} failed  ${chalk.yellow('⟳ ' + s.inProgress)} in-progress  Total: ${s.completed}/${s.totalQueries}`;
    lines.push(this.pad(statusLine));

    // Latency
    const lat = this.getLatencyStats();
    const latLine = `│ Latency: min ${this.fmtTime(lat.min)}  avg ${this.fmtTime(lat.avg)}  max ${this.fmtTime(lat.max)}  p95 ${this.fmtTime(lat.p95)}`;
    lines.push(this.pad(latLine));

    // Cost
    lines.push(this.pad(`│ Cost:    ${chalk.green('$' + s.totalCost.toFixed(4))} total LLM`));

    lines.push(this.pad('│'));

    // Current batch tools
    const toolsStr = s.currentTools.map(t => t.length > 25 ? t.substring(0, 22) + '...' : t).join(', ');
    const toolsLine = toolsStr.length > w - 20 ? toolsStr.substring(0, w - 23) + '...' : toolsStr;
    lines.push(this.pad(`│ Tools: ${chalk.dim(toolsLine)}`));

    lines.push(this.pad('│'));

    // Recent results
    lines.push(this.pad(`│ ${chalk.bold('Recent Results:')}`));
    const displayResults = s.recentResults.slice(-8);
    for (const r of displayResults) {
      const icon = r.status === 'success' ? chalk.green('✓') : r.status === 'timeout' ? chalk.yellow('⏱') : chalk.red('✗');
      const toolName = r.tool.length > 32 ? r.tool.substring(0, 29) + '...' : r.tool.padEnd(32);
      const time = this.fmtTime(r.timeMs);
      const cost = r.cost > 0 ? chalk.dim('$' + r.cost.toFixed(4)) : chalk.dim(r.errorMsg?.substring(0, 20) || '');
      lines.push(this.pad(`│  ${icon} ${toolName} ${time.padStart(7)}  ${cost}`));
    }
    // Fill empty slots
    for (let i = displayResults.length; i < 8; i++) {
      lines.push(this.pad('│'));
    }

    // Footer
    const successRate = s.completed > 0 ? Math.round(s.succeeded / s.completed * 100) : 0;
    const footerText = ` Success Rate: ${successRate}% `;
    const footerColor = successRate >= 95 ? chalk.green : successRate >= 80 ? chalk.yellow : chalk.red;
    lines.push(chalk.cyan('└─' + footerColor(footerText) + '─'.repeat(Math.max(0, w - footerText.length - 4)) + '─┘'));

    // Write all lines, clear remaining terminal space
    const output = lines.join('\n') + '\n';
    process.stdout.write(output);
    // Clear below
    process.stdout.write('\x1b[J');
  }

  private pad(line: string): string {
    // Strip ANSI for length calculation
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = Math.max(0, this.cols - stripped.length - 1);
    return line + ' '.repeat(padding) + chalk.cyan('│');
  }

  private renderProgressBar(completed: number, total: number, width: number): string {
    const ratio = total > 0 ? completed / total : 0;
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
    const pct = Math.round(ratio * 100);
    return `[${bar}] ${completed}/${total} (${pct}%)`;
  }

  private getLatencyStats(): { min: number; avg: number; max: number; p95: number } {
    const lats = this.state.latencies;
    if (lats.length === 0) return { min: 0, avg: 0, max: 0, p95: 0 };
    const sorted = [...lats].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const p95idx = Math.floor(sorted.length * 0.95);
    return {
      min: sorted[0],
      avg: Math.round(sum / sorted.length),
      max: sorted[sorted.length - 1],
      p95: sorted[Math.min(p95idx, sorted.length - 1)],
    };
  }

  private fmtTime(ms: number): string {
    if (ms === 0) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private cleanup(): void {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.renderInterval) clearInterval(this.renderInterval);
    process.stdout.write('\x1b[?25h');   // show cursor
    process.stdout.write('\x1b[?1049l'); // exit alt screen
  }
}
