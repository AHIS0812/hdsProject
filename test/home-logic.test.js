import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  relTime, daysLeft, matchesQuery, filterProjects, sortProjects, countViews, countSystems, namedVersionCards,
  metaLine, fmtSize, safeFileName, SORTS,
} from '../src/web/js/home-logic.js';

const DAY = 86_400_000;
const NOW = new Date('2026-09-21T12:00:00').getTime();
const P = (o) => ({ id: o.id, name: o.id, mode: 'new', shapes: 3, updatedAt: NOW, createdAt: NOW, ...o });

test('relTime — 방금/분/시간/일/날짜 표기', () => {
  assert.equal(relTime(NOW - 10_000, NOW), '방금 전');
  assert.equal(relTime(NOW - 5 * 60_000, NOW), '5분 전');
  assert.equal(relTime(NOW - 3 * 3_600_000, NOW), '3시간 전');
  assert.equal(relTime(NOW - 2 * DAY, NOW), '2일 전');
  assert.equal(relTime(new Date('2026-05-03T09:00:00').getTime(), NOW), '5월 3일');
  assert.equal(relTime(new Date('2025-12-25T09:00:00').getTime(), NOW), '2025년 12월 25일');
  assert.equal(relTime(0, NOW), '');
});

test('daysLeft — 휴지통 보관 남은 일수', () => {
  assert.equal(daysLeft(NOW, NOW), 30);
  assert.equal(daysLeft(NOW - 10 * DAY, NOW), 20);
  assert.equal(daysLeft(NOW - 29.5 * DAY, NOW), 1);
  assert.equal(daysLeft(NOW - 99 * DAY, NOW), 0);
});

test('matchesQuery — 이름·화면·시스템, 여러 단어는 모두 포함해야', () => {
  const m = P({ id: 'a', name: '계약자 등록', screenName: '고객 검색화면', systemName: '영업포탈' });
  assert.ok(matchesQuery(m, ''));
  assert.ok(matchesQuery(m, '계약'));
  assert.ok(matchesQuery(m, '검색화면'));
  assert.ok(matchesQuery(m, '영업'));
  assert.ok(matchesQuery(m, '  계약   영업 '));
  assert.ok(!matchesQuery(m, '계약 하이콜'));
  assert.ok(!matchesQuery(m, '없는말'));
  assert.ok(matchesQuery(P({ id: 'b', name: 'ABC Test' }), 'abc test'));
});

test('filterProjects — 보기(전체/즐겨찾기/휴지통)·작업구분·시스템·검색', () => {
  const all = [
    P({ id: 'a', name: '목록', mode: 'new', systemId: 's1', favorite: true }),
    P({ id: 'b', name: '상세', mode: 'edit', systemId: 's2' }),
    P({ id: 'c', name: '삭제됨', trashedAt: NOW, favorite: true }),
  ];
  const ids = (f) => filterProjects(all, f).map((m) => m.id);
  assert.deepEqual(ids({}), ['a', 'b']);
  assert.deepEqual(ids({ view: 'fav' }), ['a']);
  assert.deepEqual(ids({ view: 'trash' }), ['c']);
  assert.deepEqual(ids({ mode: 'edit' }), ['b']);
  assert.deepEqual(ids({ mode: 'new' }), ['a']);
  assert.deepEqual(ids({ systemId: 's2' }), ['b']);
  assert.deepEqual(ids({ q: '상세' }), ['b']);
  assert.deepEqual(ids({ view: 'trash', q: '삭제' }), ['c']);
  assert.deepEqual(ids({ q: '삭제' }), []); // 휴지통 항목은 일반 검색에 나오지 않는다
});

