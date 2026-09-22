// 하이스케치 프로젝트 홈 — "내 프로젝트" 관리 화면 (캔바·미리캔버스의 "내 작업" 에 해당).
// 프로젝트 저장소(projects.js)는 에디터와 공유하고, 이 화면은 목록·검색·정리·새로 만들기를 맡는다.
// 프로젝트를 열면 editor.html?p=<id> 로 이동한다(에디터가 그 프로젝트에 자동 저장).

import * as api from './api.js';
import { createProjectStore, browserStorage, cleanName, UNTITLED, NAME_MAX } from './projects.js';
import { thumbnailSvg, svgDataUrl, makeBgThumb } from './thumbnail.js';
import {
  filterProjects, sortProjects, countViews, countSystems, relTime, daysLeft, metaLine, fmtSize, safeFileName, SORTS,
} from './home-logic.js';
import { templateShapes } from './templates.js';
import { boardSizeFor } from './constants.js';
import { toast } from './toast.js';
import { showDialog } from './dialog.js';
import { docPages, makeDoc, isProjectDoc } from './doc-model.js';

const $ = (id) => document.getElementById(id);
const store = createProjectStore(browserStorage());

// ── 아이콘(인라인 SVG) ────────────────────────────────────
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const fillIcons = (root = document) => root.querySelectorAll('.ico[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i); });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── 상태 ─────────────────────────────────────────────────
const PREF_KEY = 'hds:home';
const LAST_SYS_KEY = 'hds:lastSystem';
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; } };
const savePrefs = () => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ sort: state.sort, layout: state.layout, mode: state.mode })); } catch { /* 무시 */ }
};
const p0 = readPrefs();
const state = {
  view: 'all',                 // all | fav | trash
  q: '',
  mode: ['new', 'edit'].includes(p0.mode) ? p0.mode : 'all',
  systemId: null,
  sort: SORTS.some((s) => s.key === p0.sort) ? p0.sort : 'updated',
  layout: p0.layout === 'list' ? 'list' : 'grid',
  selected: new Set(),
  anchor: null,                // shift 범위 선택의 시작점
};
let systems = [];              // [{ id, name, sub }] — API 가 안 떠 있으면 빈 배열
const sysName = (id) => systems.find((s) => s.id === id)?.name || null;
let visibleIds = [];

const TPL_INFO = [
  { key: 'blank', name: '빈 화면', sub: '처음부터 그리기' },
  { key: 'list', name: '목록 조회', sub: '조회조건 + 결과 표' },
  { key: 'detail', name: '상세 조회', sub: '목록 + 상세 정보' },
  { key: 'form', name: '등록 · 수정', sub: '입력 폼' },
  { key: 'popup', name: '팝업', sub: '560 × 420' },
  { key: 'main', name: '메인', sub: '요약 카드 + 바로가기' },
];
const tplThumb = (key) => svgDataUrl(thumbnailSvg(templateShapes(key), boardSizeFor(key)));
const editorUrl = (id) => `editor.html?p=${encodeURIComponent(id)}`;
const goEditor = (id) => { store.touchOpened(id); location.href = editorUrl(id); };

// ── 렌더링 ───────────────────────────────────────────────
const grid = $('grid');
let renderTimer = null;
const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(render, 60); };

function currentList() {
  const list = filterProjects(store.all(), { view: state.view, q: state.q, mode: state.view === 'trash' ? 'all' : state.mode, systemId: state.systemId });
  return state.view === 'trash' ? list.sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0)) : sortProjects(list, state.sort);
}

function viewTitle() {
  if (state.q.trim()) return `‘${state.q.trim()}’ 검색 결과`;
  if (state.view === 'fav') return '즐겨찾기';
  if (state.view === 'trash') return '휴지통';
  if (state.systemId) return `${sysName(state.systemId) || state.systemId} 프로젝트`;
  return '모든 프로젝트';
}

