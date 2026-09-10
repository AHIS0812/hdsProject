// fixtures/ 데이터 로더 — 시스템·화면 목록의 데이터 소스 (OI-11, OI-12: 실 연동은 정식 개발 과제).

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