test('namedVersionCards — 이름 붙인 버전만 카드로, 원본 참조를 담는다', () => {
  const projects = [P({ id: 'p1', name: '1번 프로젝트' }), P({ id: 'p2', name: '다른 프로젝트' })];
  const versionsOf = (pid) => (pid === 'p1' ? [
    { id: 'v1', ts: 1, label: '', screenName: '화면A', mode: 'new', shapes: 0 },            // 이름 없음 — 제외
    { id: 'v2', ts: 2, label: '2번 프로젝트', screenName: '화면A', systemId: 's1', systemName: '영업포탈', mode: 'edit', shapes: 3, pages: 1 },
  ] : []);
  const cards = namedVersionCards(projects, versionsOf);
  assert.equal(cards.length, 1);
  const c = cards[0];
  assert.equal(c.id, 'ver:p1:v2');
  assert.equal(c.kind, 'version');
  assert.equal(c.projectId, 'p1');
  assert.equal(c.versionId, 'v2');
  assert.equal(c.name, '2번 프로젝트');
  assert.equal(c.screenName, '화면A');
  assert.equal(c.systemName, '영업포탈');
  assert.equal(c.mode, 'edit');
  assert.equal(c.trashedAt, null);
  assert.equal(c.favorite, false);
});

test('namedVersionCards — 버전 카드도 filterProjects/sortProjects 로 다룰 수 있다', () => {
  const projects = [P({ id: 'p1', name: '1번 프로젝트', updatedAt: 100 })];
  const versionsOf = () => [{ id: 'v1', ts: 200, label: '2번 프로젝트', screenName: '화면A', mode: 'new', shapes: 1 }];
  const cards = namedVersionCards(projects, versionsOf);
  const merged = filterProjects([...projects, ...cards], {});
  assert.deepEqual(sortProjects(merged, 'updated').map((m) => m.id), ['ver:p1:v1', 'p1']);
});

test('sortProjects — 최근 수정·연 순·만든 순·이름순, 원본 불변', () => {
  const all = [
    P({ id: 'b', name: '나', updatedAt: 200, lastOpenedAt: 900, createdAt: 10 }),
    P({ id: 'a', name: '가', updatedAt: 100, lastOpenedAt: 100, createdAt: 30 }),
    P({ id: 'c', name: '다', updatedAt: 300, createdAt: 20 }), // 연 기록 없으면 수정 시각으로
  ];
  const ids = (k) => sortProjects(all, k).map((m) => m.id);
  assert.deepEqual(ids('updated'), ['c', 'b', 'a']);
  assert.deepEqual(ids('opened'), ['b', 'c', 'a']);
  assert.deepEqual(ids('created'), ['a', 'c', 'b']);
  assert.deepEqual(ids('name'), ['a', 'b', 'c']);
  assert.deepEqual(ids('없는키'), ['c', 'b', 'a']);
  assert.deepEqual(all.map((m) => m.id), ['b', 'a', 'c']);
  assert.ok(SORTS.every((s) => s.key && s.label));
});

test('countViews / countSystems', () => {
  const all = [
    P({ id: 'a', systemId: 's1', systemName: '영업포탈', favorite: true }),
    P({ id: 'b', systemId: 's1', systemName: '영업포탈' }),
    P({ id: 'c', systemId: 's2', systemName: '하이콜' }),
    P({ id: 'd', systemId: 's2', trashedAt: 1 }),
    P({ id: 'e' }),
  ];
  assert.deepEqual(countViews(all), { all: 4, fav: 1, trash: 1 });
  const sys = countSystems(all, (id) => (id === 's2' ? '하이콜(최신)' : null));
  assert.deepEqual(sys.map((s) => [s.id, s.name, s.count]), [['s1', '영업포탈', 2], ['s2', '하이콜(최신)', 1]]);
});

test('metaLine / fmtSize / safeFileName', () => {
  assert.equal(metaLine(P({ id: 'a', mode: 'edit', systemName: '영업포탈', shapes: 12 })), '변경 · 영업포탈 · 요소 12개');
  assert.equal(metaLine(P({ id: 'a' })), '신규 · 요소 3개');
  assert.equal(metaLine(P({ id: 'a' }), '하이콜'), '신규 · 하이콜 · 요소 3개');
  assert.equal(fmtSize(100_000), '100 KB');
  assert.equal(fmtSize(300), '1 KB');
  assert.equal(fmtSize(1_250_000), '1.3 MB');
  assert.equal(fmtSize(5_000_000), '5.0 MB');
  assert.equal(safeFileName('a/b:c*d'), 'a_b_c_d');
  assert.equal(safeFileName('  '), 'project');
});
