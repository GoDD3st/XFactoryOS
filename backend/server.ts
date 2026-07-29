import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { authRouter } from './routes/auth.routes';
import { reservationsRouter } from './routes/reservations.routes';
import { workspacesRouter } from './routes/workspaces.routes';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'OCP SA XFactory OS Backend API',
      site: 'Safi Site Digital Twin',
      timestamp: new Date().toISOString(),
    });
  });

  // Microservices Express Routers
  app.use('/api/auth', authRouter);
  app.use('/api/reservations', reservationsRouter);
  app.use('/api/workspaces', workspacesRouter);

  // Vite middleware or Static files handler
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OCP XFactory Backend] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
