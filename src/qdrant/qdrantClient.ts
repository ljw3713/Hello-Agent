import crypto from 'node:crypto';

import { QdrantClient as QdrantRestClient } from '@qdrant/js-client-rest';

import { GeminiEmbeddingClient } from './embeddingClient.js';
import type { EmbeddedChunk, QdrantQueryResponse, QdrantSearchResult } from './types.js';

export class QdrantClient {
  private readonly client: QdrantRestClient;
  private readonly collectionName: string;
  private readonly embeddingClient: GeminiEmbeddingClient;
  private readonly limit: number;
  private readonly vectorName?: string;

  constructor() {
    this.client = new QdrantRestClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY || undefined,
    });
    this.collectionName = process.env.QDRANT_COLLECTION || 'hello_agent_docs';
    console.log(
      `QdrantClient initialized with collection: ${this.collectionName}`,
    );
    this.embeddingClient = new GeminiEmbeddingClient();
    this.limit = Number(process.env.QDRANT_SEARCH_LIMIT || 5);
    this.vectorName = process.env.QDRANT_VECTOR_NAME || undefined;
  }

  getCollectionName(): string {
    return this.collectionName;
  }

  async embedText(text: string): Promise<number[]> {
    return this.embeddingClient.embed(text);
  }

  async upsertEmbeddedChunks(
    sourceId: string,
    embeddedChunks: EmbeddedChunk[],
  ): Promise<number> {
    const firstVector = embeddedChunks[0]?.vector;

    if (!firstVector?.length) {
      throw new Error('Cannot upsert chunks because no vectors were generated.');
    }

    const vectorConfig = await this.ensureCollection(firstVector.length);
    const selectedVectorName = this.vectorName || vectorConfig.vectorName;

    const points = embeddedChunks.map((chunk) => ({
      id: createPointId(`${sourceId}:${chunk.index}`),
      vector: selectedVectorName
        ? {
            [selectedVectorName]: chunk.vector,
          }
        : chunk.vector,
      payload: {
        sourceId,
        chunkIndex: chunk.index,
        text: chunk.text,
        ...chunk.metadata,
        importedAt: new Date().toISOString(),
      },
    }));

    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points,
      });
    } catch (error) {
      const context = {
        collectionName: this.collectionName,
        selectedVectorName: selectedVectorName || null,
        expectedVectorSize: vectorConfig.size || null,
        pointCount: points.length,
        firstPointPreview: points[0]
          ? {
              id: points[0].id,
              vectorShape: describeVectorShape(points[0].vector),
              payloadKeys: Object.keys(points[0].payload),
              textPreview: String(points[0].payload.text).slice(0, 120),
            }
          : null,
      };

      throw new Error(
        [
          'Qdrant upsert request failed.',
          `Context: ${JSON.stringify(context, null, 2)}`,
          `Qdrant error: ${formatErrorDetail(error)}`,
        ].join('\n'),
      );
    }

    return points.length;
  }

  async querySimilar(text: string): Promise<QdrantQueryResponse> {
    let vector: number[];

    try {
      vector = await this.embeddingClient.embed(text);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Qdrant embedding failed: ${detail}`);

      return {
        collectionName: this.collectionName,
        query: text,
        embedding: {
          success: false,
          vector: [],
          error: detail,
        },
        search: {
          success: false,
          results: [],
          error: 'Skipped Qdrant search because embedding generation failed.',
        },
      };
    }

    try {
      const vectorConfig = await this.getVectorConfig();
      const selectedVectorName = this.vectorName || vectorConfig.vectorName;

      if (vectorConfig.size && vector.length !== vectorConfig.size) {
        return {
          collectionName: this.collectionName,
          query: text,
          embedding: {
            success: true,
            vector,
          },
          search: {
            success: false,
            selectedVectorName,
            expectedVectorSize: vectorConfig.size,
            queryVectorSize: vector.length,
            results: [],
            error: `Vector dimension mismatch. Collection expects ${vectorConfig.size}, but query vector has ${vector.length}.`,
          },
        };
      }

      const points = await this.client.search(this.collectionName, {
        vector: selectedVectorName
          ? {
              name: selectedVectorName,
              vector,
            }
          : vector,
        limit: this.limit,
        with_payload: true,
        with_vector: false,
      });

      return {
        collectionName: this.collectionName,
        query: text,
        embedding: {
          success: true,
          vector,
        },
        search: {
          success: true,
          selectedVectorName,
          expectedVectorSize: vectorConfig.size,
          queryVectorSize: vector.length,
          results: points.map<QdrantSearchResult>((point) => ({
            id: point.id,
            score: point.score,
            payload: normalizePayload(point.payload),
          })),
        },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Qdrant search failed: ${detail}`);

      return {
        collectionName: this.collectionName,
        query: text,
        embedding: {
          success: true,
          vector,
        },
        search: {
          success: false,
          queryVectorSize: vector.length,
          results: [],
          error: detail,
        },
      };
    }
  }

  private async getVectorConfig(): Promise<{
    vectorName?: string;
    size?: number;
  }> {
    const collection = await this.client.getCollection(this.collectionName);
    const vectorsConfig = collection.config.params.vectors;

    if (!vectorsConfig) {
      return {};
    }

    if ('size' in vectorsConfig && typeof vectorsConfig.size === 'number') {
      return {
        size: vectorsConfig.size,
      };
    }

    const vectorEntries = Object.entries(vectorsConfig);
    const preferredEntry = this.vectorName
      ? vectorEntries.find(([name]) => name === this.vectorName)
      : vectorEntries[0];

    if (!preferredEntry) {
      return {};
    }

    return {
      vectorName: preferredEntry[0],
      size: readVectorSize(preferredEntry[1]),
    };
  }

  private async ensureCollection(vectorSize: number): Promise<{
    vectorName?: string;
    size?: number;
  }> {
    try {
      const vectorConfig = await this.getVectorConfig();

      if (vectorConfig.size && vectorConfig.size !== vectorSize) {
        throw new Error(
          `Collection vector size mismatch. Collection expects ${vectorConfig.size}, but import vector has ${vectorSize}.`,
        );
      }

      return vectorConfig;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';

      if (!isNotFoundError(detail)) {
        throw error;
      }

      const vectors = this.vectorName
        ? {
            [this.vectorName]: {
              size: vectorSize,
              distance: 'Cosine' as const,
            },
          }
        : {
            size: vectorSize,
            distance: 'Cosine' as const,
          };

      await this.client.createCollection(this.collectionName, {
        vectors,
      });

      return {
        vectorName: this.vectorName,
        size: vectorSize,
      };
    }
  }
}

