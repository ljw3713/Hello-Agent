import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAgent } from './agent.js';
import { GeminiImageClient } from './aiClients/geminiImageClient.js';
import { QdrantImporter } from './qdrant/index.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');

app.use(express.json({ limit: '120mb' }));
app.use(express.static(publicDir));

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const result = await runAgent(message);
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Agent failed to process the request', detail });
  }
});

app.post('/api/import', async (req, res) => {
  const content =
    typeof req.body?.content === 'string'
      ? req.body.content.trim()
      : typeof req.body?.markdown === 'string'
        ? req.body.markdown.trim()
        : '';

  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  try {
    const importer = new QdrantImporter();
    const result = await importer.importText(content);
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to import content into Qdrant', detail });
  }
});

app.post('/api/image-recognition', async (req, res) => {
  const fileName =
    typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
  const mimeType =
    typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim() : '';
  const base64Data =
    typeof req.body?.base64Data === 'string'
      ? req.body.base64Data.trim()
      : '';
  const prompt =
    typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const sizeBytes =
    typeof req.body?.sizeBytes === 'number' ? req.body.sizeBytes : 0;

  if (!fileName) {
    res.status(400).json({ error: 'fileName is required' });
    return;
  }

  if (!mimeType) {
    res.status(400).json({ error: 'mimeType is required' });
    return;
  }

  if (!base64Data) {
    res.status(400).json({ error: 'base64Data is required' });
    return;
  }

  if (!sizeBytes) {
    res.status(400).json({ error: 'sizeBytes is required' });
    return;
  }

  try {
    const imageClient = new GeminiImageClient();
    const result = await imageClient.recognizeImage({
      fileName,
      mimeType,
      sizeBytes,
      base64Data,
      prompt,
    });
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to recognize image', detail });
  }
});

app.listen(port, () => {
  console.log(`Hello Agent is running at http://localhost:${port}`);
});
