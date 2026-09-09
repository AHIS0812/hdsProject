import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMPS, boardSizeFor, DEFAULT_BOARD } from '../src/web/js/constants.js';
import { TEMPLATE_KEYS, templateShapes, sampleShapes } from '../src/web/js/templates.js';

const TYPES = new Set(COMPS.map((c) => c.t));

/** 에디터 내부 shape 형식과 보드 범위를 검증 */
function assertValidShapes(shapes, board, label) {
  assert.ok(Array.isArray(shapes), `${label}: 배열 아님`);
  for (const s of shapes) {
    assert.ok(TYPES.has(s.t), `${label}: 잘못된 타입 "${s.t}"`);
    for (const k of ['x', 'y', 'w', 'h']) {
      assert.equal(typeof s[k], 'number', `${label}: ${k} 가 숫자 아님`);
    }
    assert.ok(s.w > 0 && s.h > 0, `${label}: 크기 0 이하`);
    assert.ok(s.x >= 0 && s.y >= 0, `${label}: 좌표 음수`);
    assert.ok(s.x + s.w <= board.w + 1, `${label}: 폭 초과 (${s.x}+${s.w} > ${board.w}) [${s.label}]`);
    assert.ok(s.y + s.h <= board.h + 1, `${label}: 높이 초과 (${s.y}+${s.h} > ${board.h}) [${s.label}]`);
    assert.equal(typeof s.label, 'string', `${label}: label 문자열 아님`);
    assert.equal(typeof s.cols, 'string', `${label}: cols 문자열 아님`);
    assert.equal(typeof s.req, 'boolean', `${label}: req 불리언 아님`);
  }
}

for (const key of TEMPLATE_KEYS) {
  test(`템플릿 "${key}" 프리셋이 유효하고 보드 안에 들어간다`, () => {
    const shapes = templateShapes(key);
    if (key === 'blank') {
      assert.deepEqual(shapes, [], '빈 화면은 shapes 가 [] 이어야 한다');
      return;
    }
    assert.ok(shapes.length >= 5, `${key}: 프리셋이 너무 비어 있음`);
    assertValidShapes(shapes, boardSizeFor(key), key);
  });
}

test('템플릿마다 서로 다른 레이아웃을 만든다', () => {
  const sigs = TEMPLATE_KEYS
    .filter((k) => k !== 'blank')
    .map((k) => JSON.stringify(templateShapes(k)));
  assert.equal(new Set(sigs).size, sigs.length, '중복된 템플릿 프리셋이 있다');
});

test('sampleShapes 는 유효하고 960×600 안에 들어간다', () => {
  const shapes = sampleShapes();
  assert.ok(shapes.length > 0);
  assertValidShapes(shapes, DEFAULT_BOARD, 'sample');
});

test('TEMPLATE_KEYS 에 중복이 없고 blank 를 포함한다', () => {
  assert.equal(new Set(TEMPLATE_KEYS).size, TEMPLATE_KEYS.length);
  assert.ok(TEMPLATE_KEYS.includes('blank'));
});