function render() {
  const all = store.all();
  const counts = countViews(all);
  $('cAll').textContent = counts.all;
  $('cFav').textContent = counts.fav;
  $('cTrash').textContent = counts.trash;
  document.querySelectorAll('#nav .nav-item').forEach((b) => {
    const on = b.dataset.view === state.view && !(state.view === 'all' && state.systemId);
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });

  // 시스템별 보기
  const sys = countSystems(all, sysName);
  $('sysTitle').hidden = sys.length === 0;
  $('sysNav').replaceChildren(...sys.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sys-item' + (state.systemId === s.id ? ' on' : '');
    b.dataset.sys = s.id;
    b.setAttribute('aria-pressed', String(state.systemId === s.id));
    b.innerHTML = `<i></i><span>${esc(s.name)}</span><em>${s.count}</em>`;
    return b;
  }));

  // 저장 공간
  const u = store.usage();
  $('usageTxt').textContent = `${fmtSize(u.chars)} / 약 ${fmtSize(u.limit)}`;
  $('usageBar').style.width = `${Math.max(2, Math.round(u.ratio * 100))}%`;
  $('usage').classList.toggle('warn', u.ratio >= 0.7 && u.ratio < 0.9);
  $('usage').classList.toggle('full', u.ratio >= 0.9);

  // 히어로는 "모든 프로젝트" 첫 화면에서만
  $('hero').hidden = !(state.view === 'all' && !state.q.trim() && !state.systemId);

  const list = currentList();
  visibleIds = list.map((m) => m.id);
  for (const id of [...state.selected]) if (!visibleIds.includes(id)) state.selected.delete(id);

  $('listTitle').textContent = viewTitle();
  document.title = `${viewTitle()} — 하이스케치`;
  $('listCount').textContent = `${list.length}개`;
  $('trashNote').hidden = state.view !== 'trash';
  $('btnEmptyTrash').hidden = !(state.view === 'trash' && counts.trash > 0);
  $('modeChips').hidden = state.view === 'trash';
  document.querySelectorAll('#modeChips .chip-btn').forEach((b) => {
    const on = b.dataset.mode === state.mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll('#layoutSeg button').forEach((b) => {
    const on = b.dataset.layout === state.layout;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('sort').value = state.sort;
  $('sort').closest('.sel').hidden = state.view === 'trash';
  $('q').closest('.search').classList.toggle('has', !!state.q);

  grid.className = 'grid' + (state.layout === 'list' ? ' list' : '') + (state.selected.size ? ' picking' : '');
  const missing = [];
  const focusedId = document.activeElement?.closest?.('.card')?.dataset.id; // 다시 그려도 키보드 위치 유지
  grid.replaceChildren(...list.map((m) => buildCard(m, missing)));
  if (focusedId) grid.querySelector(`.card[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
  grid.hidden = list.length === 0;
  renderEmpty(list.length, counts, all.length);
  renderBulk();
  if (missing.length) fillMissingThumbs(missing);
}

function buildCard(m, missing) {
  const trashed = !!m.trashedAt;
  const picked = state.selected.has(m.id);
  const el = document.createElement('article');
  el.className = 'card' + (picked ? ' sel-on' : '') + (trashed ? ' trashed' : '');
  el.dataset.id = m.id;
  el.tabIndex = 0;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', `${m.name}${trashed ? ' (휴지통)' : ''}`);
  const svg = store.thumb(m.id);
  // 썸네일이 없거나, 캡처 배경이 있는 프로젝트인데 썸네일에 배경이 빠져 있으면(예전 저장분) 다시 만든다.
  // hasBg 를 아직 모르는 변경 화면 프로젝트는 한 번 열어 보고 채운다.
  if (!svg || (m.hasBg && !svg.includes('<image')) || (m.hasBg === undefined && m.mode === 'edit')) missing.push(m.id);
  const sysNm = sysName(m.systemId) || m.systemName || '';
  const kind = m.mode === 'edit' ? '변경' : '신규';
  const when = trashed ? `${daysLeft(m.trashedAt)}일 후 영구 삭제` : `${relTime(m.updatedAt)} 수정`;
  el.innerHTML =
    `<button type="button" class="chk${picked ? ' on' : ''}" role="checkbox" aria-checked="${picked}" aria-label="${esc(m.name)} 선택"><span class="ico">${icon('check')}</span></button>`
    + (trashed ? '' : `<button type="button" class="fav${m.favorite ? ' on' : ''}" aria-pressed="${!!m.favorite}" aria-label="${esc(m.name)} 즐겨찾기" title="${m.favorite ? '즐겨찾기 해제' : '즐겨찾기'}"><span class="ico">${icon('star')}</span></button>`)
    + `<div class="thumb">${svg ? `<img alt="" loading="lazy" src="${svgDataUrl(svg)}">` : '<div class="ph"></div>'}</div>`
    + '<div class="info">'
    + `<div class="ttl"><b class="name" title="${esc(m.name)}">${esc(m.name)}</b></div>`
    + `<button type="button" class="more" aria-haspopup="menu" aria-label="${esc(m.name)} 메뉴" title="더보기"><span class="ico">${icon('more')}</span></button>`
    + `<div class="sub"><span class="tag${m.mode === 'edit' ? ' edit' : ''}">${kind}</span><span class="txt">${esc(sysNm ? `${sysNm} · ` : '')}${m.pages > 1 ? `화면 ${m.pages}개 · ` : ''}요소 ${m.shapes ?? 0}개</span></div>`
    + `<div class="when">${esc(when)}</div>`
    + `<span class="tag lst-tag${m.mode === 'edit' ? ' edit' : ''}">${kind}</span><span class="lst-sys">${esc(sysNm)}</span><span class="lst-when">${esc(trashed ? when : relTime(m.updatedAt))}</span>`
    + '</div>';
  return el;
}

function renderEmpty(shown, counts, total) {
  const box = $('empty');
  box.hidden = shown > 0;
  if (shown > 0) return;
  const q = state.q.trim();
  let title; let text; let acts = '';
  if (q) {
    title = '검색 결과가 없어요';
    text = `‘${esc(q)}’에 맞는 프로젝트를 찾지 못했어요. 다른 검색어를 써 보세요.`;
    acts = '<button class="btn" type="button" data-act="clear-q">검색 지우기</button>';
  } else if (state.view === 'trash') {
    title = '휴지통이 비어 있어요';
    text = '삭제한 프로젝트는 30일 동안 여기에 보관돼요.';
  } else if (state.view === 'fav') {
    title = '즐겨찾기한 프로젝트가 없어요';
    text = '자주 쓰는 프로젝트 카드의 ★ 를 누르면 여기에 모여요.';
  } else if (total === 0 || counts.all === 0) {
    title = '첫 프로젝트를 만들어 볼까요?';
    text = '위의 화면 유형을 고르면 바로 시작할 수 있어요. 이전에 내보낸 .hds.json 파일도 가져올 수 있어요.';
    acts = '<button class="btn pri" type="button" data-act="new">새 프로젝트</button><button class="btn" type="button" data-act="import">파일 가져오기</button>';
  } else {
    title = '조건에 맞는 프로젝트가 없어요';
    text = '필터를 바꾸거나 해제해 보세요.';
    acts = '<button class="btn" type="button" data-act="reset-filter">필터 해제</button>';
  }
  box.innerHTML = `<div class="art" aria-hidden="true"><i></i><i></i><i></i></div><h3>${esc(title)}</h3><p>${text}</p><div class="acts">${acts}</div>`;
}

function renderBulk() {
  const bar = $('bulk');
  const n = state.selected.size;
  bar.hidden = n === 0;
  if (!n) { bar.replaceChildren(); return; }
  const trash = state.view === 'trash';
  const btn = (act, ico, label, cls = '') => `<button type="button" class="${cls}" data-bulk="${act}" aria-label="${label}" title="${label}"><span class="ico">${icon(ico)}</span><span class="t">${label}</span></button>`;
  bar.innerHTML = `<span class="n">${n}개 선택됨</span>`
    + (trash
      ? btn('restore', 'restore', '복원') + btn('purge', 'trash', '영구 삭제', 'del')
      : btn('fav', 'star', '즐겨찾기') + btn('export', 'download', '내보내기') + btn('trash', 'trash', '삭제', 'del'))
    + `<button type="button" class="x" data-bulk="clear" aria-label="선택 해제" title="선택 해제 (Esc)"><span class="ico">${icon('x')}</span></button>`;
}

/** 프로젝트 본문으로 썸네일 SVG 를 만든다 — 캡처 배경이 있으면 작게 줄여 함께 넣는다 */
async function buildThumb(doc) {
  const cover = docPages(doc)[0];
  const bg = cover.background ? await makeBgThumb(cover.background) : null;
  return thumbnailSvg(cover.shapes, cover.canvas, { background: bg });
}
const quickThumb = (doc) => { const cover = docPages(doc)[0]; return thumbnailSvg(cover.shapes, cover.canvas); };

/** 썸네일이 없거나 캡처 배경이 빠진 프로젝트 — 첫 화면을 그린 뒤 하나씩 다시 만든다 */
const thumbQueue = [];
let thumbRunning = false;
function fillMissingThumbs(ids) {
  for (const id of ids) if (!thumbQueue.includes(id)) thumbQueue.push(id);
  if (thumbRunning) return;
  thumbRunning = true;
  const step = async () => {
    const id = thumbQueue.shift();
    if (!id) { thumbRunning = false; return; }
    try {
      const doc = store.get(id);
      if (doc) {
        const svg = await buildThumb(doc);
        store.setThumb(id, svg);
        store.setMeta(id, { hasBg: docPages(doc).some((pg) => !!pg.background) }); // 다음부터는 이 프로젝트를 다시 검사하지 않는다
        const th = grid.querySelector(`.card[data-id="${CSS.escape(id)}"] .thumb`);
        if (th) th.innerHTML = `<img alt="" src="${svgDataUrl(svg)}">`;
      }
    } catch (e) { console.error(e); }
    setTimeout(step, 20);
  };
  setTimeout(step, 50);
}

// ── 선택 ─────────────────────────────────────────────────
function toggleSelect(id, { range = false } = {}) {
  if (range && state.anchor && visibleIds.includes(state.anchor)) {
    const a = visibleIds.indexOf(state.anchor);
    const b = visibleIds.indexOf(id);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    visibleIds.slice(lo, hi + 1).forEach((x) => state.selected.add(x));
  } else if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    state.selected.add(id);
  }
  state.anchor = id;
  render();
}
const clearSelection = () => { if (state.selected.size) { state.selected.clear(); state.anchor = null; render(); } };

// ── 프로젝트 조작 ────────────────────────────────────────
function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };

function exportProjects(ids) {
  const items = ids.map((id) => ({ meta: store.meta(id), doc: store.get(id) })).filter((x) => x.meta && x.doc);
  if (!items.length) { toast('내보낼 프로젝트가 없어요'); return; }
  if (items.length === 1) {
    const { meta, doc } = items[0];
    download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${safeFileName(meta.name)}.hds.json`);
    toast(`"${meta.name}" 을(를) 내보냈어요`);
    return;
  }
  if (!window.fflate) { toast('압축 라이브러리를 불러오지 못했어요'); return; }
  const files = {};
  const used = new Set();
  for (const { meta, doc } of items) {
    let base = safeFileName(meta.name);
    let n = 2;
    while (used.has(base)) base = `${safeFileName(meta.name)} (${n++})`;
    used.add(base);
    files[`${base}.hds.json`] = window.fflate.strToU8(JSON.stringify(doc, null, 2));
  }
  download(new Blob([window.fflate.zipSync(files)], { type: 'application/zip' }), `하이스케치_프로젝트_${stamp()}.zip`);
  toast(`${items.length}개 프로젝트를 zip 으로 내보냈어요`);
}

async function renameProject(id) {
  const m = store.meta(id);
  if (!m) return;
  const r = await showDialog({
    title: '프로젝트 이름 바꾸기',
    input: { label: '프로젝트 이름', value: m.name, maxLength: NAME_MAX },
    buttons: [{ label: '취소', action: 'cancel' }, { label: '바꾸기', action: 'ok', kind: 'primary' }],
  });
  if (!r || r.action !== 'ok') return;
  const n = cleanName(r.value);
  if (!n || n === m.name) return;
  let res = null;
  try { res = store.rename(id, n); } catch (e) { console.error(e); }
  if (!res) { toast('같은 이름의 프로젝트가 이미 있어요'); return; }
  render();
}

function duplicateProject(id) {
  let copy = null;
  try { copy = store.duplicate(id); } catch (e) { console.error(e); }
  if (!copy) { toast('사본을 만들지 못했어요 (저장 공간을 확인해 주세요)'); return; }
  render();
  toast(`"${copy.name}" 을(를) 만들었어요`, { actionLabel: '열기', onAction: () => goEditor(copy.id), ms: 4500 });
}

function setFavorite(ids, on) {
  ids.forEach((id) => store.setFavorite(id, on));
  render();
}

function trashProjects(ids) {
  const trashed = ids.filter((id) => store.trash(id));
  state.selected.clear();
  render();
  if (!trashed.length) return;
  const label = trashed.length === 1 ? `"${store.meta(trashed[0])?.name}"` : `${trashed.length}개 프로젝트`;
  toast(`${label} 을(를) 휴지통으로 옮겼어요`, {
    actionLabel: '실행 취소', ms: 5500,
    onAction: () => { trashed.forEach((id) => store.restore(id)); render(); },
  });
}

function restoreProjects(ids) {
  ids.forEach((id) => store.restore(id));
  state.selected.clear();
  render();
  toast(`${ids.length}개 프로젝트를 복원했어요`);
}

async function purgeProjects(ids) {
  const one = ids.length === 1 ? store.meta(ids[0])?.name : null;
  const r = await showDialog({
    title: '영구 삭제',
    message: `${one ? `"${one}" 프로젝트를` : `선택한 ${ids.length}개 프로젝트를`} 영구 삭제할까요?\n이 작업은 되돌릴 수 없어요.`,
    buttons: [{ label: '취소', action: 'cancel' }, { label: '영구 삭제', action: 'del', kind: 'danger' }],
  });
  if (!r || r.action !== 'del') return;
  ids.forEach((id) => store.remove(id));
  state.selected.clear();
  render();
  toast('영구 삭제했어요');
}

async function emptyTrash() {
  const n = store.list({ trashed: true }).length;
  if (!n) return;
  const r = await showDialog({
    title: '휴지통 비우기',
    message: `휴지통의 프로젝트 ${n}개를 모두 영구 삭제할까요?\n이 작업은 되돌릴 수 없어요.`,
    buttons: [{ label: '취소', action: 'cancel' }, { label: '모두 삭제', action: 'del', kind: 'danger' }],
  });
  if (!r || r.action !== 'del') return;
  store.emptyTrash();
  render();
  toast('휴지통을 비웠어요');
}

// ── ⋯ · 우클릭 메뉴 ─────────────────────────────────────
let menuEl = null;
let menuAnchor = null;
function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
  if (menuAnchor) { menuAnchor.setAttribute('aria-expanded', 'false'); menuAnchor = null; }
}
function showMenu(items, x, y, anchor = null) {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'ctx';
  el.setAttribute('role', 'menu');
  for (const it of items) {
    if (it === '-') { el.append(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    if (it.danger) b.className = 'dng';
    b.innerHTML = `<span class="ico">${icon(it.icon)}</span>${esc(it.label)}`;
    b.addEventListener('click', () => { closeMenu(); it.run(); });
    el.append(b);
  }
  document.body.append(el);
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
  menuEl = el;
  if (anchor) { menuAnchor = anchor; anchor.setAttribute('aria-expanded', 'true'); }
  el.querySelector('button')?.focus();
}

function menuFor(id) {
  const m = store.meta(id);
  if (!m) return [];
  const multi = state.selected.size > 1 && state.selected.has(id);
  const ids = multi ? [...state.selected] : [id];
  if (m.trashedAt) {
    return [
      { icon: 'restore', label: multi ? `${ids.length}개 복원` : '복원', run: () => restoreProjects(ids) },
      '-',
      { icon: 'trash', label: multi ? `${ids.length}개 영구 삭제` : '영구 삭제', danger: true, run: () => purgeProjects(ids) },
    ];
  }
  if (multi) {
    return [
      { icon: 'star', label: `${ids.length}개 즐겨찾기 추가`, run: () => setFavorite(ids, true) },
      { icon: 'download', label: `${ids.length}개 내보내기 (zip)`, run: () => exportProjects(ids) },
      '-',
      { icon: 'trash', label: `${ids.length}개 삭제`, danger: true, run: () => trashProjects(ids) },
    ];
  }
  return [
    { icon: 'open', label: '열기', run: () => goEditor(id) },
    { icon: 'edit', label: '이름 바꾸기', run: () => renameProject(id) },
    { icon: 'copy', label: '사본 만들기', run: () => duplicateProject(id) },
    { icon: 'star', label: m.favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가', run: () => setFavorite([id], !m.favorite) },
    '-',
    { icon: 'download', label: '파일로 내보내기', run: () => exportProjects([id]) },
    '-',
    { icon: 'trash', label: '삭제 (휴지통)', danger: true, run: () => trashProjects([id]) },
  ];
}

// ── 가져오기(.hds.json · zip) ────────────────────────────
const baseName = (path) => String(path).split(/[\\/]/).pop().replace(/(\.hds)?\.json$/i, '');

async function readDocs(file) {
  if (/\.zip$/i.test(file.name)) {
    if (!window.fflate) throw new Error('압축 라이브러리 없음');
    const entries = window.fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
    return Object.entries(entries)
      .filter(([n]) => /\.json$/i.test(n) && !n.startsWith('__MACOSX'))
      .map(([n, data]) => ({ name: baseName(n), doc: JSON.parse(window.fflate.strFromU8(data)) }));
  }
  const doc = JSON.parse(await file.text());
  return [{ name: baseName(file.name), doc }];
}

async function importFiles(files) {
  let ok = 0; let fail = 0; let last = null;
  for (const f of files) {
    let docs = [];
    try { docs = await readDocs(f); } catch { fail++; continue; }
    for (const { name, doc } of docs) {
      if (!isProjectDoc(doc)) { fail++; continue; }
      try {
        const meta = store.create({
          name: doc.projectName || name,
          doc: { ...doc, systemName: doc.systemName || sysName(doc.systemId) || null },
          thumb: quickThumb(doc),
        });
        ok++; last = meta;
      } catch (e) {
        console.error(e);
        fail++;
      }
    }
  }
  render();
  if (ok && !fail) {
    toast(ok === 1 && last ? `"${last.name}" 을(를) 가져왔어요` : `${ok}개 프로젝트를 가져왔어요`,
      ok === 1 && last ? { actionLabel: '열기', onAction: () => goEditor(last.id), ms: 4500 } : {});
  } else if (ok) {
    toast(`${ok}개를 가져왔고 ${fail}개는 읽지 못했어요`);
  } else {
    toast('가져올 수 있는 프로젝트 파일이 아니에요 (.hds.json 또는 zip)');
  }
}

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.json,.zip,application/json,application/zip';
fileInput.multiple = true;
fileInput.hidden = true;
document.body.append(fileInput);
fileInput.addEventListener('change', () => {
  const files = [...fileInput.files];
  fileInput.value = '';
  if (files.length) importFiles(files);
});

// 파일 끌어다 놓기
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; $('dropMask').hidden = false; } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('dropMask').hidden = true; } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('dropMask').hidden = true;
  const files = [...e.dataTransfer.files];
  if (files.length) importFiles(files);
});

