// 생성 API 감사 로그 — 개발지시서 §8.3 A-9.
// /api/generate 요청 1건마다 runs/<timestamp>/{payload,screen.xml,preview.html,report}.json 로 남긴다.
// scripts/run-eval.mjs 의 산출물 포맷(runs/<ts>/<CASE>/...)과 파일 구성이 같다 — 다만 실 서버엔
// "케이스 ID" 가 없으므로 그 자리에 요청마다 고유한 타임스탬프+랜덤 접미사 디렉토리를 쓴다.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../shared/paths.js';

/** 같은 밀리초에 여러 요청이 와도 디렉토리가 겹치지 않도록 랜덤 접미사를 붙인다. */
export function runDirName(now = new Date()) {
  return `${now.toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * 요청 payload 와 /api/generate 결과를 runs/ 밑에 기록한다. 감사 로그는 어디까지나 부가 기능이라,
 * (1) 디스크 쓰기 실패는 예외를 삼켜 호출자에게 전파하지 않고, (2) 요청 처리를 막지 않도록
 * node:fs/promises 로 비동기 실행한다 — 동기 fs 를 썼다면 이 파일 쓰기가 끝날 때까지 Node 의
 * 단일 이벤트 루프가 멈춰 동시에 들어온 다른 모든 요청까지 지연시켰을 것이다. 호출하는 쪽에서도
 * 응답을 먼저 보낸 뒤 await 없이(fire-and-forget) 불러야 한다.
 */
export async function writeAuditLog({ payload, result }, { runsDir = path.join(ROOT, 'runs') } = {}) {
  try {
    const dir = path.join(runsDir, runDirName());
    await mkdir(dir, { recursive: true });
    const writes = [writeFile(path.join(dir, 'payload.json'), JSON.stringify(payload, null, 2))];
    if (result.status === 'ok') {
      writes.push(
        writeFile(path.join(dir, 'screen.xml'), result.code.websquareXml),
        writeFile(path.join(dir, 'preview.html'), result.preview.html),
        writeFile(path.join(dir, 'report.json'), JSON.stringify(result.report, null, 2)),
      );
    } else {
      writes.push(writeFile(path.join(dir, 'report.json'), JSON.stringify(result.error, null, 2)));
    }
    await Promise.all(writes);
  } catch { /* 감사 로그 실패는 무시 */ }
}
