// 프로젝트 홈의 순수 로직 — 검색·필터·정렬·집계·시간 표기. DOM 없이 테스트할 수 있도록 home.js 와 분리.

import { TRASH_KEEP_DAYS } from './projects.js';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const SORTS = [
  { key: 'updated', label: '최근 수정순' },
  { key: 'opened', label: '최근 연 순' },
  { key: 'created', label: '만든 순' },
  { key: 'name', label: '이름순' },
];

/** "방금 전 / N분 전 / N시간 전 / N일 전 / 이번 해 M월 D일 / YYYY년 M월 D일" */
export function relTime(ts, now = Date.now()) {
  if (!ts) return '';
  const d = now - ts;
  if (d < 45_000) return '방금 전';
  if (d < HOUR) return `${Math.max(1, Math.round(d / MIN))}분 전`;
  if (d < DAY) return `${Math.round(d / HOUR)}시간 전`;
  if (d < 7 * DAY) return `${Math.round(d / DAY)}일 전`;
  const t = new Date(ts);
  const n = new Date(now);
  return t.getFullYear() === n.getFullYear()
    ? `${t.getMonth() + 1}월 ${t.getDate()}일`
    : `${t.getFullYear()}년 ${t.getMonth() + 1}월 ${t.getDate()}일`;
}

/** 휴지통에서 영구 삭제까지 남은 일수(올림, 최소 0) */
export function daysLeft(trashedAt, now = Date.now(), keepDays = TRASH_KEEP_DAYS) {
  if (!trashedAt) return keepDays;
  return Math.max(0, Math.ceil((trashedAt + keepDays * DAY - now) / DAY));
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** 검색어가 이름·화면 이름·시스템 이름 중 어디든 들어 있는지(공백으로 나눈 단어를 모두 포함) */
export function matchesQuery(meta, q) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${meta.name} ${meta.screenName || ''} ${meta.systemName || ''}`);
  return words.every((w) => hay.includes(w));
}

/**
 * @param {object[]} all 휴지통 포함 전체 메타
 * @param {{ view?: 'all'|'fav'|'trash', q?: string, mode?: 'all'|'new'|'edit', systemId?: string|null }} f
 */
export function filterProjects(all, { view = 'all', q = '', mode = 'all', systemId = null } = {}) {
  return all.filter((m) => {
    if (view === 'trash') { if (!m.trashedAt) return false; } else if (m.trashedAt) return false;
    if (view === 'fav' && !m.favorite) return false;
    if (mode !== 'all' && (m.mode === 'edit' ? 'edit' : 'new') !== mode) return false;
    if (systemId && m.systemId !== systemId) return false;
    return matchesQuery(m, q);
  });
}

/**
 * "모든 프로젝트" 목록에 프로젝트들과 나란히 보여줄 "이름 붙인 버전" 카드들을 만든다 — 변경 화면
 * 마법사에서 이름을 붙여 저장해 둔 각 작업 차수("1번 프로젝트", "2번 프로젝트" 등)를 프로젝트 카드처럼
 * 구분해서 볼 수 있게 한다. 실제로 열면(goEditor) 항상 그 원본 프로젝트(최종 파일) 자체가 열린다 —
 * 별도 파일이 아니라 한 파일 안의 "이름 붙은 시점"일 뿐이다.
 * @param {object[]} projects 휴지통 제외 프로젝트 메타 목록
 * @param {(id:string)=>object[]} versionsOf 프로젝트 id -> 그 프로젝트의 버전 메타 목록(versions.list 결과 — systemId/systemName/screenName/mode 포함)
 * @returns {object[]} kind:'version' 카드 목록. id 는 "ver:<projectId>:<versionId>"
 */
export function namedVersionCards(projects, versionsOf) {
  const out = [];
  for (const p of projects) {
    for (const v of versionsOf(p.id) || []) {
      if (!v.label) continue; // 이름 없는 자동 버전은 카드로 안 보여준다
      out.push({
        id: `ver:${p.id}:${v.id}`,
        kind: 'version',
        projectId: p.id,
        versionId: v.id,
        name: v.label,
        screenName: v.screenName || '',
        systemId: v.systemId || null,
        systemName: v.systemName || null,
        mode: v.mode === 'edit' ? 'edit' : 'new',
        shapes: v.shapes ?? 0,
        pages: v.pages ?? 1,
        canvas: v.canvas || null,
        hasBg: !!v.hasBg,
        favorite: false,
        trashedAt: null,
        createdAt: v.ts,
        updatedAt: v.ts,
        lastOpenedAt: v.ts,
      });
    }
  }
  return out;
}

/** 정렬(원본은 건드리지 않는다). 이름순은 한글 사전 순, 나머지는 큰 값(최근)이 앞 */
export function sortProjects(list, key = 'updated') {
  const arr = [...list];
  const by = {
    updated: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    opened: (a, b) => (b.lastOpenedAt || b.updatedAt || 0) - (a.lastOpenedAt || a.updatedAt || 0),
    created: (a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0),
    name: (a, b) => String(a.name).localeCompare(String(b.name), 'ko'),
  }[key] || ((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return arr.sort(by);
}

/** 사이드바 개수 배지용 */
export function countViews(all) {
  let total = 0; let fav = 0; let trash = 0;
  for (const m of all) {
    if (m.trashedAt) trash++;
    else { total++; if (m.favorite) fav++; }
  }
  return { all: total, fav, trash };
}

/** 시스템별 프로젝트 수(휴지통 제외) — [{ id, name, count }] 개수 많은 순 */
export function countSystems(all, nameOf = () => null) {
  const map = new Map();
  for (const m of all) {
    if (m.trashedAt || !m.systemId) continue;
    const cur = map.get(m.systemId) || { id: m.systemId, name: nameOf(m.systemId) || m.systemName || m.systemId, count: 0 };
    cur.count++;
    map.set(m.systemId, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

/** 카드 아래 한 줄 설명: "신규 · 영업포탈 · 요소 12개" */
export function metaLine(m, systemName) {
  const parts = [m.mode === 'edit' ? '변경' : '신규'];
  const sys = systemName || m.systemName;
  if (sys) parts.push(sys);
  if (m.pages > 1) parts.push(`화면 ${m.pages}개`);
  parts.push(`요소 ${m.shapes ?? 0}개`);
  return parts.join(' · ');
}

/** 용량 표시 — "340 KB" / "1.2 MB" (localStorage 는 글자 수로 한도를 세므로 글자 수를 그대로 쓴다) */
export function fmtSize(chars) {
  if (chars < 1_000_000) return `${Math.max(1, Math.round(chars / 1000))} KB`;
  return `${(chars / 1_000_000).toFixed(1)} MB`;
}

/** 다운로드용 안전한 파일명(금지 문자 치환) */
export const safeFileName = (name, fallback = 'project') =>
  (String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || fallback);
