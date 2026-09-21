import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore, cleanName, NAME_MAX } from '../src/web/js/projects.js';

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
