import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystemStore, cleanName, NAME_MAX, LOCKED_SYSTEMS, isLocked } from '../src/web/js/systems.js';

function memStorage() {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('list — 최초 실행 시 고정 시스템(영업포탈·하이포탈·대표홈페이지)으로 한 번 채워진다', () => {
  const s = createSystemStore(memStorage());
  const list = s.list();
  assert.deepEqual(list.map((x) => x.id), LOCKED_SYSTEMS.map((x) => x.id));
  assert.deepEqual(list.map((x) => x.name), LOCKED_SYSTEMS.map((x) => x.name));
});

test('isLocked — 고정 시스템 3개만 true', () => {
  assert.equal(isLocked('salesportal'), true);
  assert.equal(isLocked('portal'), true);
  assert.equal(isLocked('homepage'), true);
  assert.equal(isLocked('아무거나'), false);
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
  assert.equal(s.create('영업포탈'), null); // 고정 시스템과 중복
});

test('rename — 고정 시스템이면 항상 null (이름 안 바뀜)', () => {
  const s = createSystemStore(memStorage());
  assert.equal(s.rename('salesportal', '바뀐 이름'), null);
  assert.equal(s.get('salesportal').name, '영업포탈');
});

test('rename — 사용자 시스템은 바꾸고, 없거나 빈 이름·중복이면 null', () => {
  const s = createSystemStore(memStorage());
  const sys = s.create('새 시스템');
  const r = s.rename(sys.id, '바뀐 이름');
  assert.equal(r.name, '바뀐 이름');
  assert.equal(s.get(sys.id).name, '바뀐 이름');
  assert.equal(s.rename('없는아이디', 'X'), null);
  assert.equal(s.rename(sys.id, '  '), null);
  assert.equal(s.rename(sys.id, '영업포탈'), null); // 고정 시스템과 중복
});

test('remove — 고정 시스템은 false, 목록에 그대로 남는다', () => {
  const s = createSystemStore(memStorage());
  assert.equal(s.remove('portal'), false);
  assert.ok(s.list().some((x) => x.id === 'portal'));
});

test('remove — 사용자 시스템은 true, 목록에서 빠진다', () => {
  const s = createSystemStore(memStorage());
  const sys = s.create('지울 시스템');
  assert.equal(s.remove(sys.id), true);
  assert.equal(s.get(sys.id), null);
  assert.ok(!s.list().some((x) => x.id === sys.id));
});

test('move — 순서를 앞뒤로 옮긴다(고정 시스템도 순서는 이동 가능)', () => {
  const s = createSystemStore(memStorage());
  const before = s.list().map((x) => x.id); // [salesportal, portal, homepage]
  assert.equal(s.move('portal', -1), true);
  assert.deepEqual(s.list().map((x) => x.id), [before[1], before[0], before[2]]);
  assert.equal(s.move(before[1], 1), true); // 되돌리기
  assert.deepEqual(s.list().map((x) => x.id), before);
});

test('move — 맨 위에서 위로, 맨 아래에서 아래로, 없는 id 는 false', () => {
  const s = createSystemStore(memStorage());
  const first = s.list()[0].id;
  const last = s.list().at(-1).id;
  assert.equal(s.move(first, -1), false);
  assert.equal(s.move(last, 1), false);
  assert.equal(s.move('없는아이디', -1), false);
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

test('깨진 저장 데이터는 고정 시스템으로 안전하게 복구된다', () => {
  const st = memStorage();
  st.setItem('hds:systems', '{not json');
  const s = createSystemStore(st);
  assert.deepEqual(s.list().map((x) => x.id), LOCKED_SYSTEMS.map((x) => x.id));
});
