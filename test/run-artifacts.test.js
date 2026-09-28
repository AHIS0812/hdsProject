import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  timestampSlug,
  redactLargeDataUrls,
  redactLargeDataUrlsInMarkup,
  runArtifactFiles,
} from '../src/shared/run-artifacts.js';

test('timestampSlug — 같은 시각이어도 랜덤 접미사 때문에 서로 다르다', () => {
  const now = new Date('2026-09-28T01:02:03.456Z');
  const a = timestampSlug(now);
  const b = timestampSlug(now);
  assert.notEqual(a, b);
  assert.match(a, /^2026-09-28T01-02-03-456Z-[0-9a-f]{12}$/);
});

test('redactLargeDataUrls — 짧은 data URL 은 그대로 두고, 긴 data URL 만 축약한다', () => {
  const short = 'data:image/png;base64,iVBORw0KGgo=';
  const long = 'data:image/png;base64,' + 'A'.repeat(30_000);
  const payload = { background: long, shapes: [{ src: short }, { src: long, label: '괜찮음' }] };
  const out = redactLargeDataUrls(payload);
  assert.equal(out.background, `[data URL 생략됨, ${long.length}자]`);
  assert.equal(out.shapes[0].src, short); // 짧은 건 그대로
  assert.equal(out.shapes[1].src, `[data URL 생략됨, ${long.length}자]`);
  assert.equal(out.shapes[1].label, '괜찮음'); // 관련 없는 필드는 안 건드림
});

test('redactLargeDataUrls — data URL 이 아닌 긴 문자열은 건드리지 않는다', () => {
  const notDataUrl = 'x'.repeat(30_000);
  assert.equal(redactLargeDataUrls({ note: notDataUrl }).note, notDataUrl);
});

test('redactLargeDataUrlsInMarkup — HTML/XML 안에 인라인된 긴 data URL 을 축약한다', () => {
  const long = 'data:image/png;base64,' + 'B'.repeat(30_000);
  const html = `<img src="${long}" alt="배경">`;
  const out = redactLargeDataUrlsInMarkup(html);
  assert.ok(!out.includes('BBBB'));
  assert.match(out, /\[data URL 생략됨, \d+자\]/);
  assert.match(out, /alt="배경"/); // 나머지 마크업은 그대로
});

test('runArtifactFiles — 성공 결과는 4개 파일, 대용량 data URL 은 축약해서 담는다', () => {
  const long = 'data:image/png;base64,' + 'C'.repeat(30_000);
  const payload = { screenName: '조회', background: long };
  const result = {
    status: 'ok',
    code: { websquareXml: `<w2:image src="${long}"/>` },
    preview: { html: `<img src="${long}">` },
    report: { converter: 'deterministic' },
  };
  const files = runArtifactFiles({ payload, result });
  assert.deepEqual(files.map((f) => f.name), ['payload.json', 'screen.xml', 'preview.html', 'report.json']);
  for (const f of files) assert.ok(!f.content.includes('CCCC'), `${f.name} 에 원본 data URL 이 그대로 남아있음`);
});

test('runArtifactFiles — 에러 결과는 payload.json·report.json 2개만 만든다', () => {
  const files = runArtifactFiles({ payload: {}, result: { status: 'error', error: { message: '실패' } } });
  assert.deepEqual(files.map((f) => f.name), ['payload.json', 'report.json']);
  assert.deepEqual(JSON.parse(files[1].content), { message: '실패' });
});
