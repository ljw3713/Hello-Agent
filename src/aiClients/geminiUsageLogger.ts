interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  responseTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  trafficType?: string;
}

interface GeminiUsageResponse {
  usageMetadata?: GeminiUsageMetadata;
}

interface GeminiEmbeddingResponse {
  metadata?: {
    billableCharacterCount?: number;
  };
}

export function logGeminiTokenUsage(
  source: string,
  response: GeminiUsageResponse,
  log: (message: string) => void = console.log,
): void {
  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 'N/A';
  const outputTokens =
    usage?.candidatesTokenCount ?? usage?.responseTokenCount ?? 'N/A';
  const totalTokens = usage?.totalTokenCount ?? 'N/A';
  const thoughtsTokens = usage?.thoughtsTokenCount ?? 'N/A';
  const toolUseTokens = usage?.toolUsePromptTokenCount ?? 'N/A';
  const trafficType = usage?.trafficType ?? 'N/A';

  log(
    [
      `Gemini token usage [${source}]：`,
      `inputTokens=${inputTokens}`,
      `outputTokens=${outputTokens}`,
      `totalTokens=${totalTokens}`,
      `thoughtsTokens=${thoughtsTokens}`,
      `toolUseTokens=${toolUseTokens}`,
      'remainingQuota=N/A',
      `trafficType=${trafficType}`,
    ].join(' '),
  );
}

export function logGeminiEmbeddingTokenUsage(
  source: string,
  response: GeminiEmbeddingResponse,
  log: (message: string) => void = console.log,
): void {
  const billableCharacters =
    response.metadata?.billableCharacterCount ?? 'N/A';

  log(
    [
      `Gemini token usage [${source}]：`,
      'inputTokens=N/A',
      'outputTokens=N/A',
      'totalTokens=N/A',
      'remainingQuota=N/A',
      `billableCharacters=${billableCharacters}`,
    ].join(' '),
  );
}
