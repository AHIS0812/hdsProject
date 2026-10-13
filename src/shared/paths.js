import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const inPkg = typeof process.pkg !== 'undefined';
const repoRoot = inPkg ? '' : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 쓰기·사용자 데이터 기준 폴더(.env, runs/). 평소엔 저장소 루트, .exe 로 패키징된 배포본에서는
 * exe 가 있는 폴더 — exe 안쪽은 읽기 전용이라 로그 같은 쓰기 파일은 반드시 이쪽에 둔다. */
export const ROOT = inPkg ? path.dirname(process.execPath) : repoRoot;

/** 읽기 전용 자산(src/web, fixtures, config, catalog, schemas, vendor) 기준 폴더.
 * 평소엔 저장소 루트, .exe 에서는 scripts/build-exe.mjs 가 exe 안에 넣어 둔 스냅숏 폴더
 * (번들된 server.cjs 가 있는 곳 = __dirname). */
export const ASSET_ROOT = inPkg ? __dirname : repoRoot;

/** 자산 폴더 기준 상대경로를 절대경로로. */
export function assetPath(...rel) {
  return path.join(ASSET_ROOT, ...rel);
}

/** 자산 폴더 기준 상대경로의 JSON 파일을 읽어 파싱. */
export function readJson(relPath, fallback) {
  try {
    return JSON.parse(readFileSync(assetPath(relPath), 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}
