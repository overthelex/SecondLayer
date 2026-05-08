import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { query } from '../lib/db';
import { logger } from '../lib/logger';

const BEDROCK_MODEL = 'eu.anthropic.claude-sonnet-4-6';
const BEDROCK_REGION = process.env.AWS_REGION || 'eu-central-1';
const BATCH_SIZE = 5;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

const VALID_CLASSES = [
  'cosmetic',
  'reorganization',
  'factual_correction',
  'tone_adjustment',
  'substantive_rewrite',
  'rejection',
] as const;

interface UnclassifiedEdit {
  edit_id: string;
  edit_distance_norm: number;
  from_content: string;
  to_content: string;
  [key: string]: unknown;
}

const CLASSIFICATION_PROMPT = `You are classifying the semantic nature of an edit between two text artifacts in a recursive AI workflow.

Given the BEFORE and AFTER text, classify the edit into exactly one category:

- cosmetic: whitespace, formatting, typo fixes, no meaning change
- reorganization: same content reordered, restructured, or split/merged
- factual_correction: fixing incorrect facts, numbers, names, references
- tone_adjustment: changing formality, politeness, assertiveness while keeping meaning
- substantive_rewrite: significant content changes, new arguments, different approach
- rejection: the AFTER text abandons/contradicts the BEFORE text entirely

Respond with ONLY the category name, nothing else.`;

async function classifyWithBedrock(
  client: BedrockRuntimeClient,
  fromContent: string,
  toContent: string,
): Promise<string | null> {
  const from = fromContent.slice(0, 3000);
  const to = toContent.slice(0, 3000);

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 20,
    messages: [
      {
        role: 'user',
        content: `${CLASSIFICATION_PROMPT}\n\nBEFORE:\n${from}\n\nAFTER:\n${to}`,
      },
    ],
  });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const command = new InvokeModelCommand({
        modelId: BEDROCK_MODEL,
        contentType: 'application/json',
        accept: 'application/json',
        body,
      });

      const response = await client.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));
      const text = result.content?.[0]?.text?.trim().toLowerCase();

      if (text && VALID_CLASSES.includes(text as any)) {
        return text;
      }
      logger.warn(`Unexpected classification response: "${text}"`);
      return null;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('Too many requests') && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      logger.error('Bedrock classification failed', { error: msg });
      return null;
    }
  }
  return null;
}

export async function classifyEdits(options: { dryRun?: boolean; limit?: number } = {}): Promise<void> {
  const bedrock = new BedrockRuntimeClient({ region: BEDROCK_REGION });

  // Phase 1: rule-based classification
  const ruleBasedResult = await query(`
    UPDATE workflow_edits
    SET semantic_change_class = CASE
      WHEN edit_distance_norm < 0.05 THEN 'cosmetic'
      WHEN edit_distance_norm >= 0.80 THEN 'substantive_rewrite'
    END,
    inferred_class = FALSE
    WHERE semantic_change_class IS NULL
    AND (edit_distance_norm < 0.05 OR edit_distance_norm >= 0.80)
  `);
  logger.info(`Rule-based classification: ${ruleBasedResult.rowCount} edits`);

  if (options.dryRun) {
    const remaining = await query('SELECT count(*) as cnt FROM workflow_edits WHERE semantic_change_class IS NULL');
    logger.info(`Dry run: ${remaining.rows[0]?.cnt} edits would need LLM classification`);
    return;
  }

  // Phase 2: LLM classification for middle range
  const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
  const unclassified = await query<UnclassifiedEdit>(`
    SELECT e.edit_id, e.edit_distance_norm,
      fa.content_raw as from_content,
      ta.content_raw as to_content
    FROM workflow_edits e
    JOIN workflow_artifacts fa ON e.from_artifact_id = fa.artifact_id
    JOIN workflow_artifacts ta ON e.to_artifact_id = ta.artifact_id
    WHERE e.semantic_change_class IS NULL
    AND fa.content_raw IS NOT NULL
    AND ta.content_raw IS NOT NULL
    AND NOT fa.content_raw LIKE '[truncated%'
    AND NOT ta.content_raw LIKE '[truncated%'
    ORDER BY e.edit_id
    ${limitClause}
  `);

  logger.info(`LLM classification: ${unclassified.rows.length} edits to process`);

  let classified = 0;
  let failed = 0;

  for (let i = 0; i < unclassified.rows.length; i += BATCH_SIZE) {
    const batch = unclassified.rows.slice(i, i + BATCH_SIZE);

    for (const edit of batch) {
      const cls = await classifyWithBedrock(bedrock, edit.from_content, edit.to_content);
      if (cls) {
        await query(
          'UPDATE workflow_edits SET semantic_change_class = $1, inferred_class = TRUE WHERE edit_id = $2',
          [cls, edit.edit_id]
        );
        classified++;
      } else {
        failed++;
      }
    }

    if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= unclassified.rows.length) {
      logger.info(`Progress: ${classified} classified, ${failed} failed, ${i + batch.length}/${unclassified.rows.length} processed`);
    }
  }

  logger.info(`LLM classification complete: ${classified} classified, ${failed} failed`);
}
