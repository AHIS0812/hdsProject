import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compileDeterministic,
  deterministicResult,
  readingOrder,
  shapeToXml,
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
