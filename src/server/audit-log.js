// 생성 API 감사 로그 — 개발지시서 §8.3 A-9.
// /api/generate 요청 1건마다 runs/<timestamp>/{payload,screen.xml,preview.html,report}.json 로 남긴다.
// scripts/run-eval.mjs 의 산출물 포맷(runs/<ts>/<CASE>/...)과 파일 구성이 같다 — 다만 실 서버엔
// "케이스 ID" 가 없으므로 그 자리에 요청마다 고유한 타임스탬프+랜덤 접미사 디렉토리를 쓴다.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../shared/paths.js';

/** 같은 밀리초에 여러 요청이 와도 디렉토리가 겹치지 않도록 랜덤 접미사를 붙인다. */
export function runDirName(now = new Date()) {
  return `${now.toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * 요청 payload 와 /api/generate 결과를 runs/ 밑에 기록한다. 감사 로그는 어디까지나 부가 기능이라,
 * 디스크 공간 부족 등으로 쓰기가 실패해도 예외를 삼킨다 — API 응답은 이미 끝난 뒤이므로 절대
 * 이 로깅 실패가 호출자에게 전파되면 안 된다.
 */
export function writeAuditLog({ payload, result }, { runsDir = path.join(ROOT, 'runs') } = {}) {
  try {
    const dir = path.join(runsDir, runDirName());
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'payload.json'), JSON.stringify(payload, null, 2));
    if (result.status === 'ok') {
      writeFileSync(path.join(dir, 'screen.xml'), result.code.websquareXml);
      writeFileSync(path.join(dir, 'preview.html'), result.preview.html);
      writeFileSync(path.join(dir, 'report.json'), JSON.stringify(result.report, null, 2));
    } else {
      writeFileSync(path.join(dir, 'report.json'), JSON.stringify(result.error, null, 2));
    }
  } catch { /* 감사 로그 실패는 무시 */ }
}
