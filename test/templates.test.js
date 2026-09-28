import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMPS, boardSizeFor } from '../src/web/js/constants.js';
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
    const board = boardSizeFor(key); // 시스템 미지정 → DEFAULT_BOARD(900×600), popup 은 POPUP_BOARD
    const shapes = templateShapes(key, board);
    if (key === 'blank') {
      assert.deepEqual(shapes, [], '빈 화면은 shapes 가 [] 이어야 한다');
      return;
    }
    assert.ok(shapes.length >= 5, `${key}: 프리셋이 너무 비어 있음`);
    assertValidShapes(shapes, board, key);
  });
}

test('템플릿은 시스템별 기본 캔버스 크기에도 스케일되어 그 안에 들어간다', () => {
  for (const systemId of ['salesportal', 'portal', 'homepage']) {
    for (const key of TEMPLATE_KEYS) {
      if (key === 'blank') continue;
      const board = boardSizeFor(key, systemId);
      const shapes = templateShapes(key, board);
      assertValidShapes(shapes, board, `${key}/${systemId}`);
    }
  }
});

test('템플릿마다 서로 다른 레이아웃을 만든다', () => {
  const sigs = TEMPLATE_KEYS
    .filter((k) => k !== 'blank')
    .map((k) => JSON.stringify(templateShapes(k, boardSizeFor(k))));
  assert.equal(new Set(sigs).size, sigs.length, '중복된 템플릿 프리셋이 있다');
});

test('templateShapes — canvas 를 안 주거나 기준 크기(960×600)와 같으면 스케일하지 않는다', () => {
  const base = { w: 960, h: 600 };
  assert.deepEqual(templateShapes('list'), templateShapes('list', base));
});

test('templateShapes — "PC·스크롤 고려"처럼 세로만 훨씬 큰 캔버스에서도 요소 비율이 찌그러지지 않는다', () => {
  const base = { w: 960, h: 600 };
  const tall = { w: 1180, h: 1400 }; // 영업포탈 기본 폭 + PC·스크롤 높이
  const baseShapes = templateShapes('form', base);
  const scaledShapes = templateShapes('form', tall);
  assertValidShapes(scaledShapes, tall, 'form/tall');
  // 가로·세로 스케일 비율이 같아야(= 원본과 같은 종횡비) 버튼·입력칸이 찌그러지지 않는다.
  for (let i = 0; i < baseShapes.length; i++) {
    const b = baseShapes[i]; const s = scaledShapes[i];
    if (b.w === 0 || b.h === 0) continue;
    // 정수 반올림 오차(특히 라벨처럼 작은 요소)는 허용 — 5% 이상 벌어지면 실제로 찌그러진 것
    assert.ok(Math.abs((s.w / b.w) - (s.h / b.h)) < 0.05, `${b.label}: 가로/세로 스케일 비율이 달라 찌그러짐 (w비율 ${s.w / b.w}, h비율 ${s.h / b.h})`);
  }
});

// 고정 3개 시스템의 기본 캔버스는 원본(960×600)과 종횡비가 비슷(8% 안팎)하므로, "PC·스크롤 고려"와
// 달리 요소가 가로·세로 각각 독립 스케일되어 화면을 꽉 채워야 한다(찌그러짐 방지용 min 스케일을 그대로
// 쓰면 오른쪽·아래쪽에 불필요한 여백이 남는 문제가 있었다).
test('templateShapes — 고정 시스템의 기본 캔버스 크기에서는 요소가 화면을 꽉 채운다(여백이 남지 않는다)', () => {
  const base = { w: 960, h: 600 };
  for (const [systemId, board] of Object.entries({
    salesportal: { w: 1180, h: 755 },
    portal: { w: 1280, h: 738 },
    homepage: { w: 1240, h: 750 },
  })) {
    const baseShapes = templateShapes('list', base);
    const scaledShapes = templateShapes('list', board);
    const rightEdge = (arr) => Math.max(...arr.map((s) => s.x + s.w));
    const bottomEdge = (arr) => Math.max(...arr.map((s) => s.y + s.h));
    // 기준 캔버스에서 오른쪽·아래쪽 끝까지 채우던 비율이, 새 캔버스에서도 거의 그대로 유지돼야 한다
    // (min 스케일이었다면 이 비율이 눈에 띄게 줄어든다 — 세로 배율이 가로 배율보다 작기 때문).
    const baseFillX = rightEdge(baseShapes) / base.w;
    const scaledFillX = rightEdge(scaledShapes) / board.w;
    const baseFillY = bottomEdge(baseShapes) / base.h;
    const scaledFillY = bottomEdge(scaledShapes) / board.h;
    assert.ok(Math.abs(scaledFillX - baseFillX) < 0.03, `${systemId}: 가로 채움 비율이 달라짐 (기준 ${baseFillX.toFixed(3)}, 실제 ${scaledFillX.toFixed(3)})`);
    assert.ok(Math.abs(scaledFillY - baseFillY) < 0.03, `${systemId}: 세로 채움 비율이 달라짐 (기준 ${baseFillY.toFixed(3)}, 실제 ${scaledFillY.toFixed(3)})`);
  }
});

test('sampleShapes 는 유효하고 960×600 안에 들어간다(스케일 대상이 아닌 기준 크기 고정 함수)', () => {
  const shapes = sampleShapes();
  assert.ok(shapes.length > 0);
  assertValidShapes(shapes, { w: 960, h: 600 }, 'sample');
});

test('TEMPLATE_KEYS 에 중복이 없고 blank 를 포함한다', () => {
  assert.equal(new Set(TEMPLATE_KEYS).size, TEMPLATE_KEYS.length);
  assert.ok(TEMPLATE_KEYS.includes('blank'));
});
