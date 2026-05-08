import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/lex_rlhf_signals',
  githubToken: process.env.GITHUB_TOKEN || '',
  githubRepo: process.env.GITHUB_REPO || '',
  planeApiKey: process.env.PLANE_API_KEY || '',
  planeWorkspace: process.env.PLANE_WORKSPACE || '',
  planeProject: process.env.PLANE_PROJECT || '',
  claudeCodeProjectsDir: process.env.CLAUDE_CODE_PROJECTS_DIR || `${process.env.HOME}/.claude/projects`,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  redactionWhitelistFile: process.env.REDACTION_WHITELIST_FILE || './config/redaction-whitelist.json',
  logLevel: process.env.LOG_LEVEL || 'info',
};
