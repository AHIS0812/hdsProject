import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compileDeterministic,
  deterministicResult,
  readingOrder,
  shapeToXml,
  propagateRequired,
  buildContainmentTree,
} from '../src/pipeline/deterministic.js';
import { validateGenerationResult } from '../src/shared/validate.js';
import { readJson } from '../src/shared/paths.js';

const listPayload = readJson('fixtures/payloads/list.json');

test('readingOrder — 위→아래, 같은 줄이면 왼→오른쪽', () => {
  const shapes = [
    { id: 'b', x: 200, y: 50, w: 10, h: 10 },
    { id: 'a', x: 20, y: 52, w: 10, h: 10 },
    { id: 'c', x: 0, y: 200, w: 10, h: 10 },
  ];
  assert.deepEqual(readingOrder(shapes).map((s) => s.id), ['a', 'b', 'c']);
});

test('shapeToXml — 매핑 태그로 변환, 필수는 requiredClass', () => {
  assert.match(shapeToXml({ type: 'input', required: true }, 1), /<w2:inputBox [^>]*class="w2input_essential"/);
  assert.match(shapeToXml({ type: 'button', label: '조회' }, 2), /<w2:trigger [^>]*value="조회"/);
});

test('shapeToXml — list 는 items 를 gridColumn 으로 펼친다', () => {
  const xml = shapeToXml({ type: 'list', items: '순번,계약자,상태' }, 1);
  assert.match(xml, /<w2:gridView[\s\S]*<w2:gridColumn value="순번"\/>[\s\S]*<w2:gridColumn value="상태"\/>[\s\S]*<\/w2:gridView>/);
});

test('shapeToXml — 알 수 없는 타입은 주석', () => {
  assert.match(shapeToXml({ type: 'nope' }, 1), /<!-- nope/);
});

test('compileDeterministic — XML/HTML 을 만든다, 주입 방지', () => {
  const out = compileDeterministic({
    screenName: '<b>x</b>',
    canvas: { w: 960, h: 600 },
    shapes: [{ type: 'input', x: 10, y: 10, w: 100, h: 28, label: '이름' }],
  });
  assert.match(out.websquareXml, /<w2:group id="screenRoot">/);
  assert.match(out.previewHtml, /<!DOCTYPE html>/);
  assert.ok(!out.previewHtml.includes('<b>x</b>')); // 이스케이프됨
});

test('deterministicResult — generation-result 스키마를 통과한다', () => {
  const r = deterministicResult(listPayload, '개발용 트리거');
  assert.equal(validateGenerationResult(r), null);
  assert.equal(r.status, 'ok');
  assert.equal(r.report.usedDeterministicFallback, true);
  assert.deepEqual(r.report.fallbacksApplied, ['deterministic']);
  assert.equal(r.code.files.length, 1);
});

test('deterministicResult — 빈 payload 에도 스키마를 통과한다', () => {
  assert.equal(validateGenerationResult(deterministicResult({})), null);
});

test('propagateRequired — 필수 라벨 오른쪽 필드로 전파', () => {
  const shapes = [
    { type: 'label', x: 50, y: 50, w: 80, h: 24, label: '성명', required: true },
    { type: 'input', x: 140, y: 48, w: 180, h: 28 },
    { type: 'label', x: 50, y: 100, w: 80, h: 24, label: '메모' }, // 필수 아님
    { type: 'input', x: 140, y: 98, w: 180, h: 28 },
  ];
  const n = propagateRequired(shapes);
  assert.equal(n, 1);
  assert.equal(shapes[1].required, true);
  assert.notEqual(shapes[3].required, true);
});

test('propagateRequired — 오른쪽에 없으면 바로 아래 필드', () => {
  const shapes = [
    { type: 'label', x: 50, y: 50, w: 80, h: 20, label: '관계', required: true },
    { type: 'select', x: 50, y: 74, w: 140, h: 28, items: '자녀,배우자' },
  ];
  propagateRequired(shapes);
  assert.equal(shapes[1].required, true);
});

test('buildContainmentTree — area 안 요소가 자식이 된다', () => {
  const area = { type: 'area', x: 30, y: 30, w: 900, h: 100, label: '조회 영역' };
  const inside = { type: 'input', x: 100, y: 60, w: 120, h: 28 };
  const outside = { type: 'button', x: 100, y: 300, w: 80, h: 28, label: '조회' };
  const { roots, childrenOf } = buildContainmentTree([area, inside, outside]);
  assert.deepEqual(childrenOf.get(area), [inside]);
  assert.ok(roots.includes(area));
  assert.ok(roots.includes(outside));
  assert.ok(!roots.includes(inside));
});

test('compileDeterministic — area 를 감싸고 필수를 전파한다', () => {
  const out = compileDeterministic({
    screenName: '등록',
    canvas: { w: 960, h: 600 },
    shapes: [
      { type: 'area', x: 30, y: 30, w: 900, h: 120, label: '입력 영역' },
      { type: 'label', x: 50, y: 60, w: 80, h: 24, label: '성명', required: true },
      { type: 'input', x: 140, y: 58, w: 180, h: 28 },
      { type: 'button', x: 740, y: 400, w: 90, h: 30, label: '저장' },
    ],
  });
  assert.equal(out.propagatedRequired, 1);
  // area 가 자식(성명 라벨/입력)을 감싼다
  assert.match(out.websquareXml, /<w2:group id="grp1">[\s\S]*<w2:inputBox[^>]*w2input_essential[\s\S]*<\/w2:group>/);
  // 저장 버튼은 area 밖(screenRoot 직속)
  assert.match(out.websquareXml, /<\/w2:group>\n\s*<w2:trigger[^>]*value="저장"/);
});
