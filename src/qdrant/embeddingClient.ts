import { GoogleGenAI } from '@google/genai';

import { logGeminiEmbeddingTokenUsage } from '../aiClients/geminiUsageLogger.js';

export class GeminiEmbeddingClient {
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly outputDimensionality?: number;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Missing GEMINI_API_KEY. Please add it to your .env file.',
      );
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
    this.outputDimensionality = process.env.GEMINI_EMBEDDING_DIMENSION
      ? Number(process.env.GEMINI_EMBEDDING_DIMENSION)
      : undefined;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.ai.models.embedContent({
      model: this.model,
      contents: [text],
      config: this.outputDimensionality
        ? {
            outputDimensionality: this.outputDimensionality,
          }
        : undefined,
    });
    logGeminiEmbeddingTokenUsage('embedContent:qdrant', response);

    const vector = response.embeddings?.[0]?.values;

    if (!vector?.length) {
      throw new Error('Gemini embedding API returned an empty vector.');
    }

    return vector;
  }
}
