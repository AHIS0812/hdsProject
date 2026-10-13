// 하이스케치 서버를 Windows 실행 파일(.exe) 하나로 패키징한다.
//
//   node scripts/build-exe.mjs      (또는 npm run build:exe)
//
// 결과물은 release/하이스케치.exe 한 개 — 이 파일만 옮겨서 더블클릭하면 서버가 뜨고 브라우저가
// 자동으로 열린다(Node.js 설치 불필요). 화면 파일(src/web)·데이터(fixtures/config/catalog/schemas)·
// 벤더 스크립트(html2canvas·fflate·pptxgenjs)는 모두 exe 안에 들어 있다.
//
// 동작 원리:
//   1) esbuild 로 src/server/index.js(ESM) + node_modules 의존성을 CJS 파일 하나로 번들
//   2) 그 번들과 읽기 전용 자산을 .build/stage/ 에 모아 두고
//   3) @yao-pkg/pkg 로 Node 런타임 + 번들 + 자산을 exe 하나로 묶음(자산은 exe 안 스냅숏 파일시스템)
//   exe 안은 읽기 전용이라, 감사 로그(runs/)와 .env 는 exe 가 있는 폴더를 기준으로 한다
//   (src/shared/paths.js 의 ROOT / ASSET_ROOT).

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'release');
const BUILD_DIR = path.join(ROOT, '.build');
const STAGE = path.join(BUILD_DIR, 'stage');
const EXE_NAME = '하이스케치.exe';

function must(relPath) {
  const p = path.join(ROOT, relPath);
  if (!existsSync(p)) throw new Error(`빌드에 필요한 파일이 없습니다: ${relPath}`);
  return p;
}

console.log('[1/4] 이전 빌드 정리...');
rmSync(OUT, { recursive: true, force: true });
rmSync(BUILD_DIR, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
mkdirSync(OUT, { recursive: true });

console.log('[2/4] 서버 코드를 하나의 파일로 묶는 중(esbuild)...');
await build({
  entryPoints: [must('src/server/index.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.join(STAGE, 'server.cjs'),
  logLevel: 'info',
});

console.log('[3/4] exe 안에 넣을 자산 정리 중...');
const ASSET_DIRS = ['src/web', 'fixtures', 'config', 'catalog', 'schemas'];
for (const dir of ASSET_DIRS) {
  cpSync(must(dir), path.join(STAGE, dir), { recursive: true });
}
mkdirSync(path.join(STAGE, 'vendor'), { recursive: true });
copyFileSync(must('node_modules/html2canvas/dist/html2canvas.min.js'), path.join(STAGE, 'vendor/html2canvas.min.js'));
copyFileSync(must('node_modules/fflate/umd/index.js'), path.join(STAGE, 'vendor/fflate.js'));
copyFileSync(must('node_modules/pptxgenjs/dist/pptxgen.bundle.js'), path.join(STAGE, 'vendor/pptxgen.bundle.js'));

// node20 은 이 pkg 버전 기준 Windows 사전 빌드 바이너리가 없어(소스 빌드 필요, 별도 C++ 빌드
// 도구 필요) node22 로 맞춘다 — 이 프로젝트엔 node20 전용 문법이 없어 호환에 문제없다.
writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
  name: 'hisketch',
  version: '0.0.0',
  bin: 'server.cjs',
  pkg: {
    assets: [...ASSET_DIRS.map((d) => `${d}/**/*`), 'vendor/**/*'],
    targets: ['node22-win-x64'],
  },
}, null, 2));

console.log('[4/4] 실행 파일로 패키징하는 중(pkg, 처음 실행하면 Node 런타임을 내려받아 시간이 걸릴 수 있음)...');
const exePath = path.join(OUT, EXE_NAME);
execFileSync('npx', ['@yao-pkg/pkg', STAGE, '--output', exePath], { stdio: 'inherit', cwd: ROOT, shell: true });

console.log(`\n완료 → ${exePath}`);
console.log('이 exe 파일 하나만 옮겨서 더블클릭하면 실행됩니다 (감사 로그는 exe 옆 runs/ 폴더에 쌓입니다).');
