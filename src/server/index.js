import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { ROOT, readJson } from '../shared/paths.js';
import metaRoutes from './routes/meta.js';
import generateRoutes from './routes/generate.js';

// .env 가 있으면 읽는다(PORT 만 쓴다). README·안내문구가 .env 의 PORT 를 안내하는데 실제로는 아무도
// 읽지 않던 문제 — Node 20.12+ 의 process.loadEnvFile 을 쓰고, 없거나 파일이 없으면 조용히 넘어간다.
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* .env 없음 */ }

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
const pptxgenPath = useLocalVendor
  ? path.join(ROOT, 'vendor/pptxgen.bundle.js')
  : path.join(ROOT, 'node_modules/pptxgenjs/dist/pptxgen.bundle.js');
// 벤더 파일이 빠져 있으면(npm install 누락 등) 해당 기능(이미지 복사·zip·PPT 산출물)만 조용히 404 로
// 죽어서 원인을 찾기 어려웠다 — 부팅할 때 한 번 알려 준다.
for (const [name, p] of [['html2canvas', html2canvasPath], ['fflate', fflatePath], ['pptxgenjs', pptxgenPath]]) {
  if (!existsSync(p)) console.warn(`[경고] ${name} 파일이 없습니다 (${p}) — npm install 을 실행하세요.`);
}
app.get('/vendor/html2canvas.js', (req, res) => res.sendFile(html2canvasPath));
app.get('/vendor/fflate.js', (req, res) => res.sendFile(fflatePath));
app.get('/vendor/pptxgen.js', (req, res) => res.sendFile(pptxgenPath));

// 에디터 정적 파일 (src/web)
app.use(express.static(path.join(ROOT, 'src/web')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  // body-parser 의 잘못된 JSON(400)·용량 초과(413)도 500 으로 뭉개지 않고 원래 상태코드를 유지한다
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ status: 'error', error: { message: String(err?.message || err) } });
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