// ── 새 프로젝트 ──────────────────────────────────────────
const lastSystem = () => {
  let v = null;
  try { v = localStorage.getItem(LAST_SYS_KEY); } catch { /* 무시 */ }
  if (v && systems.some((s) => s.id === v)) return v;
  return systems.find((s) => s.id === 'salesportal')?.id || systems[0]?.id || null;
};
const rememberSystem = (id) => { if (id) { try { localStorage.setItem(LAST_SYS_KEY, id); } catch { /* 무시 */ } } };

function newDoc({ name, template, size, systemId }) {
  const canvas = size || boardSizeFor(template);
  return makeDoc({
    projectName: name, systemId, systemName: sysName(systemId),
    pages: [{ screenName: '새 화면', mode: 'new', template, canvas, baseBoard: canvas, shapes: templateShapes(template) }],
  });
}

/** 화면 유형을 골라 바로 만든다(빠른 시작) */
function quickCreate(template) {
  const systemId = lastSystem();
  const doc = newDoc({ name: UNTITLED, template, systemId });
  try {
    const meta = store.create({ name: UNTITLED, doc, thumb: quickThumb(doc) });
    goEditor(meta.id);
  } catch (e) {
    console.error(e);
    toast('브라우저 저장 공간이 부족해요 · 안 쓰는 프로젝트를 정리해 주세요');
  }
}

