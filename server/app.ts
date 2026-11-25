import express from 'express';
import { registerApiRoutes } from './routes.ts';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  registerApiRoutes(app);
  return app;
}
