import express from 'express';
import path from 'node:path';
import { ROOT, readJson } from '../shared/paths.js';
import metaRoutes from './routes/meta.js';
import generateRoutes from './routes/generate.js';
import attachmentRoutes, { UPLOAD_DIR } from './routes/attachments.js';

const settings = readJson('config/settings.json', { port: 3000 });
const port = process.env.PORT || settings.port || 3000;

const app = express();
app.use(express.json({ limit: '8mb' }));

// API
app.use('/api', metaRoutes);
app.use('/api', generateRoutes);
app.use('/api', attachmentRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 업로드된 참고 파일
app.use('/uploads', express.static(UPLOAD_DIR));

// 벤더 라이브러리 (화면 → 이미지 복사용)
app.get('/vendor/html2canvas.js', (req, res) =>
  res.sendFile(path.join(ROOT, 'node_modules/html2canvas/dist/html2canvas.min.js')));

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
