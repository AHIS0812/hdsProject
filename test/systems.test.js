import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystemStore, cleanName, NAME_MAX, SEED_SYSTEMS } from '../src/web/js/systems.js';

function memStorage() {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('list — 최초 실행 시 시드값(예전 fixtures/systems.json)으로 한 번 채워진다', () => {
  const s = createSystemStore(memStorage());
  const list = s.list();
  assert.deepEqual(list.map((x) => x.id), SEED_SYSTEMS.map((x) => x.id));
  assert.deepEqual(list.map((x) => x.name), SEED_SYSTEMS.map((x) => x.name));
});

test('list — 사용자가 전부 지운 뒤에는 시드값이 다시 채워지지 않는다', () => {
  const st = memStorage();
  const s = createSystemStore(st);
  s.list().forEach((x) => s.remove(x.id));
  assert.deepEqual(s.list(), []);
});

test('create — 새 시스템을 추가하고 list 뒤에 붙는다', () => {
  const s = createSystemStore(memStorage());
  const before = s.list().length;
  const sys = s.create('신규시스템');
  assert.ok(sys.id);
  assert.equal(sys.name, '신규시스템');
  assert.equal(s.list().length, before + 1);
  assert.equal(s.list().at(-1).id, sys.id);
});

test('create — 이름이 비었거나 같은 이름이 있으면 null', () => {
  const s = createSystemStore(memStorage());
  assert.equal(s.create('   '), null);
  assert.equal(s.create('영업포탈'), null); // 시드값과 중복
});

test('rename — 이름을 바꾸고, 없거나 빈 이름·중복이면 null', () => {
  const s = createSystemStore(memStorage());
  const sys = s.create('새 시스템');
  const r = s.rename(sys.id, '바뀐 이름');
  assert.equal(r.name, '바뀐 이름');
  assert.equal(s.get(sys.id).name, '바뀐 이름');
  assert.equal(s.rename('없는아이디', 'X'), null);
  assert.equal(s.rename(sys.id, '  '), null);
  assert.equal(s.rename(sys.id, '영업포탈'), null); // 다른 시스템과 중복
});

test('remove — 목록에서 빠진다', () => {
  const s = createSystemStore(memStorage());
  const sys = s.create('지울 시스템');
  s.remove(sys.id);
  assert.equal(s.get(sys.id), null);
  assert.ok(!s.list().some((x) => x.id === sys.id));
});

test('isNameTaken — 자기 자신은 제외', () => {
  const s = createSystemStore(memStorage());
  const sys = s.create('가나다');
  assert.equal(s.isNameTaken('가나다'), true);
  assert.equal(s.isNameTaken('가나다', sys.id), false);
});

test('cleanName — 공백 제거 + 길이 제한', () => {
  assert.equal(cleanName('  이름  '), '이름');
  assert.equal(cleanName('가'.repeat(100)).length, NAME_MAX);
});

test('깨진 저장 데이터는 시드값으로 안전하게 복구된다', () => {
  const st = memStorage();
  st.setItem('hds:systems', '{not json');
  const s = createSystemStore(st);
  assert.deepEqual(s.list().map((x) => x.id), SEED_SYSTEMS.map((x) => x.id));
});
