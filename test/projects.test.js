import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore, cleanName, NAME_MAX, TRASH_KEEP_DAYS, UNTITLED } from '../src/web/js/projects.js';

function memStorage(limit = Infinity) {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const total = [...m].reduce((n, [kk, vv]) => n + (kk === k ? 0 : vv.length), 0) + v.length;
      if (total > limit) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
  };
}
const doc = (name, n = 1) => ({ screenName: name, mode: 'new', shapes: Array.from({ length: n }, (_, i) => ({ id: i + 1 })) });

test('put — 새 프로젝트를 만들고 list/get 으로 읽는다', () => {
  const s = createProjectStore(memStorage());
  const id = s.newId();
  const meta = s.put({ id, name: '  계약 화면  ', doc: doc('계약', 3) });
  assert.equal(meta.name, '계약 화면');
  assert.equal(meta.shapes, 3);
  assert.equal(s.list().length, 1);
  assert.equal(s.get(id).projectName, '계약 화면');
  assert.equal(s.has(id), true);
  assert.equal(s.has('nope'), false);
});

test('put — 같은 id 로 다시 저장하면 덮어쓰기(새 항목이 생기지 않고 createdAt 유지)', async () => {
  const s = createProjectStore(memStorage());
  const id = s.newId();
  const a = s.put({ id, name: 'A', doc: doc('v1', 1) });
  await new Promise((r) => setTimeout(r, 5));
  const b = s.put({ id, name: 'A', doc: doc('v2', 5) });
  assert.equal(s.list().length, 1);
  assert.equal(b.createdAt, a.createdAt);
  assert.ok(b.updatedAt >= a.updatedAt);
  assert.equal(s.get(id).screenName, 'v2');
  assert.equal(s.list()[0].shapes, 5);
});

test('list — 최근 저장한 프로젝트가 앞에 온다', async () => {
  const s = createProjectStore(memStorage());
  s.put({ id: 'a', name: 'A', doc: doc('a') });
  await new Promise((r) => setTimeout(r, 5));
  s.put({ id: 'b', name: 'B', doc: doc('b') });
  await new Promise((r) => setTimeout(r, 5));
  s.put({ id: 'a', name: 'A', doc: doc('a2') });
  assert.deepEqual(s.list().map((m) => m.id), ['a', 'b']);
});

test('uniqueName / isNameTaken — 같은 이름은 (2), (3) 으로 비켜 가고 자기 자신은 제외', () => {
  const s = createProjectStore(memStorage());
  s.put({ id: 'a', name: '초안', doc: doc('x') });
  s.put({ id: 'b', name: '초안 (2)', doc: doc('x') });
  assert.equal(s.isNameTaken('초안'), true);
  assert.equal(s.isNameTaken('초안', 'a'), false);
  assert.equal(s.uniqueName('초안'), '초안 (3)');
  assert.equal(s.uniqueName('초안', 'a'), '초안');
  assert.equal(s.uniqueName('   '), '제목 없는 프로젝트');
  s.put({ id: 'c', name: '가'.repeat(NAME_MAX), doc: doc('x') });
  const u = s.uniqueName('가'.repeat(NAME_MAX));
  assert.ok(u.length <= NAME_MAX && u.endsWith(' (2)'));
});

test('rename — 이름만 바뀌고 내용은 그대로, 충돌·빈 이름은 null', () => {
  const s = createProjectStore(memStorage());
  s.put({ id: 'a', name: 'A', doc: doc('x', 2) });
  s.put({ id: 'b', name: 'B', doc: doc('y') });
  assert.equal(s.rename('a', 'B'), null);
  assert.equal(s.rename('a', '  '), null);
  assert.equal(s.rename('zzz', 'C'), null);
  const m = s.rename('a', 'A2');
  assert.equal(m.name, 'A2');
  assert.equal(s.get('a').projectName, 'A2');
  assert.equal(s.get('a').shapes.length, 2);
  assert.equal(s.list().find((x) => x.id === 'a').name, 'A2');
});

test('remove — 목록과 본문이 함께 지워진다', () => {
  const st = memStorage();
  const s = createProjectStore(st);
  s.put({ id: 'a', name: 'A', doc: doc('x') });
  s.remove('a');
  assert.equal(s.list().length, 0);
  assert.equal(s.get('a'), null);
  assert.equal(st.getItem('hds:save:a'), null);
});

