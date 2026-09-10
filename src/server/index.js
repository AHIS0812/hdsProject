import express from 'express';
import path from 'node:path';
import { ROOT, readJson } from '../shared/paths.js';
import metaRoutes from './routes/meta.js';
import generateRoutes from './routes/generate.js';

const settings = readJson('config/settings.json', { port: 3000 });
const port = process.env.PORT || settings.port || 3000;

const app = express();
app.use(express.json({ limit: '25mb' })); // payload 에 이미지(data URL)가 포함될 수 있음

// API
app.use('/api', metaRoutes);
app.use('/api', generateRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 벤더 라이브러리
app.get('/vendor/html2canvas.js', (req, res) =>
  res.sendFile(path.join(ROOT, 'node_modules/html2canvas/dist/html2canvas.min.js')));
app.get('/vendor/fflate.js', (req, res) =>
  res.sendFile(path.join(ROOT, 'node_modules/fflate/umd/index.js')));

// 에디터 정적 파일 (src/web)
app.use(express.static(path.join(ROOT, 'src/web')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 'error', error: { message: String(err?.message || err) } });
});

app.listen(port, () => {
  console.log(`하이스케치  →  http://localhost:${port}`);
});
