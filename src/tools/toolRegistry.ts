import {
  CountCurrentDirectoryFilesTool,
  ListCurrentDirectoryTool
} from './directoryTools.js';
import type { ToolExecutionResult, ToolFunctionSchema, ToolInterface } from './toolInterface.js';

export class ToolRegistry {
  private readonly tools: Map<string, ToolInterface>;

  constructor(tools: ToolInterface[]) {
    this.tools = new Map(tools.map((tool) => [tool.schema.name, tool]));
  }

  static createDefault(): ToolRegistry {
    return new ToolRegistry([
      new CountCurrentDirectoryFilesTool(),
      new ListCurrentDirectoryTool()
    ]);
  }

  getSchemas(): ToolFunctionSchema[] {
    return [...this.tools.values()].map((tool) => tool.schema);
  }

  async execute(name: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      toolName: name,
      input,
      output: await tool.execute(input)
    };
  }
}
