import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import apiHandler from './api/index.js';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // Mount JSON-RPC /api endpoint
  app.all(['/api', '/api/*'], async (req, res) => {
    try {
      await apiHandler(req, res);
    } catch (err) {
      console.error('Unhandled server error on /api:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: (err as Error).message || 'Server error' });
      }
    }
  });

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
