import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  docPages, activeIndex, makeDoc, upgradeDoc, docSummary, clonePage, movePage, docSignature, isProjectDoc, MAX_PAGES,
} from '../src/web/js/doc-model.js';

const v1 = {
  app: 'hds', version: 1, projectName: 'P', screenName: '계약 조회', systemId: 'portal', mode: 'edit',
  template: 'list', baseScreenId: 'SCR-1', canvas: { w: 560, h: 420 },
  shapes: [{ id: 's1', type: 'input', x: 0, y: 0, w: 10, h: 10 }], background: 'data:image/png;base64,AAAA',
};

test('docPages — v1 문서는 1페이지짜리로 읽는다(필드 그대로)', () => {
  const [p, ...rest] = docPages(v1);
  assert.equal(rest.length, 0);
  assert.equal(p.screenName, '계약 조회');
  assert.equal(p.mode, 'edit');
  assert.equal(p.baseScreenId, 'SCR-1');
  assert.deepEqual(p.canvas, { w: 560, h: 420 });
  assert.equal(p.shapes.length, 1);
  assert.equal(p.background, v1.background);
});

test('docPages — 이상한 값은 걸러내고, 겹치는 페이지 id 는 새로 매긴다', () => {
  const pages = docPages({ pages: [
    { id: 'a', canvas: { w: -1 }, shapes: 'x', background: 'javascript:alert(1)', mode: 'zzz' },
    { id: 'a' },
  ] });
  assert.deepEqual(pages[0].canvas, { w: 960, h: 600 });
  assert.deepEqual(pages[0].shapes, []);
  assert.equal(pages[0].background, undefined);
  assert.equal(pages[0].mode, 'new');
  assert.equal(pages[0].baseScreenId, null);
  assert.notEqual(pages[1].id, 'a');
  assert.equal(docPages({ pages: Array.from({ length: MAX_PAGES + 5 }, () => ({})) }).length, MAX_PAGES);
});

test('upgradeDoc·makeDoc — v2 로 올리고 activePage 범위를 맞춘다', () => {
  const d = upgradeDoc(v1);
  assert.equal(d.version, 2);
  assert.equal(d.systemId, 'portal');
  assert.equal(d.pages.length, 1);
  assert.equal(d.screenName, undefined); // 최상위에 화면 필드를 중복 저장하지 않는다
  assert.equal(activeIndex({ activePage: 7, pages: [{}, {}] }), 0);
  assert.equal(activeIndex({ activePage: 1, pages: [{}, {}] }), 1);
  assert.equal(makeDoc({ pages: [{}, {}], activePage: 9 }).activePage, 1);
});

test('docSummary — 화면 수·요소 합계·배경 여부, 표지는 첫 화면', () => {
  const s = docSummary({ pages: [
    { screenName: 'A', shapes: [{}, {}] },
    { screenName: 'B', mode: 'edit', shapes: [{}], background: 'data:image/png;base64,AA' },
  ] });
  assert.equal(s.pages, 2);
  assert.equal(s.shapes, 3);
  assert.equal(s.hasBg, true);
  assert.equal(s.screenName, 'A');
  assert.equal(s.mode, 'new');
});

test('isProjectDoc — v1·v2 만 통과', () => {
  assert.equal(isProjectDoc(v1), true);
  assert.equal(isProjectDoc({ pages: [{}] }), true);
  assert.equal(isProjectDoc({ pages: [] }), false);
  assert.equal(isProjectDoc({ foo: 1 }), false);
  assert.equal(isProjectDoc(null), false);
});

test('clonePage·movePage', () => {
  const [p] = docPages(v1);
  const c = clonePage(p);
  assert.notEqual(c.id, p.id);
  assert.equal(c.screenName, '계약 조회 사본');
  c.shapes.push({});
  assert.equal(p.shapes.length, 1); // 깊은 복사
  assert.deepEqual(movePage(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(movePage(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(movePage(['a', 'b'], 0, 5), ['a', 'b']);
});

test('docSignature — savedAt 은 무시, 큰 이미지는 지문으로 비교', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(5000);
  const a = { savedAt: 1, pages: [{ background: big }] };
  const b = { savedAt: 2, pages: [{ background: big }] };
  assert.equal(docSignature(a), docSignature(b));
  assert.ok(docSignature(a).length < 1000);
  assert.notEqual(docSignature(a), docSignature({ pages: [{ background: big + 'B' }] }));
});
