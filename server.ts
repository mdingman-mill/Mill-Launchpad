import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getHealthStatus,
  handleAuthSync,
  handleListInvites,
  handleCreateInvite,
  handleRevokeInvite,
  handleGetInvite,
  handleAcceptInvite,
  handleAdminUpdatePlan,
  handleAdminUpdateRole,
  prepareGeminiGeneration,
  streamGeminiGeneration,
} from './server/backend';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json(getHealthStatus());
});

// Authentication Synchronization Endpoint
app.post('/api/auth/sync', async (req, res) => {
  const result = await handleAuthSync(req.headers.authorization);
  return res.status(result.status).json(result.body);
});

// Invites & Admin Plan/Role Endpoints
app.get('/api/invites', async (req, res) => {
  const result = await handleListInvites(req.headers.authorization);
  return res.status(result.status).json(result.body);
});

app.post('/api/invites', async (req, res) => {
  const result = await handleCreateInvite(req.headers.authorization, req.body);
  return res.status(result.status).json(result.body);
});

app.post('/api/invites/:id/revoke', async (req, res) => {
  const result = await handleRevokeInvite(req.headers.authorization, req.params.id);
  return res.status(result.status).json(result.body);
});

app.get('/api/invites/:id', async (req, res) => {
  const result = await handleGetInvite(req.params.id);
  return res.status(result.status).json(result.body);
});

app.post('/api/invites/:id/accept', async (req, res) => {
  const result = await handleAcceptInvite(req.headers.authorization, req.params.id);
  return res.status(result.status).json(result.body);
});

app.post('/api/admin/users/:userId/plan', async (req, res) => {
  const result = await handleAdminUpdatePlan(req.headers.authorization, req.params.userId, req.body);
  return res.status(result.status).json(result.body);
});

app.post('/api/admin/users/:userId/role', async (req, res) => {
  const result = await handleAdminUpdateRole(req.headers.authorization, req.params.userId, req.body);
  return res.status(result.status).json(result.body);
});

// Marketing Tool Generation Endpoint
app.post('/api/gemini/generate', async (req, res) => {
  const prep = await prepareGeminiGeneration(req.headers.authorization, req.body);
  if (!prep.ok) {
    return res.status(prep.status).json({ error: prep.error });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  await streamGeminiGeneration(prep, sendEvent);
  res.end();
});

// Vite or Static Serving
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Millennium Agency Launchpad server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
