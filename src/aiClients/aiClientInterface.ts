import type {
  ToolExecutionResult,
  ToolFunctionSchema,
} from '../tools/toolInterface.js';
import type { QdrantSearchResult } from '../qdrant/index.js';

export interface ToolCallRequest {
  toolName: string;
  input: Record<string, unknown>;
}

export type AIClientResult =
  | {
      type: 'final';
      text: string;
    }
  | {
      type: 'tool_call';
      toolCall: ToolCallRequest;
    };

export interface AskAIOptions {
  toolSchemas: ToolFunctionSchema[];
  ragResults?: QdrantSearchResult[];
  toolResults?: ToolExecutionResult[];
  log?: (message: string) => void;
}

export interface AIClientInterface {
  AskAI(userQuestion: string, options: AskAIOptions): Promise<AIClientResult>;
}
