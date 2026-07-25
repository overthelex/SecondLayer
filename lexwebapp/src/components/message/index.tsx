import { motion } from 'framer-motion';
import type { Decision } from '../DecisionCard';
import type { ExecutionPlan, CitationWarning, CostSummary as CostSummaryType } from '../../types/models/Message';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';

export type MessageRole = 'user' | 'assistant';
export interface MessageProps {
  id: string;
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  decisions?: Decision[];
  analytics?: {
    totalCases: number;
    satisfied: number;
    rejected: number;
    partial: number;
    trend: 'up' | 'down' | 'stable';
    interpretation: string;
  };
  citations?: Array<{
    text: string;
    source: string;
  }>;
  documents?: Array<{
    id: string;
    title: string;
    type: string;
  }>;
  thinkingSteps?: Array<{
    id: string;
    title: string;
    content?: string;
    isComplete: boolean;
  }>;
  executionPlan?: ExecutionPlan;
  citationWarnings?: CitationWarning[];
  costSummary?: CostSummaryType;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
}

export function Message({
  role, content, isStreaming, decisions, analytics, citations,
  documents, thinkingSteps, executionPlan, citationWarnings,
  costSummary, onRegenerate, onEdit,
}: MessageProps) {
  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`group w-full ${isUser ? 'py-3 md:py-4' : 'py-6 md:py-8'}`}
    >
      <div className="max-w-3xl mx-auto px-4 md:px-8">
        {isUser ? (
          <UserMessage content={content} onEdit={onEdit} />
        ) : (
          <AssistantMessage
            content={content}
            isStreaming={isStreaming}
            decisions={decisions}
            analytics={analytics}
            citations={citations}
            documents={documents}
            thinkingSteps={thinkingSteps}
            executionPlan={executionPlan}
            citationWarnings={citationWarnings}
            costSummary={costSummary}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </motion.div>
  );
}
