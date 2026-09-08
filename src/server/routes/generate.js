// 생성 API — 개발지시서 §6, §8 A-1
//   POST /api/generate  (화면정의 payload → 생성결과)
//   POST /api/refine    (수정 요청 → 생성결과)
//
// 스캐폴딩 단계: 스키마 검증만 실제로 하고 결과는 fixtures/results 의 mock 을 반환한다.
// TODO(담당 1, A-1/A-4/A-5/A-6): Stage A → 매핑 → Stage B → 자동 검증 루프로 교체.

import { Router } from 'express';
import { validateScreenDraft, validateRefineRequest } from '../../shared/validate.js';
import { fixture } from '../mock.js';

const router = Router();

function mockResult(payload) {
  const base = fixture('results/generic.json', { status: 'ok' });
  return {
    ...base,
    report: {
      ...(base.report || {}),
      mock: true,
      note: '스캐폴딩 mock 결과입니다. 파이프라인 미구현.',
    },
    echo: {
      screenName: payload?.screenName,
      mode: payload?.mode,
      systemId: payload?.systemId,
      shapeCount: Array.isArray(payload?.shapes) ? payload.shapes.length : 0,
    },
  };
}

router.post('/generate', (req, res) => {
  const errors = validateScreenDraft(req.body);
  if (errors) {
    return res.status(400).json({
      status: 'error',
      error: { message: 'payload 가 screen-draft 스키마를 위반했습니다.', details: errors },
    });
  }
  res.json(mockResult(req.body));
});

router.post('/refine', (req, res) => {
  const errors = validateRefineRequest(req.body);
  if (errors) {
    return res.status(400).json({
      status: 'error',
      error: { message: 'refine 요청이 스키마를 위반했습니다.', details: errors },
    });
  }
  res.json(mockResult(req.body?.basePayload));
});

export default router;
