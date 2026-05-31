import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { QdrantClient } from './qdrantClient.js';
import { chunkText } from './textChunker.js';
import type {
  ChunkEmbeddingMetric,
  EmbeddedChunk,
  QdrantImportMetrics,
  QdrantImportResponse,
  TextChunk,
} from './types.js';

export class QdrantImporter {
  private readonly qdrantClient: QdrantClient;

  constructor() {
    this.qdrantClient = new QdrantClient();
  }

  async importText(content: string): Promise<QdrantImportResponse> {
    const totalStart = performance.now();
    const logs: string[] = [];
    const sourceId = crypto.randomUUID();

    log(
      logs,
      `开始导入文本内容，sourceId=${sourceId}，字符数=${content.length}。`,
    );

    const chunkingStart = performance.now();
    const chunks = this.createChunks(content, logs);
    const chunkingDurationMs = elapsedMs(chunkingStart);

    const embeddingStart = performance.now();
    const { embeddedChunks, chunkEmbeddingMetrics } = await this.embedChunks(
      chunks,
      logs,
    );
    const embeddingDurationMs = elapsedMs(embeddingStart);

    const upsertStart = performance.now();
    const upsertedCount = await this.upsertChunks(
      sourceId,
      embeddedChunks,
      logs,
    );
    const upsertDurationMs = elapsedMs(upsertStart);
    const totalDurationMs = elapsedMs(totalStart);

    const metrics: QdrantImportMetrics = {
      totalCharacterCount: content.length,
      chunkCount: chunks.length,
      embeddedChunkCount: embeddedChunks.length,
      upsertedCount,
      chunkingDurationMs,
      embeddingDurationMs,
      upsertDurationMs,
      totalDurationMs,
      averageEmbeddingDurationMs:
        chunkEmbeddingMetrics.length > 0
          ? embeddingDurationMs / chunkEmbeddingMetrics.length
          : 0,
      chunkEmbeddingMetrics,
    };

    log(logs, `文本切片耗时：${formatMs(chunkingDurationMs)}。`);
    log(
      logs,
      `Embedding 总耗时：${formatMs(embeddingDurationMs)}，平均每个切片 ${formatMs(metrics.averageEmbeddingDurationMs)}。`,
    );
    log(logs, `Qdrant 写入耗时：${formatMs(upsertDurationMs)}。`);
    log(
      logs,
      `文本内容导入完成，共写入 ${upsertedCount} 个切片，总耗时 ${formatMs(totalDurationMs)}。`,
    );

    return {
      collectionName: this.qdrantClient.getCollectionName(),
      sourceId,
      chunks,
      embeddedChunks,
      upsertedCount,
      metrics,
      logs,
    };
  }

  async importMarkdown(markdown: string): Promise<QdrantImportResponse> {
    return this.importText(markdown);
  }

  createChunks(content: string, logs: string[]): TextChunk[] {
    log(logs, '开始文本切片。');
    const chunks = chunkText(content);

    if (!chunks.length) {
      log(logs, '文本切片失败：输入内容为空或无法切片。');
      throw new Error('No chunks generated from imported content.');
    }

    log(logs, `文本切片完成，共生成 ${chunks.length} 个切片。`);
    log(
      logs,
      `切片解析预览：${JSON.stringify(
        chunks.slice(0, 3).map((chunk) => chunk.metadata || chunk.text),
        null,
        2,
      )}`,
    );
    return chunks;
  }

  async embedChunks(
    chunks: TextChunk[],
    logs: string[],
  ): Promise<{
    embeddedChunks: EmbeddedChunk[];
    chunkEmbeddingMetrics: ChunkEmbeddingMetric[];
  }> {
    log(
      logs,
      `待生成 embedding 的切片预览：${JSON.stringify(chunks.map((c) => c.text.slice(0, 30)))}`,
    );
    log(logs, '开始为切片生成 Gemini embedding。');

    const embeddedChunks: EmbeddedChunk[] = [];
    const chunkEmbeddingMetrics: ChunkEmbeddingMetric[] = [];

    for (const chunk of chunks) {
      const start = performance.now();

      try {
        const vector = await this.qdrantClient.embedText(chunk.text);
        const durationMs = elapsedMs(start);
        const logInfo = `切片 ${chunk.index} embedding 成功，字符数=${chunk.text.length}，维度=${vector.length}，耗时=${formatMs(durationMs)}。`;
        log(logs, logInfo);
        embeddedChunks.push({
          ...chunk,
          vector,
        });
        chunkEmbeddingMetrics.push({
          chunkIndex: chunk.index,
          characterCount: chunk.text.length,
          vectorSize: vector.length,
          durationMs,
        });
      } catch (error) {
        const durationMs = elapsedMs(start);
        const detail = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to embed chunk ${chunk.index}: ${detail}`);
        log(
          logs,
          `切片 ${chunk.index} embedding 失败，耗时=${formatMs(durationMs)}：${detail}`,
        );
        throw new Error(`Failed to embed chunk ${chunk.index}: ${detail}`);
      }
    }

    log(logs, `切片 embedding 完成，共 ${embeddedChunks.length} 个。`);
    return {
      embeddedChunks,
      chunkEmbeddingMetrics,
    };
  }

  async upsertChunks(
    sourceId: string,
    embeddedChunks: EmbeddedChunk[],
    logs: string[],
  ): Promise<number> {
    log(logs, '开始写入 Qdrant。');

    try {
      const count = await this.qdrantClient.upsertEmbeddedChunks(
        sourceId,
        embeddedChunks,
      );
      log(logs, `Qdrant 写入完成，共写入 ${count} 个 points。`);
      return count;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      log(logs, ['Qdrant 写入失败，详细信息如下：', detail].join('\n'));
      throw new Error(`Failed to upsert chunks into Qdrant: ${detail}`);
    }
  }
}

function log(logs: string[], message: string): void {
  logs.push(message);
  console.log(message);
}

function elapsedMs(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

function formatMs(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }

  return `${value.toFixed(2)}ms`;
}
