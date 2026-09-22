import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVersionStore, AUTO_KEEP, AUTO_INTERVAL_MS, hashString } from '../src/web/js/versions.js';
import { createProjectStore } from '../src/web/js/projects.js';

function memStorage(limit = Infinity) {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const total = [...m].reduce((n, [kk, vv]) => n + (kk === k ? 0 : vv.length), 0) + String(v).length;
      if (total > limit) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
  };
}
const BIG = 'data:image/png;base64,' + 'Q'.repeat(20000);
const docN = (n, bg = BIG) => ({ version: 2, pages: [{ id: 'p1', shapes: Array.from({ length: n }, (_, i) => ({ id: i })), background: bg }] });
const assetKeys = (st) => [...st.m.keys()].filter((k) => k.startsWith('hds:asset:'));

test('add·get — 버전을 남기고 이미지까지 그대로 되살린다', () => {
  const st = memStorage();
  const vs = createVersionStore(st);
  const m = vs.add('P', docN(2), { now: 1000 });
  assert.equal(m.shapes, 2);
  assert.equal(m.pages, 1);
  assert.equal(m.auto, true);
  const back = vs.get('P', m.id);
  assert.equal(back.pages[0].background, BIG);
  assert.equal(back.pages[0].shapes.length, 2);
});

test('add — 같은 이미지는 버전이 여러 개여도 한 번만 저장한다', () => {
  const st = memStorage();
  const vs = createVersionStore(st);
  vs.add('P', docN(1), { now: 1 });
  vs.add('P', docN(2), { now: 2 });
  vs.add('P', docN(3), { now: 3 });
  assert.equal(vs.list('P').length, 3);
  assert.equal(assetKeys(st).length, 1);
  assert.ok(vs.usage('P') < BIG.length * 1.2);
});

test('add — 바로 앞 버전과 내용이 같으면 새로 만들지 않고, 이름을 주면 그 버전에 이름을 붙인다', () => {
  const vs = createVersionStore(memStorage());
  const a = vs.add('P', docN(1), { now: 1 });
  assert.equal(vs.add('P', { ...docN(1), savedAt: 'later' }, { now: 2 }), null);
  const named = vs.add('P', docN(1), { now: 3, label: '1차 검토본' });
  assert.equal(named.id, a.id);
  assert.equal(named.label, '1차 검토본');
  assert.equal(named.auto, false);
  assert.equal(vs.list('P').length, 1);
  // 이미 이름이 있는 버전은 같은 내용으로 다시 이름을 줘도 덮어쓰지 않는다
  const again = vs.add('P', docN(1), { now: 4, label: '복원 직전' });
  assert.equal(again.id, a.id);
  assert.equal(vs.list('P')[0].label, '1차 검토본');
});

test('자동 버전은 AUTO_KEEP 개까지만, 이름 붙인 버전은 남는다 · 버려진 이미지는 지운다', () => {
  const st = memStorage();
  const vs = createVersionStore(st);
  vs.add('P', docN(0, 'data:image/png;base64,' + 'N'.repeat(5000)), { now: 0, label: '보관' });
  for (let i = 1; i <= AUTO_KEEP + 5; i++) vs.add('P', docN(i, `data:image/png;base64,${String(i).repeat(4000)}`), { now: i });
  const list = vs.list('P');
  assert.equal(list.filter((x) => x.auto).length, AUTO_KEEP);
  assert.ok(list.some((x) => x.label === '보관'));
  // 남은 버전 수(자동 20 + 이름 1)만큼만 이미지가 남는다
  assert.equal(assetKeys(st).length, AUTO_KEEP + 1);
});

test('저장 공간이 모자라면 오래된 자동 버전부터 지우고 저장한다 · 그래도 안 되면 예외, 기존 버전은 멀쩡', () => {
  const st = memStorage(40_000);
  const vs = createVersionStore(st);
  for (let i = 0; i < 6; i++) vs.add('P', docN(i, `data:image/png;base64,${'abcdef'[i].repeat(9000)}`), { now: i });
  const list = vs.list('P');
  assert.ok(list.length < 6 && list.length >= 1, `남은 버전 ${list.length}`);
  assert.equal(list[0].shapes, 5); // 가장 최신은 들어갔다
  list.forEach((v) => assert.ok(vs.get('P', v.id).pages[0].background.startsWith('data:image/')));
  // 이름 붙인 버전만 있을 때 공간이 모자라면 예외
  const st2 = memStorage(30_000);
  const vs2 = createVersionStore(st2);
  vs2.add('Q', docN(1, 'data:image/png;base64,' + 'x'.repeat(12000)), { now: 1, label: 'A' });
  assert.throws(() => vs2.add('Q', docN(2, 'data:image/png;base64,' + 'y'.repeat(20000)), { now: 2, label: 'B' }));
  assert.equal(vs2.list('Q').length, 1);
  assert.equal(vs2.get('Q', vs2.list('Q')[0].id).pages[0].background.length, 12000 + 22);
});

test('rename·remove·removeAll·dueForAuto', () => {
  const st = memStorage();
  const vs = createVersionStore(st);
  const a = vs.add('P', docN(1), { now: 0 });
  assert.equal(vs.dueForAuto('P', AUTO_INTERVAL_MS - 1), false);
  assert.equal(vs.dueForAuto('P', AUTO_INTERVAL_MS), true);
  assert.equal(vs.rename('P', a.id, '  최종  ').label, '최종');
  assert.equal(vs.remove('P', a.id), true);
  assert.equal(assetKeys(st).length, 0);
  vs.add('P', docN(2), { now: 5 });
  vs.removeAll('P');
  assert.equal(st.m.size, 0);
});

test('프로젝트를 영구 삭제하면 버전 기록도 함께 지워지고, 사용량에 버전이 포함된다', () => {
  const st = memStorage();
  const s = createProjectStore(st);
  const meta = s.create({ name: 'A', doc: { screenName: 'A', mode: 'new', shapes: [{ id: 1 }] } });
  const before = s.usage().chars;
  s.versions.add(meta.id, docN(2), { now: 1 });
  assert.ok(s.usage().chars > before);
  s.remove(meta.id);
  assert.equal([...st.m.keys()].filter((k) => k.includes(meta.id)).length, 0);
});

test('hashString — 같은 입력 같은 값, 다른 입력 다른 값', () => {
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
});
