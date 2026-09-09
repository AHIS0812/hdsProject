// 캔버스 에디터 엔진 — 배치 / 이동 / 8방향 리사이즈 / 정렬 스냅 / 히스토리 / 줌 /
// 플로팅 컨텍스트 툴바 / 단축키. 예시 프로토타입의 로직을 그대로 계승.
// 개발지시서 U-2 ~ U-5.

import { DEFAULT_BOARD, SNAP, DEF, NAME, HAS_ITEMS, defaultLabel, defaultCols } from './constants.js';

let board, ctx, hint, ctxT, fL, fC, bReq, bU, bR, zv, cv;
// 캔버스(보드) 크기 — 화면 유형/불러온 화면에 따라 setBoardSize 로 바뀐다
let BOARD_W = DEFAULT_BOARD.w;
let BOARD_H = DEFAULT_BOARD.h;
let shapes = [];
let sel = null;
let hist = [];
let future = [];
let uid = 1;
let zm = 100;
let clip = null;
let move = null;
let rs = null;
let notify = () => {};

const pt = (e) => {
  const r = board.getBoundingClientRect();
  const k = zm / 100;
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
};
const find = (id) => shapes.find((s) => s.id === id);

function render() {
  board.querySelectorAll('.sh').forEach((e) => e.remove());
  shapes.forEach((s) => {
    const d = document.createElement('div');
    d.className = 'sh' + (sel === s.id ? ' sel' : '');
    d.dataset.t = s.t;
    d.dataset.id = s.id;
    Object.assign(d.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
    d.textContent = (s.req ? '＊' : '') + (s.label || NAME[s.t]);
    d.onmousedown = (ev) => {
      ev.stopPropagation();
      if (ev.target.classList.contains('hh')) {
        push();
        const p = pt(ev);
        rs = { id: s.id, d: ev.target.dataset.d, ox: s.x, oy: s.y, ow: s.w, oh: s.h, px: p.x, py: p.y };
        return;
      }
      select(s.id);
      push();
      const p = pt(ev);
      move = { id: s.id, dx: p.x - s.x, dy: p.y - s.y };
    };
    if (sel === s.id) {
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((dir) => {
        const h = document.createElement('div');
        h.className = 'hh';
        h.dataset.d = dir;
        d.appendChild(h);
      });
    }
    board.appendChild(d);
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

function select(id) {
  sel = id;
  render();
  const s = find(id);
  ctx.classList.toggle('on', !!s);
  if (!s) return;
  ctxT.textContent = NAME[s.t];
  fL.value = s.label;
  fC.value = s.cols;
  fC.classList.toggle('hidden', !HAS_ITEMS[s.t]);
  bReq.classList.toggle('on', s.req);
  placeCtx();
}

function placeCtx() {
  const s = find(sel);
  if (!s) { ctx.classList.remove('on'); return; }
  const b = board.getBoundingClientRect();
  const k = zm / 100;
  const cw = ctx.offsetWidth || 430;
  let l = b.left + (s.x + s.w / 2) * k - cw / 2;
  let t = b.top + s.y * k - 54;
  if (t < 68) t = b.top + (s.y + s.h) * k + 12;
  ctx.style.left = Math.max(316, Math.min(window.innerWidth - cw - 14, l)) + 'px';
  ctx.style.top = t + 'px';
}

function applyLabel() {
  const s = find(sel);
  if (!s) return;
  s.label = fL.value;
  s.cols = fC.value;
  const el = board.querySelector('.sh[data-id="' + s.id + '"]');
  if (el) el.textContent = (s.req ? '＊' : '') + (s.label || NAME[s.t]);
  notify();
}

function toggleReq() {
  const s = find(sel);
  if (!s) return;
  push();
  s.req = !s.req;
  bReq.classList.toggle('on', s.req);
  render();
}

function dup() {
  const s = find(sel);
  if (!s) return;
  push();
  const c = { ...s, id: uid++, x: Math.min(BOARD_W - s.w, s.x + 16), y: Math.min(BOARD_H - s.h, s.y + 16) };
  shapes.push(c);
  render();
  select(c.id);
}

function front() {
  const s = find(sel);
  if (!s) return;
  push();
  shapes = shapes.filter((x) => x.id !== s.id).concat(s);
  render();
}

function back() {
  const s = find(sel);
  if (!s) return;
  push();
  shapes = [s].concat(shapes.filter((x) => x.id !== s.id));
  render();
}

function delSel() {
  if (sel === null) return;
  push();
  shapes = shapes.filter((s) => s.id !== sel);
  select(null);
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
  notify = opts.onChange || (() => {});

  board.addEventListener('mousedown', (e) => {
    if (e.target === board || e.target.id === 'hint') select(null);
  });

  document.addEventListener('mousemove', (e) => {
    if (move) {
      const s = find(move.id);
      const p = pt(e);
      s.x = Math.max(0, Math.min(BOARD_W - s.w, Math.round(p.x - move.dx)));
      s.y = Math.max(0, Math.min(BOARD_H - s.h, Math.round(p.y - move.dy)));
      guides(s); quick(s); placeCtx();
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
    if (move || rs) {
      board.querySelectorAll('.gd').forEach((e) => e.remove());
      notify();
    }
    move = null;
    rs = null;
  });

  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const c = e.ctrlKey || e.metaKey;
    if (c && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (c && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (c && e.key.toLowerCase() === 'c') { const s = find(sel); if (s) clip = { ...s }; }
    else if (c && e.key.toLowerCase() === 'v') {
      if (!clip) return;
      push();
      const n = { ...clip, id: uid++, x: Math.min(BOARD_W - clip.w, clip.x + 20), y: Math.min(BOARD_H - clip.h, clip.y + 20) };
      shapes.push(n);
      render();
      select(n.id);
    } else if (c && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (sel !== null) { e.preventDefault(); delSel(); } }
    else if (e.key === 'Escape') select(null);
    else if (e.key.indexOf('Arrow') === 0 && sel !== null) {
      e.preventDefault();
      const s = find(sel);
      const d = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') s.x = Math.max(0, s.x - d);
      if (e.key === 'ArrowRight') s.x = Math.min(BOARD_W - s.w, s.x + d);
      if (e.key === 'ArrowUp') s.y = Math.max(0, s.y - d);
      if (e.key === 'ArrowDown') s.y = Math.min(BOARD_H - s.h, s.y + d);
      quick(s); placeCtx(); notify();
    }
  });

  window.addEventListener('resize', placeCtx);
  cv.addEventListener('scroll', placeCtx);

  // 컨텍스트 툴바
  fL.addEventListener('input', applyLabel);
  fC.addEventListener('input', applyLabel);
  ctx.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    ({ req: toggleReq, dup, front, back, del: delSel })[act]?.();
  });

  applyBoardSize();
  render();
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
  select(shapes.at(-1).id);
}

export function setShapes(arr) {
  push();
  shapes = normalize(arr);
  uid = shapes.length + 1;
  select(null);
}

export function clearShapes() {
  if (!shapes.length) return;
  push();
  shapes = [];
  select(null);
}

export function undo() {
  if (!hist.length) return;
  future.push(JSON.stringify(shapes));
  shapes = JSON.parse(hist.pop());
  select(null);
}

export function redo() {
  if (!future.length) return;
  hist.push(JSON.stringify(shapes));
  shapes = JSON.parse(future.pop());
  select(null);
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

/** payload.shapes 형식으로 반환 (개발지시서 §6.1). id 는 questions/report 참조용. */
export function toPayloadShapes() {
  return shapes.map((s) => ({
    id: 's' + s.id,
    type: s.t,
    x: s.x, y: s.y, w: s.w, h: s.h,
    label: s.label || undefined,
    items: s.cols || undefined,
    required: s.req || undefined,
  }));
}
