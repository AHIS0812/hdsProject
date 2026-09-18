import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/** 저장소 루트 절대경로. 평소(node 로 직접 실행)엔 이 소스 파일 위치 기준(2단계 위) 이고,
 * scripts/build-exe.mjs 로 패키징한 .exe(pkg 런타임)로 실행할 때는 exe 파일이 있는 폴더가
 * 기준이다 — fixtures/config/catalog/schemas/src/web 은 exe 안에 넣지 않고 그 옆에 그대로 두고
 * 배포하기 때문(열어보거나 고치기 쉽게). */
export const ROOT = typeof process.pkg !== 'undefined'
  ? path.dirname(process.execPath)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 루트 기준 상대경로의 JSON 파일을 읽어 파싱. */
export function readJson(relPath, fallback) {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}
