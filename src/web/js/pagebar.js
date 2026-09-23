// 에디터 하단 화면(페이지) 띠 — 캔바·미리캔버스의 페이지 목록처럼 썸네일로 화면을 고르고,
// 추가·복제·삭제·순서 바꾸기(메뉴 또는 끌어서 놓기)를 한다. 상태는 main.js 가 들고 있고 여기선 그리기만 한다.

import { thumbnailSvg, svgDataUrl, makeBgThumb } from './thumbnail.js';

// ── 캡처 배경 썸네일 캐시 — 원본(수백 KB~MB)을 줄인 이미지를 한 번만 만든다(홈 카드 썸네일도 같이 쓴다)
const bgCache = new Map(); // key → url | null(만드는 중)
const bgKey = (src) => `${src.length}:${src.slice(-48)}`;
/**
 * 줄인 배경 이미지를 돌려준다. 아직 없으면 만들기 시작하고 null — 다 만들어지면 onReady(url) 을 부른다.
 * @returns {string|null}
 */
export function cachedBgThumb(src, onReady) {
  if (typeof src !== 'string' || !src.startsWith('data:image/')) return null;
  const k = bgKey(src);
  if (bgCache.has(k)) return bgCache.get(k);
  bgCache.set(k, null);
  makeBgThumb(src).then((url) => {
    bgCache.set(k, url);
    if (url) onReady?.(url);
  });
  return null;
}

/** 페이지 썸네일 SVG 문자열(배경이 준비 안 됐으면 요소만) */
export function pageThumbSvg(page, onBgReady) {
  return thumbnailSvg(page.shapes, page.canvas, { background: cachedBgThumb(page.background, onBgReady) });
}

// 접어 둔 상태는 브라우저에 기억해 둔다(다음에 열 때도 그대로). 한 번도 고른 적이 없으면 화면이 하나일 때만 접는다.
const COLLAPSE_KEY = 'hds:pagebar';
function readCollapsePref() {
  try { return localStorage.getItem(COLLAPSE_KEY); } catch { return null; }
}
function writeCollapsePref(v) {
  try { localStorage.setItem(COLLAPSE_KEY, v); } catch { /* 저장 못 해도 동작에는 지장 없음 */ }
}

const thumbUrlCache = new Map();
function thumbUrl(page, onBgReady) {
  const svg = pageThumbSvg(page, onBgReady);
  let url = thumbUrlCache.get(svg);
  if (!url) {
    url = svgDataUrl(svg);
    if (thumbUrlCache.size > 200) thumbUrlCache.clear();
    thumbUrlCache.set(svg, url);
  }
  return url;
}

/**
 * @param {HTMLElement} root  #pageBar
 * @param {{
 *   onSelect:(i:number)=>void, onAdd:()=>void, onDuplicate:(i:number)=>void,
 *   onDelete:(i:number)=>void, onMove:(from:number,to:number)=>void, maxPages:number,
 * }} cb
 */
