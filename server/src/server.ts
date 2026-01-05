import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sourceRoutes } from './routes/source.js';
import { metaRoutes } from './routes/meta.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Environment variables
const PROXY_URL = process.env.PROXY_URL || 'https://simple-proxy.eyus00.workers.dev';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '50404130561567acf3e0725aeb09ec5d';

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Store config in request for routes to access
app.use((req: Request, res: Response, next: NextFunction) => {
  (req as any).config = {
    proxyUrl: PROXY_URL,
    tmdbApiKey: TMDB_API_KEY,
    tmdbBaseUrl: 'https://api.themoviedb.org/3'
  };
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// API Routes
app.use('/api/sources', sourceRoutes);
app.use('/api/meta', metaRoutes);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🎬 Movie Player Server running on http://localhost:${PORT}`);
  console.log(`   Proxy URL: ${PROXY_URL}`);
  console.log(`   TMDB API Key: ${TMDB_API_KEY ? '✓ Configured' : '✗ Missing'}`);
});
