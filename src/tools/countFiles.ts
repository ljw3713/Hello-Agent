import { readdir } from 'node:fs/promises';

export async function countFilesInCurrentDirectory(): Promise<number> {
  const entries = await readdir(process.cwd(), { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).length;
}