const SIZE_OPTS = [
  { key: 'default', label: '기본', sub: '유형에 맞춤' },
  { key: 'pcScroll', label: 'PC · 스크롤', sub: '960 × 1400', w: 960, h: 1400 },
  { key: 'mobile', label: '모바일', sub: '390 × 844', w: 390, h: 844 },
  { key: 'custom', label: '직접 입력', sub: '가로 × 세로' },
];

function openWizard({ template = 'blank', mode = 'new' } = {}) {
  closeMenu();
  if (document.querySelector('.wiz')) return;
  const prevFocus = document.activeElement;
  const st = {
    mode, template, sizeKey: 'default', cw: 960, ch: 600,
    systemId: lastSystem(), screens: [], screenId: '', screenDef: null, screensErr: '', busy: false,
  };

  const mask = document.createElement('div');
  mask.className = 'dlg-mask';
  mask.innerHTML =
    '<div class="dlg wiz" role="dialog" aria-modal="true" aria-labelledby="wizTitle">'
    + '<div class="wiz-hd"><b id="wizTitle">새 프로젝트 만들기</b><button type="button" class="x" aria-label="닫기"><span class="ico" data-i="x"></span></button></div>'
    + '<div class="wiz-bd"><div class="wiz-form">'
    + '<div class="fld"><label for="wName">프로젝트 이름</label><input id="wName" type="text" maxlength="' + NAME_MAX + '" placeholder="' + esc(UNTITLED) + '" autocomplete="off"></div>'
    + '<div class="fld"><span class="lbl" id="wModeLbl">작업 구분</span><div class="seg3" id="wMode" role="radiogroup" aria-labelledby="wModeLbl">'
    + '<button type="button" role="radio" data-m="new">신규 화면</button><button type="button" role="radio" data-m="edit">변경 화면</button></div>'
    + '<p class="hint" id="wModeHint"></p></div>'
    + '<div class="fld"><label for="wSys">시스템</label><select id="wSys"></select></div>'
    + '<div id="wNew"><div class="fld"><span class="lbl">화면 유형</span><div class="tpl-grid" id="wTpls"></div></div>'
    + '<div class="fld" style="margin-top:16px"><span class="lbl">화면 크기</span><div class="size-row" id="wSizes"></div>'
    + '<div class="size-custom" id="wCustom" hidden><input id="wCw" type="number" min="320" max="3000" aria-label="가로"><span>×</span><input id="wCh" type="number" min="240" max="4000" aria-label="세로"><span class="hint">px (가로 320~3000 · 세로 240~4000)</span></div></div></div>'
    + '<div id="wEdit" hidden><div class="fld"><label for="wScr">변경할 화면</label><select id="wScr"></select><p class="hint" id="wScrHint"></p></div></div>'
    + '</div><div class="wiz-pv"><div class="pvbox" id="wPv"></div><div class="cap" id="wCap"></div></div></div>'
    + '<div class="wiz-ft"><button type="button" class="btn" id="wCancel">취소</button><button type="button" class="btn pri" id="wOk">만들기</button></div>'
    + '</div>';
  document.body.append(mask);
  fillIcons(mask);
  const q = (sel) => mask.querySelector(sel);

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    mask.remove();
    try { prevFocus?.focus?.(); } catch { /* 무시 */ }
  };
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [...mask.querySelectorAll('input:not([hidden]),select,button')].filter((el) => el.offsetParent !== null && !el.disabled);
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });
  q('.wiz-hd .x').addEventListener('click', close);
  q('#wCancel').addEventListener('click', close);

  const curSize = () => {
    if (st.sizeKey === 'custom') return { w: Math.max(320, Math.min(3000, st.cw || 960)), h: Math.max(240, Math.min(4000, st.ch || 600)) };
    const o = SIZE_OPTS.find((s) => s.key === st.sizeKey);
    return o?.w ? { w: o.w, h: o.h } : boardSizeFor(st.template);
  };

  function paintPreview() {
    const box = q('#wPv');
    const cap = q('#wCap');
    if (st.mode === 'new') {
      const sz = curSize();
      box.innerHTML = `<img alt="선택한 화면 유형 미리보기" src="${tplThumb2(st.template, sz)}">`;
      const nm = TPL_INFO.find((t) => t.key === st.template)?.name || '';
      cap.innerHTML = `${esc(nm)}<small>${sz.w} × ${sz.h}</small>`;
    } else if (st.screenDef) {
      const d = st.screenDef;
      box.innerHTML = `<img alt="선택한 화면 미리보기" src="${svgDataUrl(thumbnailSvg(d.shapes, d.canvas))}">`;
      cap.innerHTML = `${esc(d.name || '')}<small>${d.canvas?.w || 960} × ${d.canvas?.h || 600} · 요소 ${(d.shapes || []).length}개</small>`;
    } else {
      box.innerHTML = '<div class="hint" style="text-align:center">변경할 화면을 고르면<br>여기에 미리 보여줘요</div>';
      cap.textContent = '';
    }
  }
  const tplThumb2 = (key, sz) => svgDataUrl(thumbnailSvg(templateShapes(key), sz));

  function paintMode() {
    mask.querySelectorAll('#wMode button').forEach((b) => {
      const on = b.dataset.m === st.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    q('#wNew').hidden = st.mode !== 'new';
    q('#wEdit').hidden = st.mode !== 'edit';
    q('#wModeHint').textContent = st.mode === 'new'
      ? '새로 그리는 화면이에요. 유형을 고르면 기본 배치가 깔려요.'
      : '이미 있는 화면을 불러와 고치는 작업이에요. 원본은 바뀌지 않아요.';
    q('#wOk').disabled = false;
    paintPreview();
  }

  function paintTpls() {
    q('#wTpls').replaceChildren(...TPL_INFO.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tpl-opt' + (st.template === t.key ? ' on' : '');
      b.setAttribute('aria-pressed', String(st.template === t.key));
      b.innerHTML = `<div class="pv"><img alt="" src="${tplThumb(t.key)}"></div><span>${esc(t.name)}</span>`;
      b.addEventListener('click', () => { st.template = t.key; paintTpls(); paintSizes(); paintPreview(); });
      return b;
    }));
  }
  function paintSizes() {
    q('#wSizes').replaceChildren(...SIZE_OPTS.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'size-opt' + (st.sizeKey === o.key ? ' on' : '');
      b.setAttribute('aria-pressed', String(st.sizeKey === o.key));
      const sub = o.key === 'default' ? `${boardSizeFor(st.template).w} × ${boardSizeFor(st.template).h}` : o.sub;
      b.innerHTML = `${esc(o.label)}<small>${esc(sub)}</small>`;
      b.addEventListener('click', () => { st.sizeKey = o.key; paintSizes(); paintPreview(); });
      return b;
    }));
    q('#wCustom').hidden = st.sizeKey !== 'custom';
  }

  const selSys = q('#wSys');
  if (!systems.length) {
    selSys.innerHTML = '<option value="">시스템 목록을 불러오지 못했어요 (나중에 에디터에서 고를 수 있어요)</option>';
  } else {
    selSys.innerHTML = systems.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.sub ? ` — ${esc(s.sub)}` : ''}</option>`).join('');
    selSys.value = st.systemId || '';
  }

  async function loadScreens() {
    const scr = q('#wScr');
    const hint = q('#wScrHint');
    st.screens = []; st.screenId = ''; st.screenDef = null; st.screensErr = '';
    if (!st.systemId) { scr.innerHTML = '<option value="">시스템을 먼저 골라 주세요</option>'; hint.textContent = ''; paintPreview(); return; }
    scr.innerHTML = '<option value="">불러오는 중…</option>';
    try {
      const list = await api.getScreens(st.systemId);
      if (!document.body.contains(mask) || st.systemId !== selSys.value) return;
      st.screens = list;
      scr.innerHTML = list.length
        ? '<option value="">화면을 선택하세요</option>' + list.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.template ? ` (${esc(s.template)})` : ''}</option>`).join('')
        : '<option value="">등록된 화면이 없어요</option>';
      hint.textContent = list.length ? `${list.length}개의 화면이 있어요.` : '이 시스템에는 변경할 수 있는 화면이 아직 없어요.';
      hint.className = 'hint';
    } catch (e) {
      console.error(e);
      st.screensErr = '화면 목록을 불러오지 못했어요';
      scr.innerHTML = '<option value="">불러오지 못했어요</option>';
      hint.textContent = '서버가 켜져 있는지 확인해 주세요(npm run dev).';
      hint.className = 'hint err';
    }
    paintPreview();
  }

  selSys.addEventListener('change', () => {
    st.systemId = selSys.value || null;
    // 신규 모드에서 시스템을 바꾼 뒤 변경 모드로 넘어가면 이전 시스템의 화면 목록이 그대로 남아 있었다 — 항상 비운다
    st.screens = []; st.screenId = ''; st.screenDef = null; st.screensErr = '';
    if (st.mode === 'edit') loadScreens();
  });
  q('#wScr').addEventListener('change', async (e) => {
    st.screenId = e.target.value;
    st.screenDef = null;
    paintPreview();
    if (!st.screenId) return;
    try {
      const def = await api.getScreen(st.screenId);
      if (st.screenId === e.target.value) { st.screenDef = def; paintPreview(); }
    } catch (err) { console.error(err); q('#wScrHint').textContent = '화면 내용을 불러오지 못했어요'; q('#wScrHint').className = 'hint err'; }
  });
  mask.querySelectorAll('#wMode button').forEach((b) => b.addEventListener('click', () => {
    st.mode = b.dataset.m;
    paintMode();
    if (st.mode === 'edit' && !st.screens.length && !st.screensErr) loadScreens();
  }));
  q('#wCw').value = st.cw;
  q('#wCh').value = st.ch;
  q('#wCw').addEventListener('input', (e) => { st.cw = parseInt(e.target.value, 10) || 0; paintPreview(); });
  q('#wCh').addEventListener('input', (e) => { st.ch = parseInt(e.target.value, 10) || 0; paintPreview(); });

  async function create() {
    if (st.busy) return;
    const name = cleanName(q('#wName').value) || UNTITLED;
    let doc;
    if (st.mode === 'new') {
      doc = newDoc({ name, template: st.template, size: curSize(), systemId: st.systemId });
    } else {
      if (!st.screenId) { q('#wScrHint').textContent = '변경할 화면을 먼저 골라 주세요'; q('#wScrHint').className = 'hint err'; q('#wScr').focus(); return; }
      st.busy = true;
      q('#wOk').disabled = true;
      try {
        const def = st.screenDef || await api.getScreen(st.screenId);
        doc = makeDoc({
          projectName: name, systemId: st.systemId, systemName: sysName(st.systemId),
          pages: [{
            screenName: def.name || '변경 화면', mode: 'edit', template: def.template || 'blank', baseScreenId: st.screenId,
            canvas: def.canvas || boardSizeFor('blank'), shapes: def.shapes || [],
          }],
        });
      } catch (e) {
        console.error(e);
        toast('화면 내용을 불러오지 못했어요');
        st.busy = false;
        q('#wOk').disabled = false;
        return;
      }
      st.busy = false;
    }
    try {
      const meta = store.create({ name, doc, thumb: quickThumb(doc) });
      rememberSystem(st.systemId);
      close();
      goEditor(meta.id);
    } catch (e) {
      console.error(e);
      q('#wOk').disabled = false;
      toast('브라우저 저장 공간이 부족해요 · 안 쓰는 프로젝트를 정리해 주세요');
    }
  }
  q('#wOk').addEventListener('click', create);
  q('#wName').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); create(); } });

  paintTpls();
  paintSizes();
  paintMode();
  if (st.mode === 'edit') loadScreens();
  q('#wName').focus();
}

