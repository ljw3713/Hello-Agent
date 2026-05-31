import { GoogleGenAI } from '@google/genai';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { logGeminiTokenUsage } from './geminiUsageLogger.js';

const INLINE_IMAGE_LIMIT_BYTES = 20 * 1024 * 1024;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
      }>;
    };
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

export interface RecognizeImageInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
  prompt: string;
}

export interface RecognizeImageResult {
  answer: string;
  uploadMode: 'inline' | 'file_api';
  model: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  logs: string[];
}

export class GeminiImageClient {
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
    this.model =
      process.env.GEMINI_VISION_MODEL ||
      process.env.GEMINI_MODEL ||
      'gemini-3.1-flash-lite';
  }

  async recognizeImage(input: RecognizeImageInput): Promise<RecognizeImageResult> {
    const logs: string[] = [];
    const startedAt = performance.now();
    const prompt = input.prompt.trim() || '请识别并描述这张图片。';

    log(logs, `收到图片识别请求：${input.fileName}`);
    log(logs, `图片 MIME：${input.mimeType}`);
    log(logs, `图片大小：${input.sizeBytes} bytes`);
    log(logs, `使用 Gemini model：${this.model}`);

    if (!input.mimeType.startsWith('image/')) {
      throw new Error(`Unsupported file type: ${input.mimeType}`);
    }

    if (input.sizeBytes < INLINE_IMAGE_LIMIT_BYTES) {
      log(logs, '图片小于 20MB，使用 inlineData 方式提交给 Gemini。');
      const answer = await this.recognizeWithInlineData(input, prompt, logs);
      log(logs, `Gemini 图片识别完成，耗时 ${formatDuration(startedAt)}。`);

      return {
        answer,
        uploadMode: 'inline',
        model: this.model,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        logs,
      };
    }

    log(logs, '图片大于等于 20MB，使用 Gemini Files API 上传后再识别。');
    const answer = await this.recognizeWithFileApi(input, prompt, logs);
    log(logs, `Gemini 图片识别完成，耗时 ${formatDuration(startedAt)}。`);

    return {
      answer,
      uploadMode: 'file_api',
      model: this.model,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      logs,
    };
  }

  private async recognizeWithInlineData(
    input: RecognizeImageInput,
    prompt: string,
    logs: string[],
  ): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [
        {
          inlineData: {
            mimeType: input.mimeType,
            data: input.base64Data,
          },
        },
        {
          text: prompt,
        },
      ],
      config: {
        temperature: 0.2,
      },
    });
    logGeminiTokenUsage('generateContent:image-inline', response, (message) =>
      log(logs, message),
    );

    return extractGeminiText(response);
  }

  private async recognizeWithFileApi(
    input: RecognizeImageInput,
    prompt: string,
    logs: string[],
  ): Promise<string> {
    let tempFilePath = '';

    try {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hello-agent-image-'));
      tempFilePath = path.join(
        tempDir,
        `${crypto.randomUUID()}${getFileExtension(input.fileName, input.mimeType)}`,
      );

      await fs.writeFile(tempFilePath, Buffer.from(input.base64Data, 'base64'));
      log(logs, `临时文件已写入：${tempFilePath}`);

      const uploadedFile = await this.ai.files.upload({
        file: tempFilePath,
        config: {
          mimeType: input.mimeType,
          displayName: input.fileName,
        },
      });

      log(logs, `Gemini Files API 上传完成：${uploadedFile.name || '-'}`);
      log(logs, `Gemini Files API file uri：${uploadedFile.uri || '-'}`);
      log(logs, `Gemini Files API file state：${uploadedFile.state || '-'}`);
      log(
        logs,
        'Gemini token usage [files.upload:image]： inputTokens=N/A outputTokens=N/A totalTokens=N/A remainingQuota=N/A',
      );

      if (!uploadedFile.uri) {
        throw new Error('Gemini Files API did not return a file uri.');
      }

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [
          {
            fileData: {
              fileUri: uploadedFile.uri,
              mimeType: uploadedFile.mimeType || input.mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
        config: {
          temperature: 0.2,
        },
      });
      logGeminiTokenUsage('generateContent:image-file-api', response, (message) =>
        log(logs, message),
      );

      return extractGeminiText(response);
    } finally {
      if (tempFilePath) {
        await fs.rm(path.dirname(tempFilePath), {
          recursive: true,
          force: true,
        });
        log(logs, '临时文件已清理。');
      }
    }
  }
}

function log(logs: string[], message: string): void {
  logs.push(message);
  console.log(message);
}

function extractGeminiText(response: GeminiResponse): string {
  const text =
    response.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text || '')
      .join('')
      .trim() || '';

  if (!text) {
    throw new Error('Gemini API returned an empty image recognition result.');
  }

  return text;
}

function formatDuration(startedAt: number): string {
  return `${Math.round(performance.now() - startedAt)}ms`;
}

function getFileExtension(fileName: string, mimeType: string): string {
  const extension = path.extname(fileName);

  if (extension) {
    return extension;
  }

  if (mimeType === 'image/jpeg') {
    return '.jpg';
  }

  if (mimeType === 'image/png') {
    return '.png';
  }

  if (mimeType === 'image/webp') {
    return '.webp';
  }

  if (mimeType === 'image/gif') {
    return '.gif';
  }

  return '.image';
}
