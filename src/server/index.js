import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
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

// 벤더 라이브러리 — 패키징된 .exe 배포본은 node_modules 가 없으므로 exe 옆의 vendor/ 를 먼저
// 찾고, 없으면(보통 실행 = npm 으로 설치된 상태) node_modules 에서 그대로 서빙한다.
const useLocalVendor = existsSync(path.join(ROOT, 'vendor'));
const html2canvasPath = useLocalVendor
  ? path.join(ROOT, 'vendor/html2canvas.min.js')
  : path.join(ROOT, 'node_modules/html2canvas/dist/html2canvas.min.js');
const fflatePath = useLocalVendor
  ? path.join(ROOT, 'vendor/fflate.js')
  : path.join(ROOT, 'node_modules/fflate/umd/index.js');
app.get('/vendor/html2canvas.js', (req, res) => res.sendFile(html2canvasPath));
app.get('/vendor/fflate.js', (req, res) => res.sendFile(fflatePath));

// 에디터 정적 파일 (src/web)
app.use(express.static(path.join(ROOT, 'src/web')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 'error', error: { message: String(err?.message || err) } });
});

app.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`하이스케치  →  ${url}`);
  // .exe 로 패키징된 배포본만 자동으로 브라우저를 연다(npm run dev 를 반복 실행할 때마다
  // 매번 새 탭이 뜨면 개발 중엔 오히려 거슬려서, 평소 node 실행에서는 켜지 않는다).
  if (typeof process.pkg !== 'undefined') {
    exec(`start "" "${url}"`, () => {});
  }
});