test('put — 저장 공간이 부족하면 예외를 던지되 기존 프로젝트는 그대로다', () => {
  const st = memStorage(700);
  const s = createProjectStore(st);
  s.put({ id: 'a', name: 'A', doc: doc('작은 화면', 1) });
  const before = st.getItem('hds:save:a');
  assert.throws(() => s.put({ id: 'a', name: 'A', doc: doc('큰 화면', 400) }));
  assert.equal(st.getItem('hds:save:a'), before);
  assert.equal(s.list().length, 1);
  assert.equal(s.list()[0].shapes, 1);
});

test('예전 저장본(메타에 createdAt 없음)도 목록에 보이고 열린다', () => {
  const st = memStorage();
  st.setItem('hds:saves', JSON.stringify([{ id: 'old', name: '예전', updatedAt: 1, screenName: 's', mode: 'edit', shapes: 1 }]));
  st.setItem('hds:save:old', JSON.stringify({ shapes: [{ id: 1 }], mode: 'edit' }));
  const s = createProjectStore(st);
  assert.equal(s.list()[0].name, '예전');
  assert.equal(s.get('old').mode, 'edit');
});

test('깨진 저장 데이터는 빈 목록·null 로 안전하게 처리된다', () => {
  const st = memStorage();
  st.setItem('hds:saves', '{not json');
  st.setItem('hds:save:x', '{oops');
  const s = createProjectStore(st);
  assert.deepEqual(s.list(), []);
  assert.equal(s.get('x'), null);
});

test('cleanName — 공백 제거 + 최대 길이', () => {
  assert.equal(cleanName('  a  '), 'a');
  assert.equal(cleanName('x'.repeat(100)).length, NAME_MAX);
  assert.equal(cleanName(null), '');
});

// ── 프로젝트 홈용 기능: 즐겨찾기 · 휴지통 · 사본 · 썸네일 · 사용량 ──────────────

test('put — 즐겨찾기·만든 시각·마지막으로 연 시각은 덮어써도 유지된다', async () => {
  const s = createProjectStore(memStorage());
  const a = s.put({ id: 'a', name: 'A', doc: doc('x') });
  s.setFavorite('a', true);
  s.touchOpened('a', 12345);
  await new Promise((r) => setTimeout(r, 5));
  const b = s.put({ id: 'a', name: 'A', doc: doc('y', 3) });
  assert.equal(b.favorite, true);
  assert.equal(b.createdAt, a.createdAt);
  assert.equal(b.lastOpenedAt, 12345);
  assert.ok(b.updatedAt > a.updatedAt);
});

test('put — 시스템·캔버스·화면 정보가 메타에 담긴다', () => {
  const s = createProjectStore(memStorage());
  const m = s.put({ id: 'a', name: 'A', doc: { ...doc('계약'), systemId: 'sp', systemName: '영업포탈', canvas: { w: 960, h: 600 }, mode: 'edit' } });
  assert.equal(m.systemId, 'sp');
  assert.equal(m.systemName, '영업포탈');
  assert.deepEqual(m.canvas, { w: 960, h: 600 });
  assert.equal(m.mode, 'edit');
  assert.equal(m.screenName, '계약');
});

test('create — 이름이 비면 제목 없는 프로젝트, 겹치면 (2)', () => {
  const s = createProjectStore(memStorage());
  const a = s.create({ name: '  ', doc: doc('x') });
  const b = s.create({ name: '', doc: doc('x') });
  assert.equal(a.name, UNTITLED);
  assert.equal(b.name, `${UNTITLED} (2)`);
  assert.notEqual(a.id, b.id);
});

test('썸네일 — put 으로 저장하고 remove 로 함께 지워진다', () => {
  const st = memStorage();
  const s = createProjectStore(st);
  s.put({ id: 'a', name: 'A', doc: doc('x'), thumb: '<svg/>' });
  assert.equal(s.thumb('a'), '<svg/>');
  s.remove('a');
  assert.equal(s.thumb('a'), null);
  assert.equal(st.getItem('hds:thumb:a'), null);
});

test('썸네일 저장이 공간 부족으로 실패해도 프로젝트 저장은 성공한다', () => {
  const st = memStorage(400);
  const s = createProjectStore(st);
  const m = s.put({ id: 'a', name: 'A', doc: doc('x', 1), thumb: 'x'.repeat(5000) });
  assert.equal(m.id, 'a');
  assert.equal(s.get('a').screenName, 'x');
  assert.equal(s.thumb('a'), null);
});