// ── 이전 버전의 자동 저장 초안 → 프로젝트로 옮기기 ────────
/** 예전 에디터는 "작업 중 화면 1개" 를 hds:autosave 에 뒀다. 프로젝트 방식으로 바뀌었으므로 한 번 옮기고 지운다. */
function migrateLegacyDraft() {
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem('hds:autosave') || 'null'); } catch { snap = null; }
  if (!snap) return;
  try { localStorage.removeItem('hds:autosave'); } catch { /* 무시 */ }
  if (!Array.isArray(snap.shapes) || (!snap.shapes.length && !snap.background)) return;
  // 이미 프로젝트에 저장돼 있던 내용(변경 없음)이면 옮길 필요가 없다
  if (snap.projectId && store.has(snap.projectId) && snap.projectDirty === false) return;
  const doc = {
    app: 'hds', version: 1, savedAt: new Date().toISOString(),
    screenName: snap.scrName || '새 화면', systemId: snap.systemId || null,
    mode: snap.workMode === 'edit' ? 'edit' : 'new', template: snap.currentTpl || 'blank',
    baseScreenId: snap.workMode === 'edit' ? (snap.loadedScreenId || null) : null,
    canvas: snap.canvas || { w: 960, h: 600 }, shapes: snap.shapes,
    ...(snap.background ? { background: snap.background } : {}),
  };
  try {
    const meta = store.create({ name: '이어서 작업하던 화면', doc, thumb: quickThumb(doc) });
    toast(`이전에 작업하던 화면을 "${meta.name}" 프로젝트로 옮겼어요`, { actionLabel: '열기', onAction: () => goEditor(meta.id), ms: 7000 });
  } catch (e) { console.error(e); }
}

