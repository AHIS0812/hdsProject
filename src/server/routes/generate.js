// 생성 API — 개발지시서 §6, §8 A-1
//   POST /api/generate  (화면정의 payload → 생성결과)
//   POST /api/refine    (수정 요청 → 생성결과)
//
// 스캐폴딩 단계: 스키마 검증만 실제로 하고 결과는 fixtures/results 의 mock 을 반환한다.
// TODO(담당 1, A-1/A-4/A-5/A-6): Stage A → 매핑 → Stage B → 자동 검증 루프로 교체.

import { Router } from 'express';
import { validateScreenDraft, validateRefineRequest } from '../../shared/validate.js';
import { fixture } from '../mock.js';
import { deterministicResult } from '../../pipeline/deterministic.js';

const router = Router();

// 개발용 트리거: 보충 설명에 이 말이 있으면 파이프라인이 실패한 것으로 간주 → 결정론적 폴백
const FORCE_FALLBACK = /폴백|fallback|결정론|deterministic|변환기|생성\s*실패|파이프라인\s*실패/i;

/**
 * 생성 파이프라인. 지금은 mock.
 * TODO(담당 1): Stage A → 매핑 → Stage B → 자동 검증 루프로 교체.
 * 이 함수가 throw 하거나 status:'error' 를 반환하면 결정론적 변환기로 폴백한다(아래 라우트).
 */
function runPipeline(payload) {
  return mockResult(payload);
}

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
  // 스캐폴딩 개발용 트리거: 보충 설명에 "질문" 이 있으면 needs_input 흐름을 테스트
  if ((req.body.note || '').includes('질문')) {
    return res.json({ ...fixture('results/needs-input.json', { status: 'needs_input', questions: [] }) });
  }

  // 파이프라인 실행 → 실패 시 결정론적 변환기로 폴백 (개발지시서 §4.2, D-7)
  try {
    if (FORCE_FALLBACK.test(req.body.note || '')) {
      throw new Error('개발용 트리거로 파이프라인 실패를 시뮬레이션했습니다.');
    }
    const result = runPipeline(req.body);
    if (result?.status === 'error') throw new Error(result.error?.message || '파이프라인 오류');
    return res.json(result);
  } catch (err) {
    return res.json(deterministicResult(req.body, err.message));
  }
});

router.post('/refine', (req, res) => {
  const errors = validateRefineRequest(req.body);
  if (errors) {
    return res.status(400).json({
      status: 'error',
      error: { message: 'refine 요청이 스키마를 위반했습니다.', details: errors },
    });
  }
  const refinedWith = { answers: req.body?.answers || [], instruction: req.body?.instruction || null };
  try {
    if (FORCE_FALLBACK.test(req.body?.instruction || '')) {
      throw new Error('개발용 트리거로 파이프라인 실패를 시뮬레이션했습니다.');
    }
    const result = runPipeline(req.body?.basePayload);
    if (result?.status === 'error') throw new Error(result.error?.message || '파이프라인 오류');
    result.report = { ...result.report, refinedWith };
    return res.json(result);
  } catch (err) {
    const result = deterministicResult(req.body?.basePayload, err.message);
    result.report.refinedWith = refinedWith;
    return res.json(result);
  }
});

export default router;
