#!/usr/bin/env npx tsx
/**
 * Phase 1.1 — Populate workflow memory principle ledger from existing sources:
 *   1. CLAUDE.md sections → individual principles
 *   2. Merged PR descriptions → architectural decisions
 *   3. docs/workflow-memory-phases.md → design doc principles
 *
 * Usage: npx tsx scripts/backfill-workflow-memory-principles.ts [--dry-run] [--skip-prs]
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT, 'mcp_backend', '.env') });
dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });

import { Database } from '../mcp_backend/src/database/database.js';
import { EmbeddingService } from '../mcp_backend/src/services/embedding-service.js';
import { WorkflowMemoryService, PrincipleInput } from '../mcp_backend/src/services/workflow-memory-service.js';

// ── CLI flags ────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_PRS = process.argv.includes('--skip-prs');

// ── Tag inference ────────────────────────────────────────────

const SECTION_TAG_MAP: Record<string, string[]> = {
  'MCP & External Tools': ['mcp', 'tools'],
  'Architecture': ['architecture'],
  'TypeScript': ['typescript', 'build'],
  'Deployment': ['deployment', 'ci-cd', 'docker'],
  'Git Workflow': ['git'],
  'Working Style': ['workflow'],
  'Project Overview': ['architecture'],
  'Project Stack': ['architecture', 'stack'],
  'Session Scope': ['workflow'],
  'Language & Localization': ['frontend', 'i18n'],
  'Infrastructure Notes': ['infrastructure'],
  'Debugging Approach': ['debugging'],
  'Git & Deployment Workflow': ['git', 'deployment'],
  'Local Dev Environment': ['docker', 'local-dev'],
  'Project Defaults': ['workflow', 'typescript'],
  'Repository Overview': ['architecture'],
  'Triple Transport System': ['architecture', 'mcp'],
  'Technology Stack': ['architecture', 'stack'],
  'Unified Gateway': ['architecture', 'gateway'],
  'Shared Package (`@secondlayer/shared`)': ['architecture', 'shared-package'],
  'Service Initialization (Factory Pattern)': ['architecture', 'patterns'],
  'Key Services (mcp_backend/src/services/)': ['architecture', 'services'],
  'Adapter Pattern (mcp_backend/src/adapters/)': ['architecture', 'adapters'],
  'Frontend Architecture (lexwebapp/)': ['frontend', 'architecture'],
  'Development Commands': ['commands'],
  'Port Allocation': ['infrastructure', 'networking'],
  'Environment Variables': ['infrastructure', 'configuration'],
  'Database Migrations': ['database', 'migrations'],
  'Docker Deployment': ['docker', 'deployment'],
  'CI/CD Pipeline': ['ci-cd', 'deployment'],
  'Testing': ['testing'],
  'Common Workflows': ['workflow'],
  'Adding a new MCP tool': ['mcp', 'tools', 'workflow'],
  'Working with legislation': ['legislation', 'domain'],
  'Cost tracking': ['billing', 'monitoring'],
  'HTTP Server Structure (all services)': ['architecture', 'api'],
  'Important Notes': ['operations'],
  'Scripts': ['scripts'],
  'Remote Servers': ['infrastructure', 'ssh'],
  'System Administration': ['ops', 'database'],
  'Firewall / Network': ['infrastructure', 'networking'],
  'Development Practices': ['development'],
  'Change Impact Analysis': ['development'],
  'Task Management': ['workflow'],
  'Frontend Conventions': ['frontend'],
  'UI Display Rules': ['frontend', 'ui'],
  'Database Operations': ['database'],
  'Data Import & Scraping': ['data-import'],
  'Code Patterns': ['code-patterns', 'sql'],
};

const KEYWORD_TAGS: [RegExp, string][] = [
  [/docker|container|compose/i, 'docker'],
  [/nginx/i, 'nginx'],
  [/postgres|postgresql|migration/i, 'database'],
  [/redis/i, 'redis'],
  [/qdrant|vector|embedding/i, 'vector-search'],
  [/ci[\/-]?cd|pipeline|github.actions/i, 'ci-cd'],
  [/deploy|prod(?:uction)?/i, 'deployment'],
  [/test|jest|vitest|playwright/i, 'testing'],
  [/ssh|server/i, 'infrastructure'],
  [/\bmcp\b|tool.registry/i, 'mcp'],
  [/frontend|react|vite|tailwind/i, 'frontend'],
  [/monobank|billing|payment/i, 'billing'],
  [/auth|oauth|jwt|oidc|webauthn/i, 'auth'],
  [/legislation|law|court|edrsr/i, 'legal-domain'],
  [/\bgit\b|branch|commit|pull.request/i, 'git'],
];

function inferTags(sectionHeading: string, body: string): string[] {
  const tags = new Set<string>();

  const sectionTags = SECTION_TAG_MAP[sectionHeading];
  if (sectionTags) sectionTags.forEach(t => tags.add(t));

  for (const [re, tag] of KEYWORD_TAGS) {
    if (re.test(body)) tags.add(tag);
  }

  return [...tags];
}

// ── Key generation ───────────────────────────────────────────

function slugify(text: string, maxLen = 50): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 8)
    .join('-')
    .substring(0, maxLen);
}

function sectionSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 30);
}

function principleKey(section: string, bullet: string): string {
  const s = sectionSlug(section);
  const b = slugify(bullet);
  return `${s}--${b}`.replace(/--+/g, '--');
}

// ── Title extraction ─────────────────────────────────────────

function extractTitle(bullet: string, maxLen = 100): string {
  const cleaned = bullet
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1');

  const firstSentence = cleaned.match(/^[^.!]+[.!]/);
  if (firstSentence && firstSentence[0].length <= maxLen) {
    return firstSentence[0].trim();
  }
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.substring(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

// ── CLAUDE.md parser ─────────────────────────────────────────

const SKIP_SECTIONS = new Set([
  'Port Allocation',
  'Workspace Structure',
]);

interface ParsedPrinciple {
  principleKey: string;
  title: string;
  body: string;
  source: 'claude_md' | 'pr_review' | 'design_doc';
  sourceRef: string;
  tags: string[];
  confidence: number;
}

function parseCLAUDEmd(filePath: string): ParsedPrinciple[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const principles: ParsedPrinciple[] = [];

  let currentSection = '';
  let inCodeBlock = false;
  let currentBullet = '';
  const bullets: { section: string; text: string }[] = [];

  function flushBullet() {
    if (currentBullet && currentSection) {
      bullets.push({ section: currentSection, text: currentBullet.trim() });
    }
    currentBullet = '';
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushBullet();
      currentSection = headingMatch[2].trim();
      continue;
    }

    if (line.trim().startsWith('|')) continue;

    if (line.match(/^- /)) {
      flushBullet();
      currentBullet = line.substring(2).trim();
    } else if (currentBullet && line.match(/^\s{2,}/) && line.trim().length > 0) {
      currentBullet += ' ' + line.trim();
    }
  }
  flushBullet();

  for (const { section, text } of bullets) {
    if (SKIP_SECTIONS.has(section)) continue;
    if (text.length < 20) continue;

    const key = principleKey(section, text);
    if (!key || key.length < 10) continue;

    principles.push({
      principleKey: key,
      title: extractTitle(text),
      body: text,
      source: 'claude_md',
      sourceRef: 'CLAUDE.md',
      tags: inferTags(section, text),
      confidence: 1.0,
    });
  }

  return principles;
}

// ── Design doc parser ────────────────────────────────────────

function parseDesignDoc(filePath: string): ParsedPrinciple[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const principles: ParsedPrinciple[] = [];
  const relPath = path.relative(ROOT, filePath);

  let inTable = false;
  const tableRows: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('|') && line.includes('Phase')) {
      inTable = true;
    }
    if (inTable && line.trim().startsWith('|')) {
      tableRows.push(line);
    } else if (inTable && !line.trim().startsWith('|')) {
      inTable = false;
    }
  }

  for (const row of tableRows) {
    if (row.includes('---') || row.includes('Phase') && row.includes('Weeks')) continue;
    const cells = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;

    const [phase, weeks, scope, status] = cells;
    const key = `wm-phase-${phase.replace(/\s/g, '').toLowerCase()}`;
    principles.push({
      principleKey: key,
      title: `Workflow Memory ${phase}: ${scope.substring(0, 60)}`,
      body: `Phase ${phase} (weeks ${weeks}): ${scope}. Status: ${status}`,
      source: 'design_doc',
      sourceRef: relPath,
      tags: ['workflow-memory', 'roadmap'],
      confidence: 0.9,
    });
  }

  return principles;
}

// ── PR extraction ────────────────────────────────────────────

interface PRData {
  number: number;
  title: string;
  body: string;
  mergedAt: string;
  url: string;
}

function fetchMergedPRs(limit = 50): PRData[] {
  try {
    const raw = execSync(
      `gh pr list --state merged --limit ${limit} --json number,title,body,mergedAt,url`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, cwd: ROOT },
    );
    return JSON.parse(raw);
  } catch (err: any) {
    console.warn(`⚠ Failed to fetch PRs: ${err.message}. Skipping PR extraction.`);
    return [];
  }
}

const ARCH_KEYWORDS = /architect|migration|schema|pattern|convention|decision|approach|design|breaking|new.table|new.service|factory|adapter|refactor/i;

function parsePRs(prs: PRData[]): ParsedPrinciple[] {
  const principles: ParsedPrinciple[] = [];

  for (const pr of prs) {
    if (!pr.body || pr.body.length < 50) continue;
    const titleLower = pr.title.toLowerCase();
    if (titleLower.startsWith('fix(') || titleLower.startsWith('docs(') || titleLower.startsWith('chore: bump')) continue;
    if (!ARCH_KEYWORDS.test(pr.body) && !ARCH_KEYWORDS.test(pr.title)) continue;

    const summaryMatch = pr.body.match(/## Summary\s*\n([\s\S]*?)(?=\n## |\n---|\n\n\n|$)/);
    const text = summaryMatch ? summaryMatch[1].trim() : pr.body.substring(0, 500).trim();
    if (text.length < 30) continue;

    const slug = slugify(pr.title, 40);
    const key = `pr-${pr.number}--${slug}`;

    principles.push({
      principleKey: key,
      title: `PR #${pr.number}: ${pr.title.substring(0, 80)}`,
      body: text,
      source: 'pr_review',
      sourceRef: pr.url,
      tags: inferTags('', text),
      confidence: 0.8,
    });
  }

  return principles;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 1.1: Principle Ledger Backfill ===\n');
  if (DRY_RUN) console.log('🔍 DRY RUN — no data will be written\n');

  // 1. Parse sources
  const claudeMdPath = path.join(ROOT, 'CLAUDE.md');
  const phasesPath = path.join(ROOT, 'docs', 'workflow-memory-phases.md');

  const claudePrinciples = parseCLAUDEmd(claudeMdPath);
  console.log(`📄 CLAUDE.md: ${claudePrinciples.length} principles`);

  const designPrinciples = parseDesignDoc(phasesPath);
  console.log(`📋 Design docs: ${designPrinciples.length} principles`);

  let prPrinciples: ParsedPrinciple[] = [];
  if (!SKIP_PRS) {
    const prs = fetchMergedPRs(50);
    prPrinciples = parsePRs(prs);
    console.log(`🔀 PRs: ${prPrinciples.length} principles (from ${prs.length} merged PRs)`);
  }

  const all = [...claudePrinciples, ...designPrinciples, ...prPrinciples];
  console.log(`\n📦 Total: ${all.length} principles to ingest\n`);

  if (DRY_RUN) {
    for (const p of all) {
      console.log(`  [${p.source}] ${p.principleKey}`);
      console.log(`    title: ${p.title}`);
      console.log(`    tags: ${p.tags.join(', ')}`);
      console.log();
    }
    console.log('Dry run complete.');
    process.exit(0);
  }

  // 2. Initialize services
  const db = new Database();
  await db.connect();
  const embeddingService = new EmbeddingService();
  const wmService = new WorkflowMemoryService(db, embeddingService);
  await wmService.initialize();

  // 3. Ingest
  let success = 0;
  const failures: { key: string; error: string }[] = [];

  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    try {
      await wmService.ingestPrinciple({
        principleKey: p.principleKey,
        title: p.title,
        body: p.body,
        source: p.source,
        sourceRef: p.sourceRef,
        tags: p.tags,
        confidence: p.confidence,
      });
      success++;

      if ((i + 1) % 10 === 0) {
        console.log(`  ✓ ${i + 1}/${all.length} ingested`);
      }

      await sleep(150);
    } catch (err: any) {
      failures.push({ key: p.principleKey, error: err.message });
      console.error(`  ✗ ${p.principleKey}: ${err.message}`);
    }
  }

  // 4. Summary
  console.log('\n=== Backfill Summary ===');
  console.log(`CLAUDE.md principles: ${claudePrinciples.length}`);
  console.log(`Design doc principles: ${designPrinciples.length}`);
  console.log(`PR-derived principles: ${prPrinciples.length}`);
  console.log(`Total ingested: ${success}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length > 0) {
    for (const f of failures) {
      console.log(`  - ${f.key}: ${f.error}`);
    }
  }

  // 5. Verify
  const stats = await wmService.getStats();
  console.log(`\nCurrent DB state: ${stats.principles} principles, ${stats.patterns} patterns, ${stats.practitioner} practitioner entries`);

  await db.getPool().end();
  console.log('\nDone.');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
