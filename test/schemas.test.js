import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import {
  validateScreenDraft,
  validateGenerationResult,
  validateRefineRequest,
} from '../src/shared/validate.js';
import { readJson, ROOT } from '../src/shared/paths.js';
import { boardSizeFor } from '../src/web/js/constants.js';
import { TEMPLATE_KEYS, templateShapes } from '../src/web/js/templates.js';

/** 에디터 내부 shape → payload shape (main.js toPayloadShapes 와 동일 규칙) */
const toPayloadShape = (s) => ({
  type: s.t ?? s.type,
  x: s.x, y: s.y, w: s.w, h: s.h,
  label: (s.label ?? '') || undefined,
  items: (s.cols ?? s.items ?? '') || undefined,
  required: (s.req ?? s.required) || undefined,
});

// ── 템플릿 → 신규 payload 스키마 통과 ──────────────────────
for (const key of TEMPLATE_KEYS) {
  test(`템플릿 "${key}" 로 만든 신규 payload 가 screen-draft 스키마를 통과한다`, () => {
    const payload = {
      systemId: 'portal',
      systemName: '하이포탈',
      mode: 'new',
      template: key,
      screenName: '테스트 화면',
      canvas: boardSizeFor(key),
      shapes: templateShapes(key).map(toPayloadShape),
    };
    assert.equal(validateScreenDraft(payload), null);
  });
}

test('systemId 없는 payload 는 오류 목록을 돌려준다', () => {
  const errs = validateScreenDraft({ mode: 'new' });
  assert.ok(Array.isArray(errs) && errs.length > 0);
});

test('mode=edit 인데 baseScreen 없으면 실패한다', () => {
  const errs = validateScreenDraft({
    systemId: 'portal', mode: 'edit',
    canvas: { w: 960, h: 600 }, shapes: [],
  });
  assert.ok(Array.isArray(errs) && errs.length > 0);
});

// ── 픽스처 검증 ───────────────────────────────────────────
test('fixtures/systems.json 형식', () => {
  const { systems } = readJson('fixtures/systems.json');
  assert.ok(Array.isArray(systems) && systems.length >= 1);
  for (const s of systems) assert.ok(s.id && s.name, 'system 에 id/name 없음');
});

test('모든 screen 픽스처: shapes 가 canvas 안에 들어가고 edit payload 가 스키마를 통과한다', () => {
  const dir = path.join(ROOT, 'fixtures', 'screens');
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const systemId = f.replace(/\.json$/, '');
    const { screens } = readJson(`fixtures/screens/${f}`);
    assert.ok(Array.isArray(screens) && screens.length >= 1, `${f}: screens 없음`);
    for (const scr of screens) {
      assert.ok(scr.id && scr.name, `${f}: screen id/name 없음`);
      const canvas = scr.canvas || { w: 960, h: 600 };
      for (const s of scr.shapes) {
        assert.ok(s.type, `${scr.id}: shape type 없음`);
        assert.ok(s.x + s.w <= canvas.w + 1, `${scr.id}/${s.id}: 폭 초과`);
        assert.ok(s.y + s.h <= canvas.h + 1, `${scr.id}/${s.id}: 높이 초과`);
      }
      const payload = {
        systemId,
        mode: 'edit',
        baseScreen: { id: scr.id, name: scr.name },
        screenName: scr.name,
        canvas,
        shapes: scr.shapes.map(toPayloadShape),
      };
      assert.equal(validateScreenDraft(payload), null, `${scr.id}: edit payload 스키마 위반`);
    }
  }
});

test('fixtures/payloads/*.json 이 스키마를 통과한다', () => {
  for (const f of ['list.json', 'fallback.json']) {
    assert.equal(validateScreenDraft(readJson(`fixtures/payloads/${f}`)), null, `${f} 위반`);
  }
});

test('fixtures/results/*.json 이 generation-result 스키마를 통과한다', () => {
  for (const f of ['generic.json', 'needs-input.json']) {
    assert.equal(validateGenerationResult(readJson(`fixtures/results/${f}`)), null, `${f} 위반`);
  }
});

test('refine 요청 형태가 스키마를 통과한다', () => {
  const req = {
    basePayload: readJson('fixtures/payloads/list.json'),
    answers: [{ questionId: 'q1', value: '그리드' }],
    instruction: '조회 버튼을 오른쪽으로',
  };
  assert.equal(validateRefineRequest(req), null);
});
