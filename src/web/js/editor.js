// 캔버스 에디터 엔진 — 배치 / 이동 / 8방향 리사이즈 / 정렬 스냅 / 히스토리 / 줌 /
// 다중 선택(Shift·드래그) / 그룹화 / 정렬·분배 / 플로팅 컨텍스트 툴바 / 우클릭 메뉴 / 단축키.
// 개발지시서 U-2 ~ U-5.

import { DEFAULT_BOARD, SNAP, DEF, NAME, HAS_ITEMS, defaultLabel, defaultCols } from './constants.js';

let board, ctx, hint, ctxT, fL, fC, bReq, bU, bR, zv, cv, ctxSingle, ctxAlign, marqEl, cmenu, bGroup, bUngroup;
// 캔버스(보드) 크기 — 화면 유형/불러온 화면에 따라 setBoardSize 로 바뀐다
let BOARD_W = DEFAULT_BOARD.w;
let BOARD_H = DEFAULT_BOARD.h;
let shapes = [];
let selIds = [];          // 선택된 요소 id 목록 (다중 선택)
let hist = [];
let future = [];
let uid = 1;
let gid = 1;              // 그룹 id 카운터
let zm = 100;
let clip = null;          // 복사 버퍼 (배열)
let move = null;
let rs = null;
let marq = null;          // 드래그 선택 사각형 상태
let notify = () => {};

const pt = (e) => {
  const r = board.getBoundingClientRect();
  const k = zm / 100;
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
};
const find = (id) => shapes.find((s) => s.id === id);
const isSel = (id) => selIds.includes(id);
const selShapes = () => selIds.map(find).filter(Boolean);
const groupMembers = (g) => shapes.filter((s) => s.g === g).map((s) => s.id);

/** shape 요소 안의 표시 내용을 채운다 (이미지는 <img>, 나머지는 텍스트) */
function setShapeContent(el, s) {
  if (s.t === 'image' && s.src) {
    const im = el.querySelector('img') || document.createElement('img');
    im.src = s.src;
    im.alt = s.label || '이미지';
    im.draggable = false;
    if (!im.parentNode) el.prepend(im);
    [...el.childNodes].forEach((n) => { if (n.nodeType === 3) n.remove(); }); // 텍스트 노드 제거
  } else {
    el.textContent = (s.req ? '＊' : '') + (s.label || NAME[s.t]);
  }
}

/** 선택 id 목록에 같은 그룹의 나머지 요소들을 더한다 (그룹은 한 덩어리로 선택) */
function withGroups(ids) {
  const gids = new Set(ids.map((id) => find(id)?.g).filter(Boolean));
  if (!gids.size) return ids;
  const set = new Set(ids);
  shapes.forEach((s) => { if (s.g && gids.has(s.g)) set.add(s.id); });
  return [...set];
}

