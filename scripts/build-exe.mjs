// 하이스케치 서버를 Windows 실행 파일(.exe) 하나로 패키징한다.
//
//   node scripts/build-exe.mjs
//
// 결과물은 release/ 폴더 — 이 폴더를 통째로 옮기면 그대로 실행된다(Node.js 설치 불필요).
//   release/
//     하이스케치.exe        더블클릭하면 서버가 뜨고 브라우저가 자동으로 열린다
//     src/web/              에디터 정적 파일 (수정 가능)
//     fixtures/ config/ catalog/ schemas/   데이터·정책·스키마 (수정 가능)
//     vendor/                html2canvas·fflate·pptxgenjs (브라우저에서 쓰는 벤더 스크립트)
//
// 동작 원리:
//   1) esbuild 로 src/server/index.js(ESM) + node_modules 의존성을 CJS 파일 하나로 번들
//   2) @yao-pkg/pkg 로 그 번들 + Node 런타임을 실행 파일 하나로 묶음
//   3) fixtures/config/catalog/schemas/src/web 은 exe 안에 넣지 않고 옆에 그대로 복사해 둔다
//      (열어보거나 고치기 쉽게, readJson()/express.static() 이 그대로 동작하도록 —
//      src/shared/paths.js 의 ROOT 가 패키징 모드에선 exe 가 있는 폴더를 가리킨다).

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'release');
const BUILD_DIR = path.join(ROOT, '.build');
const BUNDLE = path.join(BUILD_DIR, 'server.cjs');

function must(relPath) {
  const p = path.join(ROOT, relPath);
  if (!existsSync(p)) throw new Error(`빌드에 필요한 파일이 없습니다: ${relPath}`);
  return p;
}

console.log('[1/4] 이전 빌드 정리...');
rmSync(OUT, { recursive: true, force: true });
rmSync(BUILD_DIR, { recursive: true, force: true });
mkdirSync(BUILD_DIR, { recursive: true });
mkdirSync(OUT, { recursive: true });

console.log('[2/4] 서버 코드를 하나의 파일로 묶는 중(esbuild)...');
await build({
  entryPoints: [must('src/server/index.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: BUNDLE,
  logLevel: 'info',
});

console.log('[3/4] 실행 파일로 패키징하는 중(pkg, 처음 실행하면 Node 런타임을 내려받아 시간이 걸릴 수 있음)...');
const exePath = path.join(OUT, '하이스케치.exe');
// node20 은 이 pkg 버전 기준 Windows 사전 빌드 바이너리가 없어(소스 빌드 필요, 별도 C++ 빌드
// 도구 필요) node22 로 맞춘다 — 이 프로젝트엔 node20 전용 문법이 없어 호환에 문제없다.
const pkgArgs = [
  '@yao-pkg/pkg', BUNDLE,
  '--targets', 'node22-win-x64',
  '--output', exePath,
];
execFileSync('npx', pkgArgs, { stdio: 'inherit', cwd: ROOT, shell: true });

console.log('[4/4] exe 옆에 둘 데이터·정적 파일 복사 중...');
for (const dir of ['src/web', 'fixtures', 'config', 'catalog', 'schemas']) {
  cpSync(must(dir), path.join(OUT, dir), { recursive: true });
}
mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
copyFileSync(must('node_modules/html2canvas/dist/html2canvas.min.js'), path.join(OUT, 'vendor/html2canvas.min.js'));
copyFileSync(must('node_modules/fflate/umd/index.js'), path.join(OUT, 'vendor/fflate.js'));
copyFileSync(must('node_modules/pptxgenjs/dist/pptxgen.bundle.js'), path.join(OUT, 'vendor/pptxgen.bundle.js'));

console.log(`\n완료 → ${OUT}`);
console.log('release 폴더를 통째로 옮겨서 배포하세요 (하이스케치.exe 더블클릭으로 실행).');
