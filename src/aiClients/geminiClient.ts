import { GoogleGenAI, type FunctionDeclaration } from '@google/genai';

import type {
  AIClientInterface,
  AIClientResult,
  AskAIOptions,
} from './aiClientInterface.js';
import type { QdrantSearchResult } from '../qdrant/index.js';
import type { ToolFunctionSchema } from '../tools/toolInterface.js';
import { logGeminiTokenUsage } from './geminiUsageLogger.js';

type ExtractedToolCall = Extract<
  AIClientResult,
  { type: 'tool_call' }
>['toolCall'];

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
      }>;
    };
  }>;
  functionCalls?: Array<{
    name?: string;
    args?: Record<string, unknown>;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    responseTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
    toolUsePromptTokenCount?: number;
    trafficType?: string;
  };
}

export class GeminiClient implements AIClientInterface {
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Missing GEMINI_API_KEY. Please add it to your .env file.',
      );
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  }

  async AskAI(
    userQuestion: string,
    options: AskAIOptions,
  ): Promise<AIClientResult> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: buildContents(userQuestion, options),
        config: {
          systemInstruction: buildSystemInstruction(options),
          temperature: 0.3,
          tools: [
            {
              functionDeclarations: toFunctionDeclarations(options.toolSchemas),
            },
          ],
        },
      });
      logGeminiTokenUsage('generateContent:agent', response, options.log);

      const toolCall = extractToolCall(response);

      if (toolCall) {
        return {
          type: 'tool_call',
          toolCall,
        };
      }

      const content = extractGeminiText(response);

      if (!content) {
        throw new Error('Gemini API returned an empty message.');
      }

      return {
        type: 'final',
        text: content,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error calling Gemini API:', detail);
      throw new Error(`Failed to get response from Gemini API: ${detail}`);
    }
  }
}

function buildSystemInstruction(options: AskAIOptions): string {
  if (options.ragResults?.length) {
    return [
      '你是一个基于检索结果回答问题的 AI Agent。',
      '请优先使用提供的 Qdrant 检索结果回答用户问题。',
      '只使用和用户问题相关的检索记录；不要为了凑答案而使用明显无关的记录。',
      '回答时尽量列出作者、诗名，并引用或概括相关原文依据。',
      '如果检索结果不足以回答，请明确说明“当前检索结果不足”，然后再给出你的补充判断。',
      '不要编造检索结果中不存在的诗名、作者或内容。',
      '如果仍然需要本地工具辅助，请根据可用工具 schema 选择合适工具；否则直接返回最终答案。',
    ].join('\n');
  }

  return [
    '你是一个可以直接回答问题、也可以调用工具的 AI Agent。',
    '请先判断用户问题是否需要使用提供的工具链。',
    '如果不需要工具，请直接给出简洁准确的最终答案。',
    '如果需要工具，请根据工具名称、用途、输入 schema 和输出说明选择最合适的工具，并返回工具调用。',
    '不要猜测本地环境、文件系统或外部工具结果；这类问题应优先调用可用工具。',
  ].join('\n');
}

function buildContents(userQuestion: string, options: AskAIOptions): string {
  const contextBlocks = [`用户问题：${userQuestion}`];

  if (options.ragResults?.length) {
    contextBlocks.push(
      'Qdrant 检索结果如下：',
      JSON.stringify(formatRagResults(options.ragResults), null, 2),
    );
  }

  if (options.toolResults?.length) {
    contextBlocks.push(
      '已经执行过的工具结果如下。请判断是否还需要继续调用工具；如果信息已足够，请给用户最终回答：',
      JSON.stringify(options.toolResults, null, 2),
    );
  }

  return contextBlocks.join('\n');
}

function formatRagResults(results: QdrantSearchResult[]) {
  return results.map((result, index) => {
    const payload = result.payload || {};

    return {
      rank: index + 1,
      score: result.score,
      id: result.id,
      number: payload.number,
      author: payload.author,
      title: payload.title,
      content: payload.content,
    };
  });
}

function toFunctionDeclarations(
  toolSchemas: ToolFunctionSchema[],
): FunctionDeclaration[] {
  return toolSchemas.map((schema) => ({
    name: schema.name,
    description: `${schema.description}\n输出格式：${schema.outputDescription}`,
    parametersJsonSchema: schema.parametersJsonSchema,
  }));
}

function extractToolCall(response: GeminiResponse): ExtractedToolCall | null {
  const call = response.functionCalls?.[0];

  if (!call?.name) {
    return null;
  }

  return {
    toolName: call.name,
    input: call.args || {},
  };
}

function extractGeminiText(response: GeminiResponse): string {
  return (
    response.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text || '')
      .join('')
      .trim() || ''
  );
}