function render() {
  board.querySelectorAll('.sh,.grp-outline').forEach((e) => e.remove());
  const single = selIds.length === 1 ? selIds[0] : null;
  shapes.forEach((s) => {
    const d = document.createElement('div');
    d.className = 'sh' + (isSel(s.id) ? ' sel' : '');
    d.dataset.t = s.t;
    d.dataset.id = s.id;
    Object.assign(d.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
    setShapeContent(d, s);
    d.onmousedown = (ev) => {
      ev.stopPropagation();
      if (ev.target.classList.contains('hh')) {
        push();
        const p = pt(ev);
        rs = { id: s.id, d: ev.target.dataset.d, ox: s.x, oy: s.y, ow: s.w, oh: s.h, px: p.x, py: p.y };
        return;
      }
      if (ev.shiftKey) { toggleSel(s.id); return; }
      if (!isSel(s.id)) setSel([s.id]);
      push();
      const p = pt(ev);
      if (selIds.length === 1) {
        move = { single: true, id: s.id, dx: p.x - s.x, dy: p.y - s.y };
      } else {
        move = { single: false, sx: p.x, sy: p.y, orig: {} };
        selShapes().forEach((o) => { move.orig[o.id] = { x: o.x, y: o.y }; });
      }
    };
    if (single === s.id) {
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((dir) => {
        const h = document.createElement('div');
        h.className = 'hh';
        h.dataset.d = dir;
        d.appendChild(h);
      });
    }
    board.appendChild(d);
  });
  // 선택된 그룹마다 점선 외곽선
  new Set(selShapes().map((s) => s.g).filter(Boolean)).forEach((g) => {
    const gs = shapes.filter((s) => s.g === g);
    const x = Math.min(...gs.map((s) => s.x));
    const y = Math.min(...gs.map((s) => s.y));
    const r = Math.max(...gs.map((s) => s.x + s.w));
    const b2 = Math.max(...gs.map((s) => s.y + s.h));
    const o = document.createElement('div');
    o.className = 'grp-outline';
    Object.assign(o.style, {
      left: x - 4 + 'px', top: y - 4 + 'px', width: r - x + 8 + 'px', height: b2 - y + 8 + 'px',
    });
    board.appendChild(o);
  });
  hint.style.display = shapes.length ? 'none' : 'block';
  bU.disabled = !hist.length;
  bR.disabled = !future.length;
  placeCtx();
  notify();
}

function quick(s) {
  const el = board.querySelector('.sh[data-id="' + s.id + '"]');
  if (el) Object.assign(el.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
}

function paintSel() {
  board.querySelectorAll('.sh').forEach((el) => el.classList.toggle('sel', isSel(+el.dataset.id)));
}

function guides(s) {
  board.querySelectorAll('.gd').forEach((e) => e.remove());
  const others = shapes.filter((o) => o.id !== s.id);
  const vT = [BOARD_W / 2];
  const hT = [BOARD_H / 2];
  others.forEach((o) => {
    vT.push(o.x, o.x + o.w / 2, o.x + o.w);
    hT.push(o.y, o.y + o.h / 2, o.y + o.h);
  });
  let bx = null;
  let by = null;
  [[s.x, 0], [s.x + s.w / 2, s.w / 2], [s.x + s.w, s.w]].forEach(([v, off]) =>
    vT.forEach((t) => { if (bx === null && Math.abs(v - t) <= SNAP) bx = { t, off }; }),
  );
  [[s.y, 0], [s.y + s.h / 2, s.h / 2], [s.y + s.h, s.h]].forEach(([v, off]) =>
    hT.forEach((t) => { if (by === null && Math.abs(v - t) <= SNAP) by = { t, off }; }),
  );
  if (bx) { s.x = Math.round(bx.t - bx.off); line('v', bx.t); }
  if (by) { s.y = Math.round(by.t - by.off); line('h', by.t); }
}

function line(dir, p) {
  const g = document.createElement('div');
  g.className = 'gd ' + dir;
  if (dir === 'v') g.style.left = p + 'px';
  else g.style.top = p + 'px';
  board.appendChild(g);
}

// ── 선택 ─────────────────────────────────────────────────
function setSel(ids) {
  selIds = withGroups([...new Set(ids)].filter((id) => find(id)));
  render();
  syncCtx();
}
function toggleSel(id) {
  const s = find(id);
  const members = s?.g ? groupMembers(s.g) : [id];
  const has = members.every((m) => isSel(m));
  setSel(has ? selIds.filter((x) => !members.includes(x)) : [...selIds, ...members]);
}

function syncCtx() {
  const n = selIds.length;
  ctx.classList.toggle('on', n > 0);
  const multi = n > 1;
  ctxSingle.hidden = multi;
  ctxAlign.hidden = !multi;
  if (n === 1) {
    const s = find(selIds[0]);
    ctxT.textContent = NAME[s.t];
    fL.value = s.label;
    fC.value = s.cols;
    fC.classList.toggle('hidden', !HAS_ITEMS[s.t]);
    bReq.classList.toggle('on', s.req); bReq.setAttribute('aria-pressed', String(!!s.req));
  }
  if (multi) {
    bGroup.hidden = isOneWholeGroup();
    bUngroup.hidden = !selShapes().some((s) => s.g);
  }
  placeCtx();
}

/** 현재 선택이 "정확히 한 그룹 전체"인가 (이 경우 재-묶기 불필요) */
function isOneWholeGroup() {
  const ss = selShapes();
  const gs = new Set(ss.map((s) => s.g).filter(Boolean));
  return gs.size === 1 && ss.every((s) => s.g) && groupMembers([...gs][0]).length === ss.length;
}

function placeCtx() {
  const ss = selShapes();
  if (!ss.length) { ctx.classList.remove('on'); return; }
  const minX = Math.min(...ss.map((s) => s.x));
  const maxR = Math.max(...ss.map((s) => s.x + s.w));
  const minY = Math.min(...ss.map((s) => s.y));
  const b = board.getBoundingClientRect();
  const k = zm / 100;
  const cw = ctx.offsetWidth || 430;
  const l = b.left + ((minX + maxR) / 2) * k - cw / 2;
  let t = b.top + minY * k - 54;
  if (t < 68) t = b.top + minY * k + 40;
  const minLeft = window.innerWidth < 900 ? 8 : 316; // 좁은 화면에선 좌측 패널이 위로 빠짐
  ctx.style.left = Math.max(minLeft, Math.min(window.innerWidth - cw - 14, l)) + 'px';
  ctx.style.top = t + 'px';
}

function applyLabel() {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  s.label = fL.value;
  s.cols = fC.value;
  const el = board.querySelector('.sh[data-id="' + s.id + '"]');
  if (el) setShapeContent(el, s);
  notify();
}

function toggleReq() {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  push();
  s.req = !s.req;
  bReq.classList.toggle('on', s.req); bReq.setAttribute('aria-pressed', String(!!s.req));
  render();
}

// ── 정렬 / 분배 ──────────────────────────────────────────
/**
 * 정렬·분배 좌표 계산 (순수 함수 — 입력을 바꾸지 않고 새 {x,y} 배열 반환).
 * @param {{x:number,y:number,w:number,h:number}[]} list
 * @param {'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'|'hdist'|'vdist'} act
 */
export function computeAlign(list, act) {
  const out = list.map((s) => ({ x: s.x, y: s.y }));
  if (list.length < 2) return out;
  const minX = Math.min(...list.map((s) => s.x));
  const maxR = Math.max(...list.map((s) => s.x + s.w));
  const minY = Math.min(...list.map((s) => s.y));
  const maxB = Math.max(...list.map((s) => s.y + s.h));
  list.forEach((s, i) => {
    if (act === 'left') out[i].x = minX;
    else if (act === 'right') out[i].x = maxR - s.w;
    else if (act === 'hcenter') out[i].x = Math.round((minX + maxR) / 2 - s.w / 2);
    else if (act === 'top') out[i].y = minY;
    else if (act === 'bottom') out[i].y = maxB - s.h;
    else if (act === 'vcenter') out[i].y = Math.round((minY + maxB) / 2 - s.h / 2);
  });
  if ((act === 'hdist' || act === 'vdist') && list.length >= 3) {
    const ax = act === 'hdist' ? 'x' : 'y';
    const aw = act === 'hdist' ? 'w' : 'h';
    const idx = list.map((_, i) => i).sort((a, b) =>
      (list[a][ax] + list[a][aw] / 2) - (list[b][ax] + list[b][aw] / 2));
    const first = list[idx[0]][ax] + list[idx[0]][aw] / 2;
    const last = list[idx.at(-1)][ax] + list[idx.at(-1)][aw] / 2;
    const step = (last - first) / (idx.length - 1);
    idx.forEach((li, k) => { out[li][ax] = Math.round(first + k * step - list[li][aw] / 2); });
  }
  return out;
}

function alignAct(act) {
  const ss = selShapes();
  if (ss.length < 2) return;
  push();
  const next = computeAlign(ss, act);
  ss.forEach((s, i) => {
    s.x = Math.max(0, Math.min(BOARD_W - s.w, next[i].x));
    s.y = Math.max(0, Math.min(BOARD_H - s.h, next[i].y));
  });
  render();
}

// ── 그룹 ─────────────────────────────────────────────────
function groupSel() {
  const ss = selShapes();
  if (ss.length < 2) return;
  push();
  const g = 'g' + gid++;
  ss.forEach((s) => { s.g = g; });
  setSel(selIds);
}
function ungroupSel() {
  const ss = selShapes();
  if (!ss.some((s) => s.g)) return;
  push();
  ss.forEach((s) => { s.g = null; });
  setSel(selIds);
}

// ── 복제 / 순서 / 삭제 ───────────────────────────────────
/** shapes 를 복제하며 그룹 id 를 새로 매핑 (원본 그룹에 섞이지 않게) */
function cloneWithNewGroups(list, ox, oy) {
  const gmap = new Map();
  return list.map((s) => {
    let g = s.g || null;
    if (g) { if (!gmap.has(g)) gmap.set(g, 'g' + gid++); g = gmap.get(g); }
    return {
      ...s, id: uid++, g,
      x: Math.min(BOARD_W - s.w, s.x + ox),
      y: Math.min(BOARD_H - s.h, s.y + oy),
    };
  });
}

function dup() {
  const ss = selShapes();
  if (!ss.length) return;
  push();
  const copies = cloneWithNewGroups(ss, 16, 16);
  shapes.push(...copies);
  setSel(copies.map((c) => c.id));
}

function pasteClip() {
  if (!clip || !clip.length) return;
  push();
  const copies = cloneWithNewGroups(clip, 20, 20);
  shapes.push(...copies);
  setSel(copies.map((c) => c.id));
}

function front() {
  const ss = selShapes();
  if (!ss.length) return;
  push();
  shapes = shapes.filter((x) => !isSel(x.id)).concat(ss);
  render();
}

function back() {
  const ss = selShapes();
  if (!ss.length) return;
  push();
  shapes = ss.concat(shapes.filter((x) => !isSel(x.id)));
  render();
}

function delSel() {
  if (!selIds.length) return;
  push();
  shapes = shapes.filter((s) => !isSel(s.id));
  setSel([]);
}

function push() {
  hist.push(JSON.stringify(shapes));
  future = [];
  if (hist.length > 60) hist.shift();
}

function normalize(arr) {
  return (arr || []).map((s, i) => ({
    id: i + 1,
    t: s.t || s.type,
    x: s.x, y: s.y, w: s.w, h: s.h,
    label: s.label ?? '',
    cols: s.cols ?? s.items ?? '',
    req: !!(s.req ?? s.required),
    g: s.g ?? s.group ?? null,
    src: s.src ?? null,
  }));
}

// ── 공개 API ──────────────────────────────────────────────

export function initEditor(opts = {}) {
  board = document.getElementById('board');
  ctx = document.getElementById('ctx');
  hint = document.getElementById('hint');
  ctxT = document.getElementById('ctxT');
  fL = document.getElementById('fL');
  fC = document.getElementById('fC');
  bReq = document.getElementById('bReq');
  bU = document.getElementById('bU');
  bR = document.getElementById('bR');
  zv = document.getElementById('zv');
  cv = document.getElementById('cv');
  ctxSingle = document.getElementById('ctxSingle');
  ctxAlign = document.getElementById('ctxAlign');
  cmenu = document.getElementById('cmenu');
  bGroup = document.getElementById('bGroup');
  bUngroup = document.getElementById('bUngroup');
  notify = opts.onChange || (() => {});

  marqEl = document.createElement('div');
  marqEl.className = 'marq';
  marqEl.hidden = true;
  board.appendChild(marqEl);

  // 캔버스를 클릭하면 입력 필드에서 포커스를 뗀다 → Ctrl+A·Del 등 단축키가 바로 먹도록.
  // capture 단계라 요소의 stopPropagation 보다 먼저 실행된다.
  cv.addEventListener('mousedown', (e) => {
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && !ae.closest('.ctx')) ae.blur();
    // 캔버스에 키보드 포커스를 준다 → Ctrl+A·Del·방향키가 확실히 먹도록
    if (!e.target.closest('.ctx')) board.focus({ preventScroll: true });
  }, true);

  board.addEventListener('mousedown', (e) => {
    if (e.target !== board && e.target.id !== 'hint' && e.target !== marqEl) return;
    if (!e.shiftKey) setSel([]);
    const p = pt(e);
    marq = { x0: p.x, y0: p.y, add: e.shiftKey, base: [...selIds] };
  });

  document.addEventListener('mousemove', (e) => {
    if (marq) {
      const p = pt(e);
      const x = Math.min(marq.x0, p.x);
      const y = Math.min(marq.y0, p.y);
      const w = Math.abs(p.x - marq.x0);
      const h = Math.abs(p.y - marq.y0);
      Object.assign(marqEl.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      marqEl.hidden = false;
      const hits = shapes
        .filter((s) => s.x < x + w && s.x + s.w > x && s.y < y + h && s.y + s.h > y)
        .map((s) => s.id);
      selIds = marq.add ? [...new Set([...marq.base, ...hits])] : hits;
      paintSel();
      return;
    }
    if (move) {
      const p = pt(e);
      if (move.single) {
        const s = find(move.id);
        s.x = Math.max(0, Math.min(BOARD_W - s.w, Math.round(p.x - move.dx)));
        s.y = Math.max(0, Math.min(BOARD_H - s.h, Math.round(p.y - move.dy)));
        guides(s); quick(s); placeCtx();
      } else {
        const ss = selShapes();
        let dx = p.x - move.sx;
        let dy = p.y - move.sy;
        const minX = Math.min(...ss.map((s) => move.orig[s.id].x));
        const maxR = Math.max(...ss.map((s) => move.orig[s.id].x + s.w));
        const minY = Math.min(...ss.map((s) => move.orig[s.id].y));
        const maxB = Math.max(...ss.map((s) => move.orig[s.id].y + s.h));
        dx = Math.max(-minX, Math.min(BOARD_W - maxR, dx));
        dy = Math.max(-minY, Math.min(BOARD_H - maxB, dy));
        ss.forEach((s) => {
          s.x = Math.round(move.orig[s.id].x + dx);
          s.y = Math.round(move.orig[s.id].y + dy);
          quick(s);
        });
        placeCtx();
      }
    }
    if (rs) {
      const s = find(rs.id);
      const p = pt(e);
      const dx = p.x - rs.px;
      const dy = p.y - rs.py;
      const d = rs.d;
      if (d.includes('e')) s.w = Math.max(24, Math.round(rs.ow + dx));
      if (d.includes('s')) s.h = Math.max(20, Math.round(rs.oh + dy));
      if (d.includes('w')) { const w = Math.max(24, Math.round(rs.ow - dx)); s.x = rs.ox + rs.ow - w; s.w = w; }
      if (d.includes('n')) { const h = Math.max(20, Math.round(rs.oh - dy)); s.y = rs.oy + rs.oh - h; s.h = h; }
      guides(s); quick(s); placeCtx();
    }
  });

  document.addEventListener('mouseup', () => {
    if (marq) {
      marqEl.hidden = true;
      marq = null;
      setSel(selIds);
      return;
    }
    if (move || rs) {
      board.querySelectorAll('.gd').forEach((e) => e.remove());
      notify();
    }
    move = null;
    rs = null;
  });

  document.addEventListener('keydown', (e) => {
    if (!cmenu.hidden && e.key === 'Escape') { e.preventDefault(); hideMenu(); board.focus(); return; }
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    const c = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (c && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (c && k === 'y') { e.preventDefault(); redo(); }
    else if (c && k === 'a') { e.preventDefault(); setSel(shapes.map((s) => s.id)); }
    else if (c && k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); }
    else if (c && k === 'c') { const ss = selShapes(); if (ss.length) clip = ss.map((s) => ({ ...s })); }
    else if (c && k === 'v') { e.preventDefault(); pasteClip(); }
    else if (c && k === 'd') { e.preventDefault(); dup(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (selIds.length) { e.preventDefault(); delSel(); } }
    else if (e.key === 'Escape') setSel([]);
    else if (e.key.indexOf('Arrow') === 0 && selIds.length) {
      e.preventDefault();
      const ss = selShapes();
      const d = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -d;
      if (e.key === 'ArrowRight') dx = d;
      if (e.key === 'ArrowUp') dy = -d;
      if (e.key === 'ArrowDown') dy = d;
      const minX = Math.min(...ss.map((s) => s.x));
      const maxR = Math.max(...ss.map((s) => s.x + s.w));
      const minY = Math.min(...ss.map((s) => s.y));
      const maxB = Math.max(...ss.map((s) => s.y + s.h));
      dx = Math.max(-minX, Math.min(BOARD_W - maxR, dx));
      dy = Math.max(-minY, Math.min(BOARD_H - maxB, dy));
      ss.forEach((s) => { s.x += dx; s.y += dy; quick(s); });
      placeCtx(); notify();
    }
  });

  window.addEventListener('resize', placeCtx);
  cv.addEventListener('scroll', placeCtx);

  // 컨텍스트 툴바
  fL.addEventListener('input', applyLabel);
  fC.addEventListener('input', applyLabel);
  const ALIGN = {
    alignL: 'left', alignC: 'hcenter', alignR: 'right',
    alignT: 'top', alignM: 'vcenter', alignB: 'bottom',
    distH: 'hdist', distV: 'vdist',
  };
  ctx.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    if (ALIGN[act]) { alignAct(ALIGN[act]); return; }
    ({ req: toggleReq, dup, front, back, del: delSel, group: groupSel, ungroup: ungroupSel })[act]?.();
  });

  // ── 우클릭 메뉴 ─────────────────────────────────────────
  board.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const shEl = e.target.closest('.sh');
    if (shEl) {
      const id = +shEl.dataset.id;
      if (!isSel(id)) setSel([id]);
    }
    showMenu(e.clientX, e.clientY);
  });
  document.addEventListener('mousedown', (e) => {
    if (!cmenu.hidden && !cmenu.contains(e.target)) hideMenu();
  });
  cv.addEventListener('scroll', hideMenu);
  window.addEventListener('resize', hideMenu);
  cmenu.addEventListener('keydown', (e) => {
    const items = [...cmenu.querySelectorAll('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  });

  applyBoardSize();
  render();
}

// ── 우클릭 메뉴 구성 ──────────────────────────────────────
function hideMenu() { if (cmenu) cmenu.hidden = true; }

function menuItems() {
  const n = selIds.length;
  const hasGroup = selShapes().some((s) => s.g);
  const out = [];
  if (n >= 1) {
    out.push({ label: '복제', sc: 'Ctrl+D', act: dup });
    out.push({ label: '맨 앞으로', act: front });
    out.push({ label: '맨 뒤로', act: back });
  }
  const canGroup = n >= 2 && !isOneWholeGroup();
  if (canGroup) { out.push('-'); out.push({ label: '그룹으로 묶기', sc: 'Ctrl+G', act: groupSel }); }
  if (hasGroup) {
    if (!canGroup) out.push('-');
    out.push({ label: '그룹 해제', sc: 'Ctrl+Shift+G', act: ungroupSel });
  }
  out.push('-');
  out.push({ label: '전체 선택', sc: 'Ctrl+A', act: () => setSel(shapes.map((s) => s.id)) });
  if (clip && clip.length) out.push({ label: '붙여넣기', sc: 'Ctrl+V', act: pasteClip });
  if (n >= 1) {
    out.push('-');
    out.push({ label: '삭제', sc: 'Del', act: delSel, danger: true });
  }
  return out;
}

function showMenu(clientX, clientY) {
  cmenu.replaceChildren(
    ...menuItems().map((it) => {
      if (it === '-') return document.createElement('hr');
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (it.danger) b.className = 'red';
      const l = document.createElement('span');
      l.textContent = it.label;
      const s = document.createElement('span');
      s.className = 'sc';
      s.textContent = it.sc || '';
      b.append(l, s);
      b.addEventListener('click', () => { hideMenu(); it.act(); });
      return b;
    }),
  );
  cmenu.hidden = false;
  const mw = cmenu.offsetWidth || 180;
  const mh = cmenu.offsetHeight || 240;
  cmenu.style.left = Math.max(6, Math.min(clientX, window.innerWidth - mw - 8)) + 'px';
  cmenu.style.top = Math.max(6, Math.min(clientY, window.innerHeight - mh - 8)) + 'px';
  cmenu.querySelector('button')?.focus();
}

function applyBoardSize() {
  board.style.width = BOARD_W + 'px';
  board.style.height = BOARD_H + 'px';
}

/** 캔버스(보드) 크기 변경. 화면 유형/불러온 화면에 맞춰 호출. */
export function setBoardSize(w, h) {
  const nw = Math.max(320, Math.round(w) || DEFAULT_BOARD.w);
  const nh = Math.max(240, Math.round(h) || DEFAULT_BOARD.h);
  if (nw === BOARD_W && nh === BOARD_H) return;
  BOARD_W = nw;
  BOARD_H = nh;
  applyBoardSize();
  if (zm !== 100) zoomReset(); // 크기가 바뀌면 배율은 100% 로
  // 보드가 줄어든 경우 밖으로 나간 요소를 안으로 당긴다
  shapes.forEach((s) => {
    s.w = Math.min(s.w, BOARD_W);
    s.h = Math.min(s.h, BOARD_H);
    s.x = Math.max(0, Math.min(BOARD_W - s.w, s.x));
    s.y = Math.max(0, Math.min(BOARD_H - s.h, s.y));
  });
  render();
}

export function getBoardSize() {
  return { w: BOARD_W, h: BOARD_H };
}

export function addComponent(t) {
  push();
  const [w, h] = DEF[t];
  const y = shapes.length
    ? Math.min(BOARD_H - h - 20, Math.max(...shapes.map((s) => s.y + s.h)) + 20)
    : 40;
  shapes.push({
    id: uid++, t,
    x: Math.round((BOARD_W - w) / 2), y, w, h,
    label: defaultLabel(t), cols: defaultCols(t), req: false,
  });
  render();
  setSel([shapes.at(-1).id]);
}

/** 이미지 요소를 캔버스에 추가 (main.js 의 드래그·붙여넣기에서 호출) */
export function addImage({ src, w = 240, h = 160 }) {
  if (!src) return;
  push();
  const cw = Math.max(24, Math.min(BOARD_W, Math.round(w)));
  const ch = Math.max(20, Math.min(BOARD_H, Math.round(h)));
  const y = shapes.length
    ? Math.min(BOARD_H - ch - 20, Math.max(...shapes.map((s) => s.y + s.h)) + 20)
    : 40;
  shapes.push({
    id: uid++, t: 'image',
    x: Math.round((BOARD_W - cw) / 2), y: Math.max(0, y), w: cw, h: ch,
    label: '', cols: '', req: false, src,
  });
  render();
  setSel([shapes.at(-1).id]);
}

export function setShapes(arr) {
  push();
  shapes = normalize(arr);
  uid = shapes.length + 1;
  const maxG = Math.max(0, ...shapes.map((s) => parseInt(String(s.g || '').replace(/\D/g, ''), 10) || 0));
  gid = maxG + 1;
  setSel([]);
}

export function clearShapes() {
  if (!shapes.length) return;
  push();
  shapes = [];
  setSel([]);
}

export function undo() {
  if (!hist.length) return;
  future.push(JSON.stringify(shapes));
  shapes = JSON.parse(hist.pop());
  setSel([]);
}

export function redo() {
  if (!future.length) return;
  hist.push(JSON.stringify(shapes));
  shapes = JSON.parse(future.pop());
  setSel([]);
}

export function zoomBy(d) {
  zm = Math.min(150, Math.max(50, zm + d));
  board.style.transform = 'scale(' + zm / 100 + ')';
  zv.textContent = zm + '%';
  placeCtx();
}

export function zoomReset() {
  zm = 100;
  board.style.transform = 'scale(1)';
  zv.textContent = '100%';
  placeCtx();
}

export const count = () => shapes.length;
export const selectedCount = () => selIds.length;

/** payload.shapes 형식으로 반환 (개발지시서 §6.1). */
export function toPayloadShapes() {
  return shapes.map((s) => ({
    id: 's' + s.id,
    type: s.t,
    x: s.x, y: s.y, w: s.w, h: s.h,
    label: s.label || undefined,
    items: s.cols || undefined,
    required: s.req || undefined,
    group: s.g || undefined,
    src: s.src || undefined,
  }));
}
