// 스캐폴딩 단계의 mock 데이터 로더.
// 실연동(T-5) 전까지 메타 API / 생성 API 는 fixtures/ 를 반환한다.

import { readJson, ROOT } from '../shared/paths.js';
import { readdirSync } from 'node:fs';
import path from 'node:path';

export function fixture(rel, fallback) {
  return readJson(path.join('fixtures', rel), fallback);
}

export function listScreenFiles() {
  const dir = path.join(ROOT, 'fixtures', 'screens');
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

/** 모든 시스템 fixture 를 합쳐 화면 목록을 만든다. */
export function allScreens() {
  return listScreenFiles().flatMap((f) => {
    const systemId = f.replace(/\.json$/, '');
    return (fixture(`screens/${f}`, { screens: [] }).screens || []).map((s) => ({ ...s, systemId }));
  });
}
