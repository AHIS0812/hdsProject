import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thumbnailSvg, svgDataUrl } from '../src/web/js/thumbnail.js';
import { COMPS } from '../src/web/js/constants.js';
import { TEMPLATE_KEYS, templateShapes } from '../src/web/js/templates.js';

const wellFormed = (svg) => {
  assert.ok(svg.startsWith('<svg '), 'svg 로 시작');
  assert.ok(svg.endsWith('</svg>'), 'svg 로 끝');
  // 태그 짝이 대충 맞는지(열림 <tag ... > / 닫힘 </tag>) — 텍스트 안 꺾쇠는 이스케이프돼 있어야 한다
  const stripped = svg.replace(/<[^>]+>/g, '');
  assert.ok(!/[<>]/.test(stripped), '텍스트에 날 꺾쇠가 없다');
  assert.equal((svg.match(/<text /g) || []).length, (svg.match(/<\/text>/g) || []).length);
};

test('빈 캔버스·shapes 가 없어도 유효한 SVG 를 돌려준다', () => {
  wellFormed(thumbnailSvg([], { w: 960, h: 600 }));
  wellFormed(thumbnailSvg(undefined, undefined));
  assert.match(thumbnailSvg([], { w: 560, h: 420 }), /viewBox="0 0 560 420"/);
});

test('모든 요소 타입을 에러 없이 그린다(에디터 내부 형식)', () => {
  const shapes = COMPS.map((c, i) => ({ t: c.t, x: 10 + i * 5, y: 10 + i * 5, w: 120, h: 30, label: c.n, cols: '가,나,다' }));
  const svg = thumbnailSvg(shapes, { w: 960, h: 600 });
  wellFormed(svg);
  assert.ok(svg.length > 500);
});

test('payload 형식(type·items·fontSize)도 같은 결과를 그린다', () => {
  const a = thumbnailSvg([{ t: 'button', x: 10, y: 10, w: 80, h: 20, label: '조회', fs: 14 }], { w: 100, h: 50 });
  const b = thumbnailSvg([{ type: 'button', x: 10, y: 10, w: 80, h: 20, label: '조회', fontSize: 14 }], { w: 100, h: 50 });
  assert.equal(a, b);
});

test('텍스트의 꺾쇠·따옴표·앰퍼샌드는 이스케이프된다(주입 방지)', () => {
  const svg = thumbnailSvg([{ t: 'label', x: 0, y: 0, w: 100, h: 20, label: '<script>alert("x")</script>&' }], { w: 100, h: 50 });
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('&amp;'));
  wellFormed(svg);
});

test('알 수 없는 타입·이상한 숫자도 깨지지 않는다', () => {
  const svg = thumbnailSvg([
    { t: 'nope', x: 'a', y: null, w: -5, h: undefined },
    { t: 'input', x: 1, y: 2 },
    null,
  ].filter(Boolean), { w: 'x', h: 0 });
  wellFormed(svg);
  assert.ok(!/NaN|undefined/.test(svg));
});

test('버튼은 조회·저장 같은 주 동작이면 주황, 나머지는 남색', () => {
  const primary = thumbnailSvg([{ t: 'button', x: 0, y: 0, w: 50, h: 20, label: '조회' }], { w: 100, h: 50 });
  const other = thumbnailSvg([{ t: 'button', x: 0, y: 0, w: 50, h: 20, label: '닫기' }], { w: 100, h: 50 });
  assert.ok(primary.includes('#F5821F'));
  assert.ok(!other.includes('#F5821F'));
});

test('요소가 너무 많으면 앞의 400개까지만 그린다', () => {
  const shapes = Array.from({ length: 1000 }, (_, i) => ({ t: 'divider', x: 0, y: i, w: 10, h: 2 }));
  assert.equal((thumbnailSvg(shapes, { w: 100, h: 100 }).match(/<line /g) || []).length, 400);
});

test('모든 화면 유형 템플릿의 썸네일이 만들어진다', () => {
  for (const key of TEMPLATE_KEYS) {
    const svg = thumbnailSvg(templateShapes(key), key === 'popup' ? { w: 560, h: 420 } : { w: 960, h: 600 });
    wellFormed(svg);
  }
});

test('svgDataUrl 은 인코딩된 data URL 이다', () => {
  const url = svgDataUrl('<svg a="1"/>');
  assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(!url.includes('<'));
});
