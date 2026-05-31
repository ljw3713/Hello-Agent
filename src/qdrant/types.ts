export interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown> | null;
}

export interface QdrantEmbeddingResult {
  success: boolean;
  vector: number[];
  error?: string;
}

export interface QdrantSearchResponse {
  success: boolean;
  selectedVectorName?: string;
  expectedVectorSize?: number;
  queryVectorSize?: number;
  results: QdrantSearchResult[];
  error?: string;
}

export interface QdrantQueryResponse {
  collectionName: string;
  query: string;
  embedding: QdrantEmbeddingResult;
  search: QdrantSearchResponse;
}

export interface TextChunk {
  index: number;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddedChunk extends TextChunk {
  vector: number[];
}

export interface ChunkEmbeddingMetric {
  chunkIndex: number;
  characterCount: number;
  vectorSize: number;
  durationMs: number;
}

export interface QdrantImportMetrics {
  totalCharacterCount: number;
  chunkCount: number;
  embeddedChunkCount: number;
  upsertedCount: number;
  chunkingDurationMs: number;
  embeddingDurationMs: number;
  upsertDurationMs: number;
  totalDurationMs: number;
  averageEmbeddingDurationMs: number;
  chunkEmbeddingMetrics: ChunkEmbeddingMetric[];
}

export interface QdrantImportResponse {
  collectionName: string;
  sourceId: string;
  chunks: TextChunk[];
  embeddedChunks: EmbeddedChunk[];
  upsertedCount: number;
  metrics: QdrantImportMetrics;
  logs: string[];
}
