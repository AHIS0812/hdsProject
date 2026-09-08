import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/** 저장소 루트 절대경로 (src/shared 기준 2단계 위). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 루트 기준 상대경로의 JSON 파일을 읽어 파싱. */
export function readJson(relPath, fallback) {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}
