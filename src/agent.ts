import type { AIClientInterface } from './aiClients/aiClientInterface.js';
import { GeminiClient } from './aiClients/geminiClient.js';
import { ExecutionLogger } from './logger.js';
import { QdrantClient } from './qdrant/index.js';
import { ToolRegistry } from './tools/toolRegistry.js';

export interface AgentResult {
  userMessage: string;
  finalAnswer: string;
  aiResultType: 'final' | 'tool_call';
  toolCalls: string[];
  toolResults: unknown[];
  ragResults: unknown[];
  logs: string[];
}

const MAX_TOOL_ROUNDS = 5;

export async function runAgent(userMessage: string): Promise<AgentResult> {
  const logger = new ExecutionLogger();
  const toolRegistry = ToolRegistry.createDefault();
  const aiClient: AIClientInterface = new GeminiClient();
  const qdrantClient = new QdrantClient();
  const toolResults = [];
  const toolCalls: string[] = [];

  logger.log(`收到用户问题：${userMessage}`);

  logger.log(
    `开始查询 Qdrant，相似检索请求：${JSON.stringify({ query: userMessage })}`,
  );
  const qdrantResponse = await qdrantClient.querySimilar(userMessage);
  logger.log(`Qdrant 查询 collection：${qdrantResponse.collectionName}`);

  if (qdrantResponse.embedding.success) {
    logger.log('Embedding 生成成功。');
  } else {
    logger.log(`Embedding 生成失败：${qdrantResponse.embedding.error}`);
  }

  logger.log(
    `Embedding 向量值：${qdrantResponse.embedding.vector.length ? JSON.stringify(qdrantResponse.embedding.vector) : '未生成向量'}`,
  );

  if (qdrantResponse.search.success) {
    logger.log('Qdrant 相似检索成功。');
  } else {
    logger.log(`Qdrant 相似检索失败：${qdrantResponse.search.error}`);
  }

  logger.log(
    `Qdrant 向量配置：${JSON.stringify({
      selectedVectorName: qdrantResponse.search.selectedVectorName || null,
      expectedVectorSize: qdrantResponse.search.expectedVectorSize || null,
      queryVectorSize: qdrantResponse.search.queryVectorSize || qdrantResponse.embedding.vector.length,
    })}`,
  );

  logger.log(
    `Qdrant 查询结果：${JSON.stringify(qdrantResponse.search.results, null, 2)}`,
  );

  const toolSchemas = toolRegistry.getSchemas();
  logger.log(
    `根据已注册工具生成 tool function schema，共 ${toolSchemas.length} 个。`,
  );

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round += 1) {
    logger.log(`第 ${round} 轮调用 AI，判断是否直接回答或继续调用工具。`);

    const aiResult = await aiClient.AskAI(userMessage, {
      toolSchemas,
      ragResults: qdrantResponse.search.results,
      toolResults,
      log: (message) => logger.log(message),
    });

    if (aiResult.type === 'final') {
      logger.log(`第 ${round} 轮 AI 返回最终答案。`);

      const result: AgentResult = {
        userMessage,
        finalAnswer: aiResult.text,
        aiResultType: toolResults.length > 0 ? 'tool_call' : 'final',
        toolCalls: toolCalls.length > 0 ? toolCalls : ['未调用工具'],
        toolResults,
        ragResults: qdrantResponse.search.results,
        logs: logger.all(),
      };
      //console.log('Agent execution result:', JSON.stringify(result, null, 2));
      return result;
    }

    const { toolCall } = aiResult;
    const toolCallText = `${toolCall.toolName}(${JSON.stringify(toolCall.input)})`;
    toolCalls.push(toolCallText);
    logger.log(`第 ${round} 轮 AI 请求调用工具：${toolCallText}。`);

    const toolResult = await toolRegistry.execute(
      toolCall.toolName,
      toolCall.input,
    );
    toolResults.push(toolResult);
    logger.log(`第 ${round} 轮工具执行完成：${toolResult.toolName}。`);
  }

  logger.log(`达到最大工具调用轮数 ${MAX_TOOL_ROUNDS}，停止执行。`);
  throw new Error(
    `Agent stopped after ${MAX_TOOL_ROUNDS} tool rounds without a final answer.`,
  );
}
