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
  const count = document.createElement('span');
  count.className = 'pg-count';
  root.replaceChildren(list, add, count);

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
    el.setAttribute('aria-label', `${i + 1}번 화면 · ${p.screenName || '제목 없음'}${p.mode === 'edit' ? ' (변경)' : ''}`);
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
    if (p.mode === 'edit') { const t = document.createElement('em'); t.textContent = '변경'; nm.append(t); }
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

  function render(nextPages, nextActive) {
    pages = nextPages;
    active = nextActive;
    const hadFocus = list.contains(document.activeElement);
    list.replaceChildren(...pages.map(item));
    add.disabled = pages.length >= cb.maxPages;
    count.textContent = `${active + 1} / ${pages.length}`;
    const cur = list.children[active];
    if (hadFocus) cur?.focus({ preventScroll: true });
    cur?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  return { render, closeMenu };
}