// ── 이벤트 연결 ──────────────────────────────────────────
function closeSide() {
  $('side').classList.remove('open');
  $('scrim').hidden = true;
  $('btnMenu').setAttribute('aria-expanded', 'false');
}

function initEvents() {
  // 새 프로젝트
  $('btnNew').addEventListener('click', () => openWizard());
  $('btnNew2').addEventListener('click', () => openWizard());
  $('btnImport').addEventListener('click', () => fileInput.click());

  // 빠른 시작 타일
  const tiles = $('tiles');
  tiles.replaceChildren(
    ...TPL_INFO.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', `${t.name} — 바로 새 프로젝트 만들기`);
      b.innerHTML = `<div class="pv"><img alt="" src="${tplThumb(t.key)}"></div><b>${esc(t.name)}</b><small>${esc(t.sub)}</small>`;
      b.addEventListener('click', () => quickCreate(t.key));
      return b;
    }),
    (() => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', '변경 화면 — 기존 화면을 불러와 수정');
      b.innerHTML = `<div class="pv change"><span class="ico">${icon('edit')}</span></div><b>변경 화면</b><small>기존 화면 불러와 수정</small>`;
      b.addEventListener('click', () => openWizard({ mode: 'edit' }));
      return b;
    })(),
  );

  // 보기 전환
  document.querySelectorAll('#nav .nav-item').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    if (state.view === 'all') state.systemId = null;
    state.selected.clear();
    closeSide();
    render();
  }));
  $('sysNav').addEventListener('click', (e) => {
    const b = e.target.closest('.sys-item');
    if (!b) return;
    state.systemId = state.systemId === b.dataset.sys ? null : b.dataset.sys;
    if (state.view === 'trash') state.view = 'all';
    closeSide();
    render();
  });

  // 검색 · 필터 · 정렬 · 보기 방식
  let qTimer = null;
  $('q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value; render(); }, 90);
  });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('q').value) { $('q').value = ''; state.q = ''; render(); } else $('q').blur(); }
  });
  $('modeChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip-btn');
    if (!b) return;
    state.mode = b.dataset.mode;
    savePrefs();
    render();
  });
  $('sort').innerHTML = SORTS.map((s) => `<option value="${s.key}">${s.label}</option>`).join('');
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; savePrefs(); render(); });
  $('layoutSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.layout = b.dataset.layout;
    savePrefs();
    render();
  });
  $('btnEmptyTrash').addEventListener('click', emptyTrash);

  // 빈 상태 버튼
  $('empty').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'new') openWizard();
    else if (a === 'import') fileInput.click();
    else if (a === 'clear-q') { $('q').value = ''; state.q = ''; render(); }
    else if (a === 'reset-filter') { state.mode = 'all'; state.systemId = null; savePrefs(); render(); }
  });

  // 카드: 열기 / 선택 / 즐겨찾기 / 메뉴
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.chk')) { toggleSelect(id, { range: e.shiftKey }); return; }
    if (e.target.closest('.fav')) { const m = store.meta(id); if (m) setFavorite([id], !m.favorite); return; }
    if (e.target.closest('.more')) {
      const btn = e.target.closest('.more');
      if (menuAnchor === btn) { closeMenu(); return; }
      const r = btn.getBoundingClientRect();
      showMenu(menuFor(id), r.right - 196, r.bottom + 4, btn);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey) { toggleSelect(id, { range: e.shiftKey }); return; }
    if (state.selected.size) { toggleSelect(id); return; }
    if (store.meta(id)?.trashedAt) { toggleSelect(id); return; }
    goEditor(id);
  });
  grid.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    showMenu(menuFor(card.dataset.id), e.clientX, e.clientY);
  });
  grid.addEventListener('keydown', (e) => {
    const card = e.target.closest('.card');
    if (!card || e.target !== card) return;
    const id = card.dataset.id;
    if (e.key === 'Enter') { e.preventDefault(); if (state.selected.size || store.meta(id)?.trashedAt) toggleSelect(id); else goEditor(id); }
    else if (e.key === ' ') { e.preventDefault(); toggleSelect(id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const ids = state.selected.has(id) ? [...state.selected] : [id];
      if (state.view === 'trash') purgeProjects(ids); else trashProjects(ids);
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = card.getBoundingClientRect();
      showMenu(menuFor(id), r.left + 24, r.top + 24);
    } else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      const cards = [...grid.querySelectorAll('.card')];
      const i = cards.indexOf(card);
      const perRow = state.layout === 'list' ? 1 : Math.max(1, Math.round(grid.clientWidth / (card.offsetWidth + 20)));
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + perRow, ArrowUp: i - perRow }[e.key];
      if (cards[next]) { e.preventDefault(); cards[next].focus(); }
    }
  });

  // 선택 막대
  $('bulk').addEventListener('click', (e) => {
    const act = e.target.closest('[data-bulk]')?.dataset.bulk;
    const ids = [...state.selected];
    if (act === 'clear') clearSelection();
    else if (act === 'fav') { setFavorite(ids, true); toast(`${ids.length}개를 즐겨찾기에 추가했어요`); }
    else if (act === 'export') exportProjects(ids);
    else if (act === 'trash') trashProjects(ids);
    else if (act === 'restore') restoreProjects(ids);
    else if (act === 'purge') purgeProjects(ids);
  });

  // 메뉴 닫기
  document.addEventListener('mousedown', (e) => { if (menuEl && !e.target.closest('.ctx') && !e.target.closest('.more')) closeMenu(); });
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);

  // 전역 단축키
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (menuEl) { closeMenu(); return; }
      if (!document.querySelector('.dlg-mask') && state.selected.size) clearSelection();
      return;
    }
    if (document.querySelector('.dlg-mask')) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (typing || e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing) { e.preventDefault(); visibleIds.forEach((id) => state.selected.add(id)); render(); }
      return;
    }
    if (e.key === '/') { e.preventDefault(); $('q').focus(); $('q').select(); }
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); openWizard(); }
    else if ((e.key === 'Delete') && state.selected.size) {
      const ids = [...state.selected];
      if (state.view === 'trash') purgeProjects(ids); else trashProjects(ids);
    }
  });

  // 모바일 사이드바
  $('btnMenu').addEventListener('click', () => {
    const open = !$('side').classList.contains('open');
    $('side').classList.toggle('open', open);
    $('scrim').hidden = !open;
    $('btnMenu').setAttribute('aria-expanded', String(open));
  });
  $('scrim').addEventListener('click', closeSide);

  // 다른 탭·에디터에서 돌아왔을 때 목록 갱신
  window.addEventListener('storage', (e) => { if (!e.key || e.key.startsWith('hds:')) scheduleRender(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) render(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleRender(); });
  // 시간 표기("3분 전")가 오래 열어 둬도 맞도록 1분마다
  setInterval(() => { if (document.visibilityState === 'visible' && !menuEl) render(); }, 60_000);
}
// ── 시작 ─────────────────────────────────────────────────
fillIcons();
initEvents();
store.purgeExpired();
migrateLegacyDraft();
render();

const systemsReady = api.getSystems().then((list) => {
  systems = list;
  render();
}).catch((e) => console.warn('시스템 목록을 불러오지 못했습니다(API 서버 미기동?)', e));

const params = new URLSearchParams(location.search);
if (params.has('missing')) toast('열려던 프로젝트를 찾지 못했어요. 삭제되었을 수 있어요.');
if (params.has('new') || params.has('missing') || params.has('q')) {
  if (params.has('new')) systemsReady.finally(() => openWizard());
  history.replaceState(null, '', location.pathname);
}