test('duplicate — 본문·썸네일을 복사하고 이름은 "사본" 으로 비켜 간다', () => {
  const s = createProjectStore(memStorage());
  s.put({ id: 'a', name: '원본', doc: doc('화면', 4), thumb: '<svg>t</svg>' });
  const c = s.duplicate('a');
  assert.equal(c.name, '원본 사본');
  assert.notEqual(c.id, 'a');
  assert.equal(s.get(c.id).shapes.length, 4);
  assert.equal(s.thumb(c.id), '<svg>t</svg>');
  assert.equal(s.duplicate('a').name, '원본 사본 (2)');
  assert.equal(s.duplicate('없음'), null);
});

test('trash / restore — list 에서 빠졌다가 돌아오고, 본문은 그대로', () => {
  const s = createProjectStore(memStorage());
  s.put({ id: 'a', name: 'A', doc: doc('x', 2) });
  s.put({ id: 'b', name: 'B', doc: doc('y') });
  s.trash('a', 1000);
  assert.deepEqual(s.list().map((m) => m.id), ['b']);
  assert.deepEqual(s.list({ trashed: true }).map((m) => m.id), ['a']);
  assert.equal(s.all().length, 2);
  assert.equal(s.get('a').shapes.length, 2);
  s.restore('a');
  assert.equal(s.list().length, 2);
  assert.equal(s.meta('a').trashedAt, null);
});

test('restore — 그 사이 같은 이름이 생겼으면 (2) 로 비켜 간다', () => {
  const s = createProjectStore(memStorage());
  s.put({ id: 'a', name: '초안', doc: doc('x') });
  s.trash('a');
  s.put({ id: 'b', name: '초안', doc: doc('y') }); // 휴지통 항목은 이름 충돌에서 제외
  const m = s.restore('a');
  assert.equal(m.name, '초안 (2)');
  assert.equal(s.get('a').projectName, '초안 (2)');
});

test('put — 휴지통에 있던 프로젝트를 저장하면(작업 중이므로) 복원된다', () => {
  const s = createProjectStore(memStorage());
  s.put({ id: 'a', name: 'A', doc: doc('x') });
  s.trash('a');
  const m = s.put({ id: 'a', name: 'A', doc: doc('x2') });
  assert.equal(m.trashedAt, null);
  assert.equal(s.list().length, 1);
});

test('emptyTrash / purgeExpired — 휴지통 항목만 영구 삭제', () => {
  const st = memStorage();
  const s = createProjectStore(st);
  const DAY = 86_400_000;
  s.put({ id: 'keep', name: 'K', doc: doc('x') });
  s.put({ id: 'old', name: 'O', doc: doc('x'), thumb: 't' });
  s.put({ id: 'new', name: 'N', doc: doc('x') });
  s.trash('old', 1_000_000);
  s.trash('new', 1_000_000 + (TRASH_KEEP_DAYS - 1) * DAY);
  const now = 1_000_000 + (TRASH_KEEP_DAYS + 1) * DAY;
  assert.equal(s.purgeExpired(now), 1);
  assert.equal(s.meta('old'), null);
  assert.equal(st.getItem('hds:save:old'), null);
  assert.equal(st.getItem('hds:thumb:old'), null);
  assert.ok(s.meta('new'));
  assert.equal(s.emptyTrash(), 1);
  assert.equal(s.meta('new'), null);
  assert.ok(s.meta('keep'));
});

test('touchOpened / setFavorite — 수정 시각은 바뀌지 않는다', () => {
  const s = createProjectStore(memStorage());
  const a = s.put({ id: 'a', name: 'A', doc: doc('x') });
  s.setFavorite('a', true);
  s.touchOpened('a', 99);
  const m = s.meta('a');
  assert.equal(m.updatedAt, a.updatedAt);
  assert.equal(m.favorite, true);
  assert.equal(m.lastOpenedAt, 99);
  assert.equal(s.setFavorite('없음', true), null);
});

test('usage — 저장한 만큼 늘고 한도 대비 비율을 준다', () => {
  const s = createProjectStore(memStorage());
  const empty = s.usage();
  assert.equal(empty.chars, 0);
  s.put({ id: 'a', name: 'A', doc: doc('x', 50), thumb: 'y'.repeat(1000) });
  const u = s.usage();
  assert.ok(u.chars > 1000);
  assert.ok(u.ratio > 0 && u.ratio < 1);
});