function createPointId(value: string): string {
  const hash = crypto.createHash('sha256').update(value).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') +
      hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-');
}

function isNotFoundError(message: string): boolean {
  return /not found|404/i.test(message);
}

function readVectorSize(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || !('size' in value)) {
    return undefined;
  }

  const size = (value as { size?: unknown }).size;
  return typeof size === 'number' ? size : undefined;
}

function normalizePayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

function describeVectorShape(vector: unknown): Record<string, unknown> {
  if (Array.isArray(vector)) {
    return {
      mode: 'single',
      size: vector.length,
    };
  }

  if (!vector || typeof vector !== 'object') {
    return {
      mode: typeof vector,
    };
  }

  return {
    mode: 'named',
    names: Object.keys(vector),
    sizes: Object.fromEntries(
      Object.entries(vector).map(([name, value]) => [
        name,
        Array.isArray(value) ? value.length : null,
      ]),
    ),
  };
}

function formatErrorDetail(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error);
  }

  const errorObject = error as Record<string, unknown>;
  const details: Record<string, unknown> = {
    name: error instanceof Error ? error.name : errorObject.name,
    message: error instanceof Error ? error.message : errorObject.message,
  };

  for (const key of ['status', 'statusText', 'data', 'url', 'retry_after']) {
    if (key in errorObject) {
      details[key] = errorObject[key];
    }
  }

  if ('cause' in errorObject) {
    details.cause = errorObject.cause;
  }

  return JSON.stringify(details, null, 2);
}