export function createPageBar(root, cb) {
  let pages = [];
  let active = 0;
  let menu = null;
  let dragFrom = -1;

  let collapsed = readCollapsePref() === 'mini';
  let userChose = readCollapsePref() != null;

  const list = document.createElement('div');
  list.className = 'pg-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '화면 목록');
  list.setAttribute('aria-orientation', 'horizontal');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'pg-add';
  add.title = '새 화면 추가';
  add.innerHTML = '<span aria-hidden="true">＋</span>화면 추가';
  add.addEventListener('click', () => cb.onAdd());

  // 접었을 때 줄 하나로 남는 조작부 — 이전/다음 화면, 번호, 화면 추가
  const mini = document.createElement('div');
  mini.className = 'pg-mini';
  const miniPrev = document.createElement('button');
  miniPrev.type = 'button';
  miniPrev.className = 'pg-nav';
  miniPrev.textContent = '‹';
  miniPrev.title = '이전 화면 (PgUp)';
  miniPrev.setAttribute('aria-label', '이전 화면');
  miniPrev.addEventListener('click', () => cb.onSelect(active - 1));
  const miniNext = document.createElement('button');
  miniNext.type = 'button';
  miniNext.className = 'pg-nav';
  miniNext.textContent = '›';
  miniNext.title = '다음 화면 (PgDn)';
  miniNext.setAttribute('aria-label', '다음 화면');
  miniNext.addEventListener('click', () => cb.onSelect(active + 1));
  const miniLabel = document.createElement('button');
  miniLabel.type = 'button';
  miniLabel.className = 'pg-mini-label';
  miniLabel.title = '화면 목록 펼치기';
  miniLabel.addEventListener('click', () => setCollapsed(false));
  const miniAdd = document.createElement('button');
  miniAdd.type = 'button';
  miniAdd.className = 'pg-nav add';
  miniAdd.textContent = '＋';
  miniAdd.title = '새 화면 추가';
  miniAdd.setAttribute('aria-label', '새 화면 추가');
  miniAdd.addEventListener('click', () => cb.onAdd());
  mini.append(miniPrev, miniLabel, miniNext, miniAdd);

  const count = document.createElement('span');
  count.className = 'pg-count';

  // 접기·펼치기 손잡이 — 서랍 손잡이처럼 띠 위쪽 가운데에 둔다(구석에 있으면 잘 안 보인다).
  // 같은 기능을 하단 도구 모음의 "화면 n/m" 버튼(main.js)에서도 쓴다.
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pg-toggle';
  toggle.setAttribute('aria-controls', root.id || 'pageBar');
  // 엿보기로 펼쳐져 있는 동안 눌러도 "펼친 상태로 고정"이 되도록, 지금 접혀 있으면 항상 펼친다
  toggle.addEventListener('click', () => setCollapsed(!collapsed));

  root.replaceChildren(toggle, mini, list, add, count);

  // 접어 둔 상태에서 띠 위에 마우스를 올리면 잠깐 펼쳐 보여 준다(살짝 엿보기).
  // 설정 자체는 바꾸지 않으므로, 마우스를 떼면 다시 접힌다.
  let peekTimer = null;
  const setPeek = (on) => {
    clearTimeout(peekTimer);
    if (on === root.classList.contains('peek')) return;
    root.classList.toggle('peek', on);
    document.body.classList.toggle('pgbar-peek', on);
    if (on) paintList(); // 접혀 있는 동안 밀린 썸네일 갱신
  };
  // 손잡이 위에서는 엿보기를 켜지 않는다 — 손잡이를 누르려고 커서를 가져가는 순간 띠가 펼쳐지면
  // 손잡이가 위로 올라가 버려서(움직이는 표적) 누르기 어려웠다.
  const overHandle = (el) => !!(el && el.closest && el.closest('.pg-toggle'));
  root.addEventListener('mouseover', (e) => {
    if (!collapsed) return;
    clearTimeout(peekTimer);
    if (overHandle(e.target)) return; // 손잡이에 올린 것 — 지금 상태 그대로 둔다
    peekTimer = setTimeout(() => setPeek(true), 220); // 지나가다 살짝 스친 것으로는 안 열리게
  });
  root.addEventListener('mouseout', (e) => {
    // 띠 안(손잡이 포함)에서 자식끼리 옮겨 다니는 건 나가는 게 아니다
    if (e.relatedTarget && root.contains(e.relatedTarget)) return;
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => setPeek(false), 260);
  });

  /** 접기/펼치기 — 캔버스 높이(--pagebar-h)도 같이 바뀐다(styles.css) */
  function setCollapsed(next, remember = true) {
    collapsed = !!next;
    if (remember) { userChose = true; writeCollapsePref(collapsed ? 'mini' : 'full'); }
    if (!collapsed) setPeek(false);
    document.body.classList.toggle('pgbar-peek', collapsed && root.classList.contains('peek'));
    closeMenu();
    paintCollapsed();
  }

  function paintCollapsed() {
    root.classList.toggle('mini', collapsed);
    document.body.classList.toggle('pgbar-mini', collapsed);
    toggle.innerHTML = `<span aria-hidden="true">${collapsed ? '▲' : '▼'}</span>`;
    toggle.title = collapsed ? '화면 목록 펼치기' : '화면 목록 접기';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    miniPrev.disabled = active <= 0;
    miniNext.disabled = active >= pages.length - 1;
    miniAdd.disabled = pages.length >= cb.maxPages;
    miniLabel.textContent = `${active + 1} / ${pages.length} · ${pages[active]?.screenName || '제목 없음'}`;
    cb.onCollapsedChange?.(collapsed, { active, total: pages.length });
  }

  function closeMenu() { menu?.remove(); menu = null; }

  function openMenu(i, x, y) {
    closeMenu();
    const items = [
      { label: '열기', act: () => cb.onSelect(i) },
      { label: '복제', act: () => cb.onDuplicate(i), disabled: pages.length >= cb.maxPages },
      '-',
      { label: '왼쪽으로 옮기기', act: () => cb.onMove(i, i - 1), disabled: i === 0 },
      { label: '오른쪽으로 옮기기', act: () => cb.onMove(i, i + 1), disabled: i === pages.length - 1 },
      '-',
      { label: '삭제', act: () => cb.onDelete(i), danger: true, disabled: pages.length <= 1, sc: 'Del' },
    ];
    menu = document.createElement('div');
    menu.className = 'cmenu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '화면 메뉴');
    items.forEach((it) => {
      if (it === '-') { menu.append(document.createElement('hr')); return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.disabled = !!it.disabled;
      if (it.danger) b.className = 'red';
      const l = document.createElement('span'); l.textContent = it.label;
      const s = document.createElement('span'); s.className = 'sc'; s.textContent = it.sc || '';
      b.append(l, s);
      b.addEventListener('click', () => { closeMenu(); it.act(); });
      menu.append(b);
    });
    document.body.append(menu);
    const mw = menu.offsetWidth || 170; const mh = menu.offsetHeight || 200;
    menu.style.left = Math.max(6, Math.min(x, innerWidth - mw - 8)) + 'px';
    menu.style.top = Math.max(6, Math.min(y - mh, innerHeight - mh - 8)) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
    menu.addEventListener('keydown', (e) => {
      const bs = [...menu.querySelectorAll('button:not(:disabled)')];
      const k = bs.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); list.children[i]?.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(k + 1) % bs.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(k - 1 + bs.length) % bs.length]?.focus(); }
    });
  }
  document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
  window.addEventListener('resize', closeMenu);

  function item(p, i) {
    const el = document.createElement('div');
    el.className = 'pg' + (i === active ? ' on' : '');
    el.dataset.i = String(i);
    el.tabIndex = i === active ? 0 : -1;
    el.draggable = true;
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(i === active));
    el.setAttribute('aria-label', `${i + 1}번 화면 · ${p.screenName || '제목 없음'}`);
    el.title = `${p.screenName || '제목 없음'} — 더블클릭: 이름 고치기 · 끌어서 순서 바꾸기`;
    const th = document.createElement('div');
    th.className = 'pg-th';
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.src = thumbUrl(p, () => render(pages, active));
    th.append(img);
    const nm = document.createElement('div');
    nm.className = 'pg-nm';
    const no = document.createElement('b'); no.textContent = String(i + 1);
    const tx = document.createElement('span'); tx.textContent = p.screenName || '제목 없음';
    nm.append(no, tx);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'pg-more';
    more.tabIndex = -1;
    more.setAttribute('aria-label', `${i + 1}번 화면 메뉴`);
    more.textContent = '⋯';
    more.addEventListener('click', (e) => { e.stopPropagation(); const r = more.getBoundingClientRect(); openMenu(i, r.left, r.top - 4); });
    el.append(th, nm, more);
    return el;
  }

  list.addEventListener('click', (e) => {
    const el = e.target.closest('.pg');
    if (el) cb.onSelect(+el.dataset.i);
  });
  list.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.pg');
    if (el && !e.target.closest('.pg-more')) cb.onRename?.(+el.dataset.i);
  });
  list.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.pg');
    if (!el) return;
    e.preventDefault();
    openMenu(+el.dataset.i, e.clientX, e.clientY);
  });
  list.addEventListener('keydown', (e) => {
    const el = e.target.closest('.pg');
    if (!el) return;
    const i = +el.dataset.i;
    const focusAt = (j) => list.children[j]?.focus();
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cb.onSelect(i); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (e.altKey) cb.onMove(i, i + 1); else focusAt(Math.min(pages.length - 1, i + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (e.altKey) cb.onMove(i, i - 1); else focusAt(Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
    else if (e.key === 'End') { e.preventDefault(); focusAt(pages.length - 1); }
    else if (e.key === 'Delete') { e.preventDefault(); cb.onDelete(i); }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      openMenu(i, r.left + 12, r.top);
    }
    e.stopPropagation(); // 캔버스 단축키(Delete·방향키)로 새지 않게
  });

  // 끌어서 순서 바꾸기
  list.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.pg');
    if (!el) return;
    dragFrom = +el.dataset.i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFrom));
    el.classList.add('dragging');
  });
  list.addEventListener('dragend', () => {
    dragFrom = -1;
    list.querySelectorAll('.dragging,.drop-l,.drop-r').forEach((x) => x.classList.remove('dragging', 'drop-l', 'drop-r'));
  });
  const dropTarget = (e) => {
    const el = e.target.closest('.pg');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const i = +el.dataset.i;
    const after = e.clientX > r.left + r.width / 2;
    return { el, i, after };
  };
  list.addEventListener('dragover', (e) => {
    if (dragFrom < 0) return;
    const t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    list.querySelectorAll('.drop-l,.drop-r').forEach((x) => x.classList.remove('drop-l', 'drop-r'));
    t.el.classList.add(t.after ? 'drop-r' : 'drop-l');
  });
  list.addEventListener('drop', (e) => {
    if (dragFrom < 0) return;
    const t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    let to = t.after ? t.i + 1 : t.i;
    if (to > dragFrom) to -= 1;
    const from = dragFrom;
    dragFrom = -1;
    if (to !== from) cb.onMove(from, to);
  });

  function paintList() {
    const hadFocus = list.contains(document.activeElement);
    list.replaceChildren(...pages.map(item));
    add.disabled = pages.length >= cb.maxPages;
    count.textContent = `${active + 1} / ${pages.length}`;
    const cur = list.children[active];
    if (hadFocus) cur?.focus({ preventScroll: true });
    if (!collapsed || root.classList.contains('peek')) cur?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function render(nextPages, nextActive) {
    pages = nextPages;
    active = nextActive;
    if (!userChose) setCollapsed(pages.length <= 1, false); // 직접 고르기 전까지는 화면 수에 맞춰 알아서
    paintCollapsed();
    paintList();
  }

  paintCollapsed();
  return { render, closeMenu, setCollapsed, isCollapsed: () => collapsed };
}
