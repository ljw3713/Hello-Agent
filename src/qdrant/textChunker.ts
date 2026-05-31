import type { TextChunk } from './types.js';

interface PoemChunk extends Record<string, unknown> {
  number: string;
  author: string;
  title: string;
  content: string;
}

export function chunkText(text: string): TextChunk[] {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();

  if (!normalizedText) {
    return [];
  }

  return parsePoems(normalizedText).map((poem, index) => ({
    index,
    text: JSON.stringify(poem, null, 2),
    metadata: poem,
  }));
}

function parsePoems(text: string): PoemChunk[] {
  const poemStartPattern = /^(\d{3})([^：:\n]+)[：:](.+)$/gm;
  const matches = [...text.matchAll(poemStartPattern)];

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? text.length;
      const block = text.slice(start, end).trim();
      const lines = block.split('\n');
      const header = lines[0]?.trim() || '';
      const headerMatch = header.match(/^(\d{3})([^：:\n]+)[：:](.+)$/);

      if (!headerMatch) {
        return null;
      }

      return {
        number: headerMatch[1],
        author: headerMatch[2].trim(),
        title: headerMatch[3].trim(),
        content: lines.slice(1).join('\n').trim(),
      };
    })
    .filter((poem): poem is PoemChunk => Boolean(poem));
}
