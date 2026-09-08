import express from 'express';
import path from 'node:path';
import { ROOT, readJson } from '../shared/paths.js';
import metaRoutes from './routes/meta.js';
import generateRoutes from './routes/generate.js';

const settings = readJson('config/settings.json', { port: 3000 });
const port = process.env.PORT || settings.port || 3000;

const app = express();
app.use(express.json({ limit: '8mb' }));

// API
app.use('/api', metaRoutes);
app.use('/api', generateRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 에디터 정적 파일 ([담당 2] — src/web)
app.use(express.static(path.join(ROOT, 'src/web')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 'error', error: { message: String(err?.message || err) } });
});

app.listen(port, () => {
  console.log(`AI Screen Draft  →  http://localhost:${port}`);
});
