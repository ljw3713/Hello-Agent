import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { ToolInterface, ToolFunctionSchema } from './toolInterface.js';

interface CountFilesInput {
  includeHidden?: boolean;
}

interface CountFilesOutput {
  directory: string;
  fileCount: number;
}

interface ListDirectoryInput {
  includeHidden?: boolean;
}

interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'other';
}

interface ListDirectoryOutput {
  directory: string;
  totalFiles: number;
  totalDirectories: number;
  entries: DirectoryEntry[];
}

export class CountCurrentDirectoryFilesTool
  implements ToolInterface<CountFilesInput, CountFilesOutput>
{
  readonly schema: ToolFunctionSchema = {
    name: 'count_current_directory_files',
    description: '统计当前项目运行目录下的文件数量。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        includeHidden: {
          type: 'boolean',
          description: '是否统计以点号开头的隐藏文件。默认 false。'
        }
      }
    },
    outputDescription:
      '返回当前运行目录的绝对路径和该目录第一层级内的文件数量。'
  };

  async execute(input: CountFilesInput): Promise<CountFilesOutput> {
    const entries = await readVisibleEntries(Boolean(input.includeHidden));

    return {
      directory: process.cwd(),
      fileCount: entries.filter((entry) => entry.isFile()).length
    };
  }
}

export class ListCurrentDirectoryTool
  implements ToolInterface<ListDirectoryInput, ListDirectoryOutput>
{
  readonly schema: ToolFunctionSchema = {
    name: 'list_current_directory',
    description: '查询当前项目运行目录第一层级的文件和文件夹结构。',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        includeHidden: {
          type: 'boolean',
          description: '是否包含以点号开头的隐藏文件或文件夹。默认 false。'
        }
      }
    },
    outputDescription:
      '返回当前运行目录的绝对路径、文件数量、文件夹数量，以及第一层级条目列表。'
  };

  async execute(input: ListDirectoryInput): Promise<ListDirectoryOutput> {
    const entries = await readVisibleEntries(Boolean(input.includeHidden));
    const mappedEntries = entries.map<DirectoryEntry>((entry) => ({
      name: entry.name,
      type: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other'
    }));

    return {
      directory: process.cwd(),
      totalFiles: mappedEntries.filter((entry) => entry.type === 'file').length,
      totalDirectories: mappedEntries.filter((entry) => entry.type === 'directory').length,
      entries: mappedEntries.sort((a, b) => a.name.localeCompare(b.name))
    };
  }
}

async function readVisibleEntries(includeHidden: boolean) {
  const entries = await readdir(process.cwd(), { withFileTypes: true });
  const visibleEntries = includeHidden
    ? entries
    : entries.filter((entry) => !entry.name.startsWith('.'));

  return visibleEntries.filter((entry) => path.basename(entry.name) !== 'node_modules');
}
