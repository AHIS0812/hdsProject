// 생성 API — 개발지시서 §6, §8
//   POST /api/generate  (화면정의 payload → 생성결과)
//
// 외부 LLM 미사용. 규칙 기반 변환기(src/pipeline/deterministic.js)가 전담한다.

import { Router } from 'express';
import { validateScreenDraft } from '../../shared/validate.js';
import { deterministicResult } from '../../pipeline/deterministic.js';
import { writeAuditLog } from '../audit-log.js';

const router = Router();

router.post('/generate', (req, res) => {
  const errors = validateScreenDraft(req.body);
  if (errors) {
    const result = {
      status: 'error',
      error: { message: 'payload 가 screen-draft 스키마를 위반했습니다.', details: errors },
    };
    res.status(400).json(result);
    writeAuditLog({ payload: req.body, result }); // 응답 전송 후 fire-and-forget — 감사 로그가 응답을 지연시키면 안 된다
    return;
  }

  try {
    const t0 = Date.now();
    const result = deterministicResult(req.body);
    result.report.elapsedMs = Date.now() - t0;
    res.json(result);
    writeAuditLog({ payload: req.body, result });
    return;
  } catch (err) {
    const result = {
      status: 'error',
      error: { message: '변환 중 오류가 발생했습니다.', log: String(err?.stack || err) },
    };
    res.status(500).json(result);
    writeAuditLog({ payload: req.body, result });
    return;
  }
});

export default router;
