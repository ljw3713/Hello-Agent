export interface ToolFunctionSchema {
  name: string;
  description: string;
  parametersJsonSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  outputDescription: string;
}

export interface ToolExecutionResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
}

export interface ToolInterface<TInput extends object = Record<string, unknown>, TOutput = unknown> {
  readonly schema: ToolFunctionSchema;

  execute(input: TInput): Promise<TOutput>;
}
