// 캔버스 에디터 엔진 — 배치 / 이동 / 8방향 리사이즈 / 정렬 스냅 / 히스토리 / 줌 /
// 다중 선택(Shift·드래그) / 그룹화 / 정렬·분배 / 플로팅 컨텍스트 툴바 / 우클릭 메뉴 / 단축키.
// 개발지시서 U-2 ~ U-5.

import { DEFAULT_BOARD, SNAP, DEF, NAME, HAS_ITEMS, HAS_TEXT, HAS_REQ, defaultLabel, defaultCols, renameItemAt } from './constants.js';

let board, boardWrap, ctx, hint, ctxT, fL, bReq, bU, bR, zv, cv, ctxSingle, ctxAlign, marqEl, cmenu, bGroup, bUngroup;
let bItems, itemsPop, itemsList, itemsInput, itemsAddBtn;
let bPos, posPop;
let bAlign, alignPop;
let fS, fsUp, fsDown, fsWrap;
let bDesc, descPop, descInput, descLinkWrap, descLinkPick, descLinkList;
let pickStatus, pickCount, pickDone;
let linkLayer;
const DEFAULT_FS = 11; // 글자 크기를 따로 지정하지 않은 요소의 기본값(px) — 조절 칸에 보여줄 값
// 캔버스(보드) 크기 — 화면 유형/불러온 화면에 따라 setBoardSize 로 바뀐다
let BOARD_W = DEFAULT_BOARD.w;
let BOARD_H = DEFAULT_BOARD.h;
let shapes = [];
let selIds = [];          // 선택된 요소 id 목록 (다중 선택)
let hist = [];
let future = [];
let opSeq = 0;             // push() 호출마다 증가 — "방금 그 다음 호출도 연속된 조작인지" 판별용
let uid = 1;
let gid = 1;              // 그룹 id 카운터
let zm = 100;
let clip = null;          // 복사 버퍼 (배열)
let move = null;
let rs = null;
let mrs = null;           // 다중 선택 크기 조절 상태(선택 전체를 감싸는 바운딩 박스 기준)
let marq = null;          // 드래그 선택 사각형 상태
let bgSrc = null;         // 변경화면 캡처 배경 이미지 data URL (트레이싱용, 생성 시 배경으로도 쓰인다)
let pickingLinkFor = null; // 연결할 요소를 고르는 중이면 그 출발 shape id (버튼 → 연결 대상)
let notify = () => {};
let isBlocked = () => false; // 모달이 떠 있어 캔버스 단축키를 멈춰야 하는지 (main.js 가 주입)
// 문구·설명·글자크기 입력칸은 키 입력마다 push() 하면 되돌리기 한 번에 한 글자씩만 되돌아가서
// 쓸모가 없다 — 그렇다고 아예 안 부르면(예전 버그) 그 사이 다른 조작이 push() 를 한 번이라도
// 부르는 순간 이 필드에서 고친 내용이 되돌리기 스택에 체크포인트 없이 같이 씻겨나간다.
// 그래서 "같은 선택이 유지되는 동안 그 필드에 처음 손댈 때만" 한 번 push() 하고, 이후 같은
// 선택에서의 입력은 전부 그 체크포인트 하나로 묶는다 — 선택이 바뀌면(setSel) 다시 초기화된다.
let textEditPushed = { label: false, desc: false, fs: false };

const pt = (e) => {
  const r = board.getBoundingClientRect();
  const k = zm / 100;
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
};
const find = (id) => shapes.find((s) => s.id === id);
const isSel = (id) => selIds.includes(id);
const selShapes = () => selIds.map(find).filter(Boolean);
const groupMembers = (g) => shapes.filter((s) => s.g === g).map((s) => s.id);

/** shape 요소 안의 표시 내용을 채운다 (이미지는 <img>, list/tab 은 실제 항목, 나머지는 텍스트) */
function setShapeContent(el, s) {
  if (s.t === 'image' && s.src) {
    const im = el.querySelector('img') || document.createElement('img');
    im.src = s.src;
    im.alt = s.label || '이미지';
    im.draggable = false;
    if (!im.parentNode) el.prepend(im);
    [...el.childNodes].forEach((n) => { if (n.nodeType === 3) n.remove(); }); // 텍스트 노드 제거
    return;
  }
  // 리사이즈 손잡이(.hh)는 선택된 도형에만 붙어 있는 별도 자식이라, 아래 replaceChildren 이
  // 내용을 통째로 갈아끼우면 같이 날아간다 — 항목 추가·삭제(refreshShapeEl) 처럼 선택을 유지한
  // 채 내용만 새로고침할 때 손잡이가 사라지지 않도록 미리 떼어 뒀다가 다시 붙인다.
  const handles = [...el.children].filter((c) => c.classList.contains('hh'));
  let content = null;
  if (s.t === 'divider' || s.t === 'pager') {
    // 구분선·페이지 이동은 CSS ::after 로 그려지는 고정 모양만 보이면 된다 —
    // 글자(NAME 폴백)가 겹쳐 보이지 않게 비워둔다.
    content = null;
  } else {
    const cols = String(s.cols || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (s.t === 'list' && cols.length) content = listPreview(cols);
    else if (s.t === 'tab' && cols.length) content = tabPreview(cols);
    else if (s.t === 'radio' && cols.length) content = radioPreview(cols);
    // 체크박스는 레이블 없이 단독으로 둘 수 있다(생성 결과와 동일) — 비워 뒀으면 타입 이름
    // ("체크")으로 대신 채우지 않고 CSS ::before 로 그려지는 네모 아이콘만 보이게 둔다.
    else if (s.t === 'check') content = document.createTextNode((s.req ? '＊' : '') + (s.label || ''));
    else content = document.createTextNode((s.req ? '＊' : '') + (s.label || NAME[s.t]));
  }
  el.replaceChildren(...(content ? [content] : []), ...handles);
}

/** 표(list) 미리보기 헤더 — 항목이 추가되면 그 컬럼명이 실제로 보이고, 글자 수에 비례해 폭도 달라진다 */
function listPreview(cols) {
  const row = document.createElement('div');
  row.className = 'sh-cols';
  cols.forEach((c) => {
    const cell = document.createElement('span');
    cell.className = 'sh-col';
    cell.textContent = c;
    cell.style.flexGrow = String(Math.max(1, c.length));
    row.appendChild(cell);
  });
  return row;
}

/** 탭 미리보기 — 항목이 추가되면 그 탭 이름들이 실제로 보인다(첫 탭이 활성 상태) */
function tabPreview(cols) {
  const row = document.createElement('div');
  row.className = 'sh-chips';
  cols.forEach((c, i) => {
    const chip = document.createElement('span');
    chip.className = 'sh-chip' + (i === 0 ? ' on' : '');
    chip.textContent = c;
    row.appendChild(chip);
  });
  return row;
}

/** 라디오 미리보기 — 항목이 추가되면 그 선택지들이 실제로 보인다. 가로 폭이 부족하면
 * 자동으로 줄바꿈되어 세로로 쌓인다(생성 결과와 동일하게 flex-wrap — 스크롤바 대신 줄바꿈). */
function radioPreview(cols) {
  const row = document.createElement('div');
  row.className = 'sh-radios';
  cols.forEach((c) => {
    const item = document.createElement('span');
    item.className = 'sh-radio';
    item.textContent = c;
    row.appendChild(item);
  });
  return row;
}

/** 요소를 더블클릭하면 그 자리에서 바로 문구를 고칠 수 있다 — 상단 툴바의 "문구" 칸까지
 * 갈 필요 없이 PPT·캔바처럼 바로 타이핑. 문구가 실제로 안 보이는 타입(select/date 등)은
 * HAS_TEXT 에 없어 아무 일도 하지 않는다. */
function startInlineEdit(s) {
  if (!HAS_TEXT[s.t] || pickingLinkFor != null) return;
  if (selIds.length !== 1 || selIds[0] !== s.id) setSel([s.id]);
  const el = board.querySelector(`.sh[data-id="${s.id}"]`);
  if (!el || el.querySelector('.inline-edit')) return;
  const input = document.createElement('input');
  input.className = 'inline-edit';
  input.value = s.label || '';
  input.setAttribute('aria-label', `${NAME[s.t]} 문구`);
  input.addEventListener('mousedown', (e) => e.stopPropagation()); // 커서 옮기려는 클릭이 드래그·재선택으로 새지 않게
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const next = input.value;
    input.remove();
    if (next !== (s.label || '')) {
      push();
      s.label = next;
      setShapeContent(el, s);
      if (WRAP_FIT_TYPES[s.t]) fitWrapHeight(s);
      if (selIds.length === 1 && selIds[0] === s.id) fL.value = s.label;
      notify();
    }
  };
  const cancel = () => { if (!done) { done = true; input.remove(); } };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Delete·Ctrl+D 등 캔버스 단축키가 타이핑 중에 끼어들지 않게
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commit(); board.focus({ preventScroll: true }); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); board.focus({ preventScroll: true }); }
  });
  input.addEventListener('blur', commit);
  el.appendChild(input);
  input.focus();
  input.select();
}

/** 캔버스 위에서 항목 하나로 보이는 조각들(라디오 선택지 / 표 컬럼 / 탭) */
const ITEM_SEL = '.sh-radio,.sh-col,.sh-chip';

/**
 * 라디오 선택지·표 컬럼·탭 이름처럼 항목을 쓰는 요소는, 그 항목을 더블클릭하면 그 자리에서 바로
 * 이름을 고칠 수 있다(예전엔 항목을 지우고 다시 만들어야 했다). Enter 확정 · Esc 취소 ·
 * Tab/Shift+Tab 은 확정하고 다음/이전 항목으로 넘어가 연달아 고칠 수 있다.
 * @returns {boolean} 편집칸을 열었는지
 */
function startItemEdit(s, idx) {
  if (!HAS_ITEMS[s.t] || pickingLinkFor != null) return false;
  if (selIds.length !== 1 || selIds[0] !== s.id) setSel([s.id]);
  const el = board.querySelector(`.sh[data-id="${s.id}"]`);
  if (!el || el.querySelector('.inline-edit')) return false;
  const itemEl = el.querySelectorAll(ITEM_SEL)[idx];
  const cur = itemsArray(s)[idx];
  if (!itemEl || cur == null) return false;

  // 항목 조각이 놓인 자리에 편집칸을 겹친다(화면 배율은 board 좌표로 되돌려 계산)
  const k = zm / 100;
  const er = el.getBoundingClientRect();
  const ir = itemEl.getBoundingClientRect();
  const width = Math.max(ir.width / k + 8, 64);
  const height = Math.max(ir.height / k, 18);
  const input = document.createElement('input');
  input.className = 'inline-edit item-edit';
  input.value = cur;
  input.setAttribute('aria-label', `${NAME[s.t]} 항목 ${idx + 1} 이름`);
  Object.assign(input.style, {
    inset: 'auto',
    left: Math.max(0, Math.min((ir.left - er.left) / k - 2, el.offsetWidth - width)) + 'px',
    top: Math.max(0, (ir.top - er.top) / k - (height - ir.height / k) / 2) + 'px',
    width: width + 'px', height: height + 'px',
  });
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  let done = false;
  const commit = (then) => {
    if (done) return;
    done = true;
    const next = input.value;
    input.remove();
    renameItem(s, idx, next);
    if (then) then();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(() => board.focus({ preventScroll: true })); }
    else if (e.key === 'Escape') { e.preventDefault(); done = true; input.remove(); board.focus({ preventScroll: true }); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const n = itemsArray(s).length;
      const nextIdx = idx + (e.shiftKey ? -1 : 1);
      commit(() => { if (nextIdx >= 0 && nextIdx < n) startItemEdit(s, nextIdx); else board.focus({ preventScroll: true }); });
    }
  });
  input.addEventListener('blur', () => commit());
  el.appendChild(input);
  input.focus();
  input.select();
  return true;
}

/** 항목 하나의 이름을 바꾼다(되돌리기 1단계). 팝오버가 열려 있으면 목록도 같이 갱신 */
function renameItem(s, idx, next) {
  const cols = renameItemAt(s.cols, idx, next);
  if (cols == null) return false;
  push();
  s.cols = cols;
  refreshShapeEl(s);
  if (!itemsPop.hidden) renderItemsList();
  notify();
  return true;
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
  board.querySelectorAll('.sh,.grp-outline,.sel-bbox,.sel-outline').forEach((e) => e.remove());
  shapes.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'sh';
    d.dataset.t = s.t;
    d.dataset.id = s.id;
    // 실제 쌓임(배치) 순서 그대로 — 선택 표시는 별도 오버레이(renderSelOutlines)가 맡는다.
    Object.assign(d.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px', zIndex: String(i + 1) });
    if (s.fs) d.style.fontSize = s.fs + 'px';
    setShapeContent(d, s);
    d.onmousedown = (ev) => {
      ev.stopPropagation();
      // "연결할 요소 선택" 모드에서는 클릭이 평소처럼 선택·이동이 아니라 연결 대상 지정으로 쓰인다.
      // 대상을 하나 고른 뒤에도 모드가 유지되어 연속으로 여러 개를 추가·해제할 수 있다(자기 자신을
      // 다시 클릭하면 모드 종료). 이미 연결된 대상을 다시 클릭하면 연결이 풀린다(토글).
      if (pickingLinkFor != null) {
        if (s.id === pickingLinkFor) { cancelPickLink(); return; }
        push();
        const src = find(pickingLinkFor);
        if (src) {
          src.links = src.links || [];
          const idx = src.links.indexOf(s.id);
          if (idx === -1) src.links.push(s.id); else src.links.splice(idx, 1);
          notify();
        }
        updateDescLinkUI();
        render();
        return;
      }
      if (ev.shiftKey || ev.ctrlKey || ev.metaKey) { toggleSel(s.id); return; }
      if (!isSel(s.id)) setSel([s.id]);
      pushGesture();
      const p = pt(ev);
      if (selIds.length === 1) {
        move = { single: true, id: s.id, dx: p.x - s.x, dy: p.y - s.y };
      } else {
        move = { single: false, sx: p.x, sy: p.y, orig: {} };
        selShapes().forEach((o) => { move.orig[o.id] = { x: o.x, y: o.y }; });
      }
    };
    // 더블클릭하면 상단 툴바까지 갈 필요 없이 그 자리에서 바로 문구를 고칠 수 있다(PPT·캔바 방식).
    d.ondblclick = (ev) => {
      ev.stopPropagation();
      if (HAS_ITEMS[s.t]) {
        // 항목(선택지·컬럼·탭 이름) 위를 더블클릭 → 그 항목 이름을 그 자리에서 수정
        const hit = ev.target.closest?.(ITEM_SEL);
        const idx = hit && d.contains(hit) ? [...d.querySelectorAll(ITEM_SEL)].indexOf(hit) : -1;
        if (idx >= 0 && startItemEdit(s, idx)) return;
        // 항목이 캔버스에 안 보이는 요소(선택 박스 등)나 항목 밖 빈 곳 → 항목 편집 팝오버
        if (selIds.length !== 1 || selIds[0] !== s.id) setSel([s.id]);
        setItemsPop(true);
        return;
      }
      startInlineEdit(s);
    };
    board.appendChild(d);
  });
  renderSelOutlines();
  // 선택된 그룹마다 점선 외곽선
  new Set(selShapes().map((s) => s.g).filter(Boolean)).forEach((g) => {
    const gs = shapes.filter((s) => s.g === g);
    const x = Math.min(...gs.map((s) => s.x));
    const y = Math.min(...gs.map((s) => s.y));
    const r = Math.max(...gs.map((s) => s.x + s.w));
    const b2 = Math.max(...gs.map((s) => s.y + s.h));
    const o = document.createElement('div');
    o.className = 'grp-outline';
    o.dataset.g = g; // 드래그 중 updateOverlays() 가 이 그룹만 다시 찾아 위치를 갱신하는 데 쓴다
    Object.assign(o.style, {
      left: x - 4 + 'px', top: y - 4 + 'px', width: r - x + 8 + 'px', height: b2 - y + 8 + 'px',
      zIndex: String(shapes.length + 2),
    });
    board.appendChild(o);
  });
  // 다중 선택(2개 이상)이면 전체를 감싸는 바운딩 박스 + 모서리·변 손잡이로 한꺼번에 크기를
  // 늘리고 줄일 수 있다 — 손잡이를 끌면 그 비율만큼 선택된 도형 전부가 같이 커지거나 작아진다.
  if (selIds.length >= 2) {
    const ss = selShapes();
    const bx = Math.min(...ss.map((s) => s.x));
    const by = Math.min(...ss.map((s) => s.y));
    const br = Math.max(...ss.map((s) => s.x + s.w));
    const bb = Math.max(...ss.map((s) => s.y + s.h));
    const box = document.createElement('div');
    box.className = 'sel-bbox';
    Object.assign(box.style, {
      left: bx + 'px', top: by + 'px', width: br - bx + 'px', height: bb - by + 'px',
      zIndex: String(shapes.length + 3),
    });
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((dir) => {
      const h = document.createElement('div');
      h.className = 'hh';
      h.dataset.d = dir;
      h.onmousedown = (ev) => {
        ev.stopPropagation();
        pushGesture();
        const ids = selIds.slice();
        const orig = {};
        ids.forEach((id) => {
          const sh = find(id);
          orig[id] = { x: sh.x, y: sh.y, w: sh.w, h: sh.h };
        });
        const p = pt(ev);
        mrs = { ids, orig, ox: bx, oy: by, ow: br - bx, oh: bb - by, d: dir, px: p.x, py: p.y };
      };
      box.appendChild(h);
    });
    board.appendChild(box);
  }
  renderLinks();
  hint.style.display = (shapes.length || bgSrc) ? 'none' : 'block';
  bU.disabled = !hist.length;
  bR.disabled = !future.length;
  notify();
}

function quick(s) {
  const el = board.querySelector('.sh[data-id="' + s.id + '"]');
  if (el) Object.assign(el.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
  // 이 도형의 선택 테두리 오버레이도 같이 따라오게(이동·리사이즈 도중에도).
  const o = board.querySelector('.sel-outline[data-id="' + s.id + '"]');
  if (o) Object.assign(o.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
  renderLinks(); // 드래그 중에도 화살표가 따라오도록
}

/** 다중 선택 바운딩 박스(.sel-bbox)·그룹 점선 외곽선(.grp-outline)은 render() 때만 위치를 잡아서,
 * 드래그로 도형만 움직이면(quick 은 도형 자기 자신만 갱신) 그대로 남겨져 도형과 따로 논다 —
 * 이동·크기 조절 중에도 매 프레임 다시 계산해 같이 따라오게 한다. */
function updateOverlays() {
  const box = board.querySelector('.sel-bbox');
  if (box && selIds.length >= 2) {
    const ss = selShapes();
    const bx = Math.min(...ss.map((s) => s.x));
    const by = Math.min(...ss.map((s) => s.y));
    const br = Math.max(...ss.map((s) => s.x + s.w));
    const bb = Math.max(...ss.map((s) => s.y + s.h));
    Object.assign(box.style, { left: bx + 'px', top: by + 'px', width: br - bx + 'px', height: bb - by + 'px' });
  }
  board.querySelectorAll('.grp-outline').forEach((o) => {
    const gs = shapes.filter((s) => s.g === o.dataset.g);
    if (!gs.length) return;
    const x = Math.min(...gs.map((s) => s.x));
    const y = Math.min(...gs.map((s) => s.y));
    const r = Math.max(...gs.map((s) => s.x + s.w));
    const b = Math.max(...gs.map((s) => s.y + s.h));
    Object.assign(o.style, { left: x - 4 + 'px', top: y - 4 + 'px', width: r - x + 8 + 'px', height: b - y + 8 + 'px' });
  });
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 도형 경계 위, (tx,ty) 방향을 향한 지점을 계산한다 — 화살표가 중심이 아니라 박스 가장자리에서 시작·끝나게 한다. */
function edgePoint(s, tx, ty) {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = s.w / 2;
  const hh = s.h / 2;
  const scale = Math.min(dx ? Math.abs(hw / dx) : Infinity, dy ? Math.abs(hh / dy) : Infinity);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** 어떤 요소든 연결한 요소(들)로 이어지는 화살표를 그린다. 기본은 화살표가 없고(links 미지정),
 * 그것도 상시로 보이는 게 아니라 "설명" 팝오버를 열어 그 요소를 확인하는 동안만 나타난다
 * — 늘 그려두면 캔버스가 복잡해진다. 대상은 여러 개일 수 있다. */
function renderLinks() {
  if (!linkLayer) return;
  linkLayer.setAttribute('width', BOARD_W);
  linkLayer.setAttribute('height', BOARD_H);
  linkLayer.querySelectorAll('line').forEach((el) => el.remove());
  if (!descPop || descPop.hidden || selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s || !Array.isArray(s.links) || !s.links.length) return;
  s.links.forEach((linkId) => {
    const t = find(linkId);
    if (!t) return;
    const c1 = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    const c2 = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
    const p1 = edgePoint(s, c2.x, c2.y);
    const p2 = edgePoint(t, c1.x, c1.y);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
    line.setAttribute('stroke', '#F5821F');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '5 4');
    line.setAttribute('marker-end', 'url(#linkArrow)');
    linkLayer.appendChild(line);
  });
}

/** 선택된 도형마다 그 위치·크기와 똑같은 오버레이(.sel-outline)를 띄워 주황 테두리를 그린다 —
 * 도형 자신에게 테두리를 직접 그리면 도형의 실제 쌓임 순서(z-index)에 묶여서 겹친 다른 도형에
 * 가려질 수 있어서, 항상 맨 앞에 뜨는 별도 레이어로 뺐다. 1개만 선택됐을 때만 리사이즈
 * 손잡이도 같이 단다(2개 이상이면 전체를 감싸는 바운딩 박스 쪽 손잡이를 쓴다). */
function renderSelOutlines() {
  board.querySelectorAll('.sel-outline').forEach((e) => e.remove());
  const single = selIds.length === 1 ? selIds[0] : null;
  selShapes().forEach((s) => {
    const o = document.createElement('div');
    o.className = 'sel-outline';
    o.dataset.id = String(s.id);
    Object.assign(o.style, {
      left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px',
      zIndex: String(shapes.length + 4),
    });
    if (single === s.id) {
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((dir) => {
        const h = document.createElement('div');
        h.className = 'hh';
        h.dataset.d = dir;
        h.onmousedown = (ev) => {
          ev.stopPropagation();
          pushGesture();
          const p = pt(ev);
          rs = { id: s.id, d: dir, ox: s.x, oy: s.y, ow: s.w, oh: s.h, px: p.x, py: p.y };
        };
        o.appendChild(h);
      });
    }
    board.appendChild(o);
  });
}

function paintSel() {
  renderSelOutlines();
}

/** 이동 중 스냅 가이드 — 다른 요소와의 정렬(좌/가운데/우, 위/가운데/아래, 서로 맞닿는 변 포함)이
 * 캔버스 중앙 격자보다 우선한다. 여러 후보가 동시에 허용 오차 안에 들어오면 "가장 가까운 것"을
 * 골라 붙인다(예전엔 배열에서 먼저 나온 후보로 붙어서, 캔버스 중앙이 늘 이겨버리는 경우가 많았다).
 * 캔버스 중앙은 후보 목록 맨 뒤에 둬서, 거리가 완전히 같을 때만(동률) 다른 요소 정렬에 밀린다. */
function guides(s) {
  board.querySelectorAll('.gd').forEach((e) => e.remove());
  const others = shapes.filter((o) => o.id !== s.id);
  const vT = [];
  const hT = [];
  others.forEach((o) => {
    vT.push(o.x, o.x + o.w / 2, o.x + o.w);
    hT.push(o.y, o.y + o.h / 2, o.y + o.h);
  });
  vT.push(BOARD_W / 2);
  hT.push(BOARD_H / 2);
  const nearest = (candidates, targets) => {
    let best = null;
    candidates.forEach(([v, off]) => {
      targets.forEach((t) => {
        const d = Math.abs(v - t);
        if (d <= SNAP && (!best || d < best.d)) best = { t, off, d };
      });
    });
    return best;
  };
  const bx = nearest([[s.x, 0], [s.x + s.w / 2, s.w / 2], [s.x + s.w, s.w]], vT);
  const by = nearest([[s.y, 0], [s.y + s.h / 2, s.h / 2], [s.y + s.h, s.h]], hT);
  if (bx) { s.x = Math.round(bx.t - bx.off); line('v', bx.t); }
  if (by) { s.y = Math.round(by.t - by.off); line('h', by.t); }
}

/** 리사이즈 중 폭·높이가 다른 요소와 비슷해지면 정확히 같은 크기로 붙는다(옆에 있는 요소와
 * 높이 맞추기 등) — 위치 정렬만으론 "같은 크기로 나란히" 배치가 잘 안 맞는다는 요청으로 추가.
 * dir 은 리사이즈 핸들 방향('n'/'s'/'e'/'w' 조합), rs 는 리사이즈 시작 시점 상태(고정된 반대쪽
 * 가장자리를 계산하는 데 쓴다). */
function snapSize(s, dir, rs) {
  const others = shapes.filter((o) => o.id !== s.id);
  if (dir.includes('e') || dir.includes('w')) {
    let best = null;
    const maxW = dir.includes('w') ? rs.ox + rs.ow : BOARD_W - s.x; // 캔버스 밖으로 넘어가는 크기엔 안 붙는다
    others.forEach((o) => {
      const d = Math.abs(s.w - o.w);
      if (d <= SNAP && o.w <= maxW && (!best || d < best.d)) best = { w: o.w, d };
    });
    if (best) {
      s.w = best.w;
      if (dir.includes('w')) s.x = rs.ox + rs.ow - best.w; // 오른쪽 가장자리는 그대로 고정
    }
  }
  if (dir.includes('s') || dir.includes('n')) {
    let best = null;
    const maxH = dir.includes('n') ? rs.oy + rs.oh : BOARD_H - s.y;
    others.forEach((o) => {
      const d = Math.abs(s.h - o.h);
      if (d <= SNAP && o.h <= maxH && (!best || d < best.d)) best = { h: o.h, d };
    });
    if (best) {
      s.h = best.h;
      if (dir.includes('n')) s.y = rs.oy + rs.oh - best.h; // 아래쪽 가장자리는 그대로 고정
    }
  }
}

/** 크기 조절 중 스냅 — 움직이는 변만 다른 요소의 변·중앙선(및 캔버스 중앙)에 붙인다. 예전엔 이동용
 * guides() 를 그대로 써서, 오른쪽 손잡이를 끄는데 고정돼 있어야 할 왼쪽 변이 근처 요소에 붙으며
 * 요소 전체가 옆으로 튀었다. */
function resizeGuides(s, dir, rs) {
  board.querySelectorAll('.gd').forEach((e) => e.remove());
  const others = shapes.filter((o) => o.id !== s.id);
  const vT = [BOARD_W / 2, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const hT = [BOARD_H / 2, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const nearest = (v, targets) => {
    let best = null;
    targets.forEach((t) => { const d = Math.abs(v - t); if (d <= SNAP && (!best || d < best.d)) best = { t, d }; });
    return best;
  };
  if (dir.includes('e')) {
    const b = nearest(s.x + s.w, vT);
    if (b && b.t - s.x >= 24 && b.t <= BOARD_W) { s.w = Math.round(b.t - s.x); line('v', b.t); }
  } else if (dir.includes('w')) {
    const right = rs.ox + rs.ow;
    const b = nearest(s.x, vT);
    if (b && right - b.t >= 24 && b.t >= 0) { s.x = Math.round(b.t); s.w = right - s.x; line('v', b.t); }
  }
  if (dir.includes('s')) {
    const b = nearest(s.y + s.h, hT);
    if (b && b.t - s.y >= 20 && b.t <= BOARD_H) { s.h = Math.round(b.t - s.y); line('h', b.t); }
  } else if (dir.includes('n')) {
    const bottom = rs.oy + rs.oh;
    const b = nearest(s.y, hT);
    if (b && bottom - b.t >= 20 && b.t >= 0) { s.y = Math.round(b.t); s.h = bottom - s.y; line('h', b.t); }
  }
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
  cancelPickLink(); // 다른 경로(단축키 등)로 선택이 바뀌면 "대상 선택" 모드는 의미가 없어진다
  textEditPushed = { label: false, desc: false, fs: false }; // 선택이 바뀌면 새 편집 세션 시작
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

/** list 안 값들이 전부 같은지 — 다중 선택 편집 시 "같으면 그 값, 다르면 빈 값(=여러 값)" 판단에 쓴다. */
function commonOf(list, get) {
  if (!list.length) return undefined;
  const first = get(list[0]);
  return list.every((x) => get(x) === first) ? first : undefined;
}

function syncCtx() {
  closeItemsPop(false);
  closePosPop(false);
  closeAlignPop(false);
  closeDescPop(false);
  const n = selIds.length;
  ctx.classList.toggle('on', n > 0);
  ctxSingle.hidden = n < 1;
  // 정렬 도구는 1개만 선택해도 쓸 수 있다 — 이때는 캔버스(페이지) 기준으로 정렬된다.
  ctxAlign.hidden = n < 1;
  if (n >= 1) {
    const ss = selShapes();
    const sameType = ss.every((x) => x.t === ss[0].t);
    ctxT.textContent = n === 1 ? NAME[ss[0].t] : sameType ? `${NAME[ss[0].t]} ${n}개` : `${n}개 선택됨`;
    // 컴포넌트 타입마다 실제로 의미 있는 조절칸만 보여준다 — 전부 다 띄우면
    // 어떤 타입에 뭐가 적용되는지 알기 어렵고 툴바만 복잡해진다.
    // 문구는 요소마다 원래 내용이 서로 다른 게 자연스러워서(여러 개를 한 문구로 덮어쓰면
    // 오히려 실수하기 쉽다) 1개를 골랐을 때만 보여준다 — 더블클릭 인라인 편집도 마찬가지.
    // 글자크기·필수 표시는 여러 개를 섞어 골라도 그중 해당 타입만 한꺼번에 바뀐다.
    fL.classList.toggle('hidden', n !== 1 || !HAS_TEXT[ss[0].t]);
    if (n === 1) fL.value = ss[0].label || '';
    const textShapes = ss.filter((x) => HAS_TEXT[x.t]);
    fsWrap.classList.toggle('hidden', !textShapes.length);
    if (textShapes.length) fS.value = commonOf(textShapes, (x) => x.fs || DEFAULT_FS) ?? '';
    // 설명(+연결 화살표)·항목은 요소마다 내용이 고유해서 한꺼번에 편집하는 게 의미가 없다 — 1개 선택일 때만.
    descInput.value = n === 1 ? ss[0].desc || '' : '';
    bDesc.classList.toggle('hidden', n !== 1);
    bItems.classList.toggle('hidden', n !== 1 || !HAS_ITEMS[ss[0].t]);
    const reqShapes = ss.filter((x) => HAS_REQ[x.t]);
    bReq.classList.toggle('hidden', !reqShapes.length);
    const allReq = reqShapes.length > 0 && reqShapes.every((x) => x.req);
    bReq.classList.toggle('on', allReq); bReq.setAttribute('aria-pressed', String(allReq));
  }
  // 그룹으로 묶기/해제는 그룹 도구라 2개 이상일 때만 의미가 있다 — 정렬 노출과 별개로 판단.
  bGroup.hidden = n < 2 || isOneWholeGroup();
  bUngroup.hidden = n < 1 || !selShapes().some((s) => s.g);
}

/** 현재 선택이 "정확히 한 그룹 전체"인가 (이 경우 재-묶기 불필요) */
function isOneWholeGroup() {
  const ss = selShapes();
  const gs = new Set(ss.map((s) => s.g).filter(Boolean));
  return gs.size === 1 && ss.every((s) => s.g) && groupMembers([...gs][0]).length === ss.length;
}

function applyLabel() {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  if (!textEditPushed.label) { push(); textEditPushed.label = true; }
  s.label = fL.value;
  const el = board.querySelector('.sh[data-id="' + s.id + '"]');
  if (el) setShapeContent(el, s);
  if (WRAP_FIT_TYPES[s.t]) fitWrapHeight(s);
  notify();
}

function applyDesc() {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  if (!textEditPushed.desc) { push(); textEditPushed.desc = true; }
  s.desc = descInput.value;
  notify();
}

/** 스케치 캔버스에서만 참고용으로 보이는 글자 크기 — 생성 결과의 표준 컴포넌트 스타일에는 적용되지 않는다. */
function clampFs(v) { return Math.max(8, Math.min(48, v || DEFAULT_FS)); }

function applyFontSize() {
  const ss = selShapes().filter((s) => HAS_TEXT[s.t]);
  if (!ss.length) return;
  if (!textEditPushed.fs) { push(); textEditPushed.fs = true; }
  const v = clampFs(parseInt(fS.value, 10));
  ss.forEach((s) => {
    s.fs = v;
    const el = board.querySelector('.sh[data-id="' + s.id + '"]');
    if (el) el.style.fontSize = v + 'px';
  });
  notify();
}

function stepFontSize(d) {
  const ss = selShapes().filter((s) => HAS_TEXT[s.t]);
  if (!ss.length) return;
  push();
  // 여러 개 선택했으면 각자 지금 크기 기준으로 한 단계씩 — 서로 다른 크기였다면 그 차이는 유지된다.
  ss.forEach((s) => {
    s.fs = clampFs((s.fs || DEFAULT_FS) + d);
    const el = board.querySelector('.sh[data-id="' + s.id + '"]');
    if (el) el.style.fontSize = s.fs + 'px';
  });
  fS.value = commonOf(ss, (s) => s.fs) ?? '';
  notify();
}

// ── 항목(select/radio/list/tab) 하나씩 입력 ─────────────────
const itemsArray = (s) => String(s.cols || '').split(',').map((x) => x.trim()).filter(Boolean);
const setItemsOf = (s, arr) => { s.cols = arr.join(','); };
/** 항목 추가·이동·삭제는 팝오버 안의 목록만 새로 그리고 캔버스의 실제 도형은 안 건드려서,
 * 다른 걸 클릭해 전체 render() 가 한 번 더 일어나기 전까진 방금 추가한 항목이 캔버스에 안
 * 보이는 문제가 있었다(list/tab/radio 공통) — 항목이 바뀔 때마다 그 도형만 바로 다시 그린다. */
function refreshShapeEl(s) {
  const el = board.querySelector('.sh[data-id="' + s.id + '"]');
  if (el) setShapeContent(el, s);
  if (WRAP_FIT_TYPES[s.t]) fitWrapHeight(s);
}

/** 줄바꿈될 수 있는 타입 — 라디오는 항목이(생성 결과와 동일, flex-wrap), 버튼은 문구가 길면
 * 두 줄로 넘어간다(CSS white-space:normal). 둘 다 도형 높이가 그대로면 선택 테두리 아래로
 * 넘쳐서 잘려 보이므로 fitWrapHeight 로 필요한 만큼 높이를 늘려준다. */
const WRAP_FIT_TYPES = { radio: 1, button: 1 };
/** 지금 폭 기준으로 내용이 실제로 필요로 하는 높이를 재서, 지금 높이가 모자라면 그만큼 늘린다
 * (이미 그보다 크게 잡아 뒀으면 줄이지 않는다 — 세로 방향으로 직접 조절한 값은 존중). */
function fitWrapHeight(s) {
  const el = board.querySelector('.sh[data-id="' + s.id + '"]');
  if (!el) return;
  const wrap = el.querySelector('.sh-radios') || el;
  const needed = Math.ceil(wrap.scrollHeight);
  const h = Math.max(s.h, Math.min(BOARD_H - s.y, needed));
  if (h !== s.h) {
    s.h = h;
    el.style.height = h + 'px';
  }
}

function renderItemsList() {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  const arr = itemsArray(s);
  if (!arr.length) {
    itemsList.replaceChildren(Object.assign(document.createElement('div'), {
      className: 'items-empty', textContent: '항목 없음 — 아래에서 추가하세요',
    }));
    return;
  }
  itemsList.replaceChildren(...arr.map((label, i) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.dataset.idx = String(i);
    const text = document.createElement('span');
    text.className = 'item-text';
    text.textContent = label;
    text.title = '더블클릭해서 이름 수정';
    text.addEventListener('dblclick', () => editItemRow(row, text, i));
    row.append(
      text,
      Object.assign(document.createElement('button'), {
        type: 'button', className: 'item-btn', textContent: '▲', title: '위로 이동',
        disabled: i === 0,
        onclick: () => moveItem(i, -1),
      }),
      Object.assign(document.createElement('button'), {
        type: 'button', className: 'item-btn', textContent: '▼', title: '아래로 이동',
        disabled: i === arr.length - 1,
        onclick: () => moveItem(i, 1),
      }),
      Object.assign(document.createElement('button'), {
        type: 'button', className: 'item-btn del', textContent: '×', title: '삭제',
        onclick: () => delItem(i),
      }),
    );
    return row;
  }));
}

/** 팝오버 목록에서 항목 이름을 그 자리에서 고친다(더블클릭) */
function editItemRow(row, textEl, i) {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s || row.querySelector('input')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'item-rename';
  input.value = itemsArray(s)[i] ?? '';
  input.setAttribute('aria-label', '항목 이름 수정');
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save) renameItem(s, i, input.value);
    renderItemsList(); // 저장 여부와 관계없이 목록을 원래 모양으로
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  textEl.replaceWith(input);
  input.focus();
  input.select();
}

function setItemsPop(open) {
  itemsPop.hidden = !open;
  bItems.setAttribute('aria-expanded', String(open));
  if (open) { renderItemsList(); itemsInput.focus(); }
}
function toggleItemsPop() { setItemsPop(itemsPop.hidden); }
function closeItemsPop(refocus) {
  if (itemsPop.hidden) return;
  setItemsPop(false);
  if (refocus) bItems.focus();
}

function setPosPop(open) {
  posPop.hidden = !open;
  bPos.setAttribute('aria-expanded', String(open));
}
function togglePosPop() { setPosPop(posPop.hidden); }
function closePosPop(refocus) {
  if (posPop.hidden) return;
  setPosPop(false);
  if (refocus) bPos.focus();
}

function setAlignPop(open) {
  alignPop.hidden = !open;
  bAlign.setAttribute('aria-expanded', String(open));
}
function toggleAlignPop() { setAlignPop(alignPop.hidden); }
function closeAlignPop(refocus) {
  if (alignPop.hidden) return;
  setAlignPop(false);
  if (refocus) bAlign.focus();
}

function setDescPop(open) {
  descPop.hidden = !open;
  bDesc.setAttribute('aria-expanded', String(open));
  if (open) { updateDescLinkUI(); descInput.focus(); }
  else cancelPickLink();
  renderLinks(); // 화살표는 이 팝오버가 열려 있을 때만 보인다
}
function toggleDescPop() { setDescPop(descPop.hidden); }
function closeDescPop(refocus) {
  if (descPop.hidden) return;
  setDescPop(false);
  if (refocus) bDesc.focus();
}

/** "연결된 요소" 목록을 최신 상태로 갱신 — 팝오버를 열 때, 연결을 걸거나 끊을 때 호출한다.
 * 이제 모든 타입에서 쓸 수 있고, 대상도 여러 개를 걸 수 있다(예: 조회 버튼 → 그리드 + 상태 라벨). */
function updateDescLinkUI() {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  const links = Array.isArray(s.links) ? s.links : [];
  descLinkList.replaceChildren(...links.map((tid) => {
    const t = find(tid);
    const row = document.createElement('div');
    row.className = 'item-row';
    const text = document.createElement('span');
    text.className = 'item-text';
    text.textContent = t ? `${NAME[t.t]} · ${t.label || NAME[t.t]}` : '(지워진 요소)';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-btn del';
    del.textContent = '×';
    del.title = '연결 해제';
    del.addEventListener('click', () => removeLink(tid));
    row.append(text, del);
    return row;
  }));
  const picking = pickingLinkFor === s.id;
  descLinkPick.textContent = picking ? '요소를 클릭하세요… (다시 누르면 종료)' : '🎯 클릭해서 연결할 요소 추가';
  descLinkPick.classList.toggle('on', picking);
  // 대상을 클릭하는 동안은 팝오버가 캔버스를 가려 클릭하기 어려우므로 통째로 숨기고,
  // 대신 이미 얇은 한 줄인 툴바 안에 진행 상황 배지(연결 개수 + 완료)만 남긴다.
  descPop.classList.toggle('picking-hidden', picking);
  pickCount.textContent = `${links.length}개 연결됨`;
  pickStatus.hidden = !picking;
}

/** "대상 선택" 모드를 켜고 끈다 — 켜져 있는 동안 캔버스 클릭은 선택 대신 연결 대상 지정으로 쓰인다.
 * 대상을 하나 고른 뒤에도 모드가 유지되어 여러 개를 연달아 추가할 수 있다. */
function togglePickLink() {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  if (pickingLinkFor === s.id) { cancelPickLink(); return; }
  pickingLinkFor = s.id;
  board.style.cursor = 'crosshair';
  updateDescLinkUI();
}
function cancelPickLink() {
  if (pickingLinkFor == null) return;
  pickingLinkFor = null;
  board.style.cursor = '';
  updateDescLinkUI();
}
function removeLink(targetId) {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s || !Array.isArray(s.links)) return;
  const idx = s.links.indexOf(targetId);
  if (idx === -1) return;
  push();
  s.links.splice(idx, 1);
  render();
  notify();
  updateDescLinkUI();
}

/** 선택 요소(들)를 한 단계만 앞/뒤로 옮긴다 (dir: +1 앞으로, -1 뒤로). 여러 개 선택 시
 * 선택 묶음 전체가 서로의 순서는 유지한 채 인접한 미선택 요소 하나와 자리를 바꾼다. */
function stepZ(dir) {
  const ss = selShapes();
  if (!ss.length) return;
  push();
  const selSet = new Set(ss.map((s) => s.id));
  if (dir > 0) {
    for (let i = shapes.length - 2; i >= 0; i--) {
      if (selSet.has(shapes[i].id) && !selSet.has(shapes[i + 1].id)) {
        [shapes[i], shapes[i + 1]] = [shapes[i + 1], shapes[i]];
      }
    }
  } else {
    for (let i = 1; i < shapes.length; i++) {
      if (selSet.has(shapes[i].id) && !selSet.has(shapes[i - 1].id)) {
        [shapes[i - 1], shapes[i]] = [shapes[i], shapes[i - 1]];
      }
    }
  }
  render();
}

function addItemFromInput() {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  const v = itemsInput.value.trim();
  if (!s || !v) return;
  push();
  setItemsOf(s, [...itemsArray(s), v]);
  itemsInput.value = '';
  renderItemsList();
  refreshShapeEl(s);
  notify();
  itemsInput.focus();
}

function moveItem(i, dir) {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  const arr = itemsArray(s);
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  push();
  [arr[i], arr[j]] = [arr[j], arr[i]];
  setItemsOf(s, arr);
  renderItemsList();
  refreshShapeEl(s);
  notify();
}

function delItem(i) {
  if (selIds.length !== 1) return;
  const s = find(selIds[0]);
  if (!s) return;
  push();
  const arr = itemsArray(s);
  arr.splice(i, 1);
  setItemsOf(s, arr);
  renderItemsList();
  refreshShapeEl(s);
  notify();
}

function toggleReq() {
  const ss = selShapes().filter((s) => HAS_REQ[s.t]);
  if (!ss.length) return;
  push();
  // 여러 개 선택했으면 하나라도 아직 ✕면 전부 ON, 이미 전부 ON이면 전부 OFF — 켜져 있던 것만
  // 끄이는 식으로 뒤죽박죽되지 않게 "다같이 켜거나 다같이 끄거나" 둘 중 하나로 맞춘다.
  const allOn = ss.every((s) => s.req);
  const next = !allOn;
  ss.forEach((s) => { s.req = next; });
  bReq.classList.toggle('on', next); bReq.setAttribute('aria-pressed', String(next));
  render();
}

// ── 정렬 / 분배 ──────────────────────────────────────────
/**
 * 정렬·분배 좌표 계산 (순수 함수 — 입력을 바꾸지 않고 새 {x,y} 배열 반환).
 * 2개 이상 선택 시엔 선택된 요소들끼리의 바운딩박스 기준(서로 정렬), 1개만 선택했을 땐
 * board 를 넘기면 캔버스(페이지) 기준으로 정렬한다 — 요소 하나를 캔버스 정중앙에 놓는 용도.
 * @param {{x:number,y:number,w:number,h:number}[]} list
 * @param {'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'|'hdist'|'vdist'} act
 * @param {{w:number,h:number}} [board] — 1개 선택 시에만 쓰인다
 */
export function computeAlign(list, act, board) {
  const out = list.map((s) => ({ x: s.x, y: s.y }));
  if (!list.length) return out;
  if (list.length === 1 && board) {
    const s = list[0];
    if (act === 'left') out[0].x = 0;
    else if (act === 'right') out[0].x = board.w - s.w;
    else if (act === 'hcenter') out[0].x = Math.round((board.w - s.w) / 2);
    else if (act === 'top') out[0].y = 0;
    else if (act === 'bottom') out[0].y = board.h - s.h;
    else if (act === 'vcenter') out[0].y = Math.round((board.h - s.h) / 2);
    return out;
  }
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
  if (!ss.length) return;
  push();
  const next = computeAlign(ss, act, { w: BOARD_W, h: BOARD_H });
  ss.forEach((s, i) => {
    s.x = Math.max(0, Math.min(BOARD_W - s.w, next[i].x));
    s.y = Math.max(0, Math.min(BOARD_H - s.h, next[i].y));
  });
  render();
}

/** 선택된 요소들의 폭(또는 높이)을 가장 큰 값에 맞춘다 — 줄어들어 내용이 잘리는 요소가 없도록. */
function matchSize(dim) {
  const ss = selShapes();
  if (ss.length < 2) return;
  push();
  const target = Math.max(...ss.map((s) => (dim === 'w' ? s.w : s.h)));
  ss.forEach((s) => {
    if (dim === 'w') s.w = Math.min(BOARD_W - s.x, target);
    else s.h = Math.min(BOARD_H - s.y, target);
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
/** shapes 를 복제하며 그룹 id 를 새로 매핑 (원본 그룹에 섞이지 않게).
 * `{ ...s }` 는 얕은 복사라 s.links(배열) 는 원본과 같은 배열 인스턴스를 그대로 참조하게 된다 —
 * removeLink 등이 그 배열을 splice/push 로 제자리 수정하므로, 복제본에서 연결을 끊거나
 * 추가하면 원본도 같이 바뀌는 버그가 있었다. links 도 새 배열로 떠서 독립시킨다. */
function cloneWithNewGroups(list, ox, oy) {
  const gmap = new Map();
  // 함께 복사한 요소끼리의 연결(예: 조회 버튼 → 결과 표를 같이 복제)은 복사본끼리 잇는다 — 그대로 두면
  // 복사한 버튼이 원본 표를 가리킨다. 복사 범위 밖 요소로의 연결은 원래 대상을 그대로 가리킨다.
  const idMap = new Map(list.map((s) => [s.id, uid++]));
  return list.map((s) => {
    let g = s.g || null;
    if (g) { if (!gmap.has(g)) gmap.set(g, 'g' + gid++); g = gmap.get(g); }
    return {
      ...s, id: idMap.get(s.id), g,
      x: Math.max(0, Math.min(BOARD_W - s.w, s.x + ox)),
      y: Math.max(0, Math.min(BOARD_H - s.h, s.y + oy)),
      links: Array.isArray(s.links) ? s.links.map((id) => idMap.get(id) ?? id) : s.links,
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
  // 여러 번 붙여넣으면 매번 같은 자리에 겹쳐 쌓이지 않고 조금씩 비켜 놓이게 버퍼 위치를 옮겨 둔다
  clip = copies.map((c) => ({ ...c, links: Array.isArray(c.links) ? [...c.links] : c.links }));
  setSel(copies.map((c) => c.id));
}

function copySel() {
  const ss = selShapes();
  if (ss.length) clip = ss.map((s) => ({ ...s, links: Array.isArray(s.links) ? [...s.links] : s.links }));
}

function cutSel() {
  if (!selIds.length) return;
  copySel();
  delSel();
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
  // 연결 대상 중 지워진 것이 있으면 목록에서 걷어낸다(화살표도 자연히 사라진다).
  shapes.forEach((s) => {
    if (Array.isArray(s.links) && s.links.length) s.links = s.links.filter((id) => find(id));
  });
  setSel([]);
}

function push() {
  opSeq++;
  hist.push(JSON.stringify(shapes));
  future = [];
  if (hist.length > 60) hist.shift();
}

// 드래그 이동·크기 조절은 누르는 순간(mousedown) 체크포인트를 찍는데, 요소를 그냥 클릭해 선택만
// 하고 끝나면 아무것도 안 바뀐 체크포인트가 쌓여 Ctrl+Z 를 눌러도 반응이 없는 것처럼 보이고
// 다시 실행(redo) 기록까지 날아갔다 — 제스처가 끝났을 때 바뀐 게 없으면 그 체크포인트를 되무른다.
let gesture = null;
function pushGesture() {
  const prevFuture = future;
  push();
  gesture = { snap: hist.at(-1), future: prevFuture, seq: opSeq };
}
function endGesture() {
  if (!gesture) return false;
  const g = gesture;
  gesture = null;
  if (g.seq === opSeq && hist.at(-1) === g.snap && JSON.stringify(shapes) === g.snap) {
    hist.pop();
    future = g.future;
    opSeq--; // 연속 추가(addComponent) 판별이 "선택만 한 클릭" 때문에 끊기지 않게
    bU.disabled = !hist.length;
    bR.disabled = !future.length;
    return false;
  }
  return true;
}

const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** 파일 가져오기·예전 저장본처럼 형식이 어긋난 데이터가 들어와도 캔버스가 깨지지 않게, 알 수 없는
 * 타입·객체가 아닌 항목은 버리고 좌표·크기는 숫자로 맞춘다. */
function isValidShape(s) {
  return !!s && typeof s === 'object' && !!DEF[s.t || s.type];
}

export function normalize(arr) {
  const list = (Array.isArray(arr) ? arr : []).filter(isValidShape);
  // 새 id 는 배열 순서대로 1부터 다시 매긴다. 그런데 저장된 id(내부 숫자 또는 payload 의 's'+숫자)는
  // 삭제·순서 바꾸기(맨 앞으로 등)를 거치면 배열 위치와 어긋나므로, 연결(links/linksTo)은 반드시
  // "원래 id → 새 id" 표로 옮겨야 한다 — 예전엔 접두사만 떼서 그대로 써서, 요소를 하나 지운 뒤
  // 다시 열면 버튼이 엉뚱한 요소(심지어 자기 자신)를 가리켰다.
  const idMap = new Map();
  list.forEach((s, i) => { if (s.id != null) idMap.set(String(s.id), i + 1); });
  return list.map((s, i) => {
    const [dw, dh] = DEF[s.t || s.type];
    return {
      id: i + 1,
      t: s.t || s.type,
      x: finite(s.x, 0), y: finite(s.y, 0),
      w: Math.max(1, finite(s.w, dw)), h: Math.max(1, finite(s.h, dh)),
      label: s.label ?? '',
      cols: s.cols ?? s.items ?? '',
      req: !!(s.req ?? s.required),
      g: s.g ?? s.group ?? null,
      src: s.src ?? null,
      desc: s.desc ?? '',
      fs: s.fs ?? s.fontSize ?? null,
      links: normalizeLinks(s, idMap, i + 1, list.length),
    };
  });
}

/** 연결 대상 id 들을 새 id 로 옮긴다. 원래 id 가 없는 예전 데이터만 's'+순번 규칙으로 추정한다.
 * link/linkTo(단일값)는 이전 버전 데이터 호환용. */
function normalizeLinks(s, idMap, selfId, count) {
  const raw = Array.isArray(s.links) ? s.links
    : Array.isArray(s.linksTo) ? s.linksTo
      : [s.link ?? s.linkTo].filter((v) => v != null);
  const toNew = (v) => {
    if (v == null) return null;
    if (idMap.size) return idMap.get(String(v)) ?? idMap.get(String(v).replace(/^s/, '')) ?? null;
    const n = parseInt(String(v).replace(/^s/, ''), 10);
    return n >= 1 && n <= count ? n : null; // 없는 요소를 가리키면 버린다
  };
  return [...new Set(raw.map(toNew).filter((v) => v != null && v !== selfId))];
}

// ── 공개 API ──────────────────────────────────────────────

export function initEditor(opts = {}) {
  board = document.getElementById('board');
  boardWrap = document.getElementById('boardWrap');
  ctx = document.getElementById('ctx');
  hint = document.getElementById('hint');
  ctxT = document.getElementById('ctxT');
  fL = document.getElementById('fL');
  fS = document.getElementById('fS');
  fsUp = document.getElementById('fsUp');
  fsDown = document.getElementById('fsDown');
  fsWrap = document.getElementById('fsWrap');
  bDesc = document.getElementById('bDesc');
  descPop = document.getElementById('descPop');
  descInput = document.getElementById('descInput');
  descLinkWrap = document.getElementById('descLinkWrap');
  descLinkPick = document.getElementById('descLinkPick');
  descLinkList = document.getElementById('descLinkList');
  pickStatus = document.getElementById('pickStatus');
  pickCount = document.getElementById('pickCount');
  pickDone = document.getElementById('pickDone');
  linkLayer = document.getElementById('linkLayer');
  bItems = document.getElementById('bItems');
  itemsPop = document.getElementById('itemsPop');
  itemsList = document.getElementById('itemsList');
  itemsInput = document.getElementById('itemsInput');
  itemsAddBtn = document.getElementById('itemsAddBtn');
  bPos = document.getElementById('bPos');
  posPop = document.getElementById('posPop');
  bAlign = document.getElementById('bAlign');
  alignPop = document.getElementById('alignPop');
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
  if (opts.isBlocked) isBlocked = opts.isBlocked;

  marqEl = document.createElement('div');
  marqEl.className = 'marq';
  marqEl.hidden = true;
  board.appendChild(marqEl);

  // 캔버스를 클릭하면 입력 필드에서 포커스를 뗀다 → Ctrl+A·Del 등 단축키가 바로 먹도록.
  // capture 단계라 요소의 stopPropagation 보다 먼저 실행된다.
  cv.addEventListener('mousedown', (e) => {
    // 인라인 편집 중인 입력창 안을 클릭한 거면 커서 이동일 뿐이니 그대로 둔다(포커스를 뺏으면
    // 편집이 바로 끝나버려 커서를 옮길 수가 없다). 다른 곳을 클릭하면 blur 로 commit 된다.
    if (e.target.closest('.inline-edit')) return;
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && !ae.closest('.ctx')) ae.blur();
    // 캔버스에 키보드 포커스를 준다 → Ctrl+A·Del·방향키가 확실히 먹도록
    if (!e.target.closest('.ctx')) board.focus({ preventScroll: true });
  }, true);

  board.addEventListener('mousedown', (e) => {
    if (e.target !== board && e.target.id !== 'hint' && e.target !== marqEl) return;
    if (pickingLinkFor != null) { cancelPickLink(); return; }
    const addKey = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!addKey) setSel([]);
    const p = pt(e);
    marq = { x0: p.x, y0: p.y, add: addKey, base: [...selIds] };
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
      // 드래그 범위 안에 완전히 들어온 요소만 선택한다(일부만 걸치면 선택 안 됨) — PPT·Canva 등과
      // 같은 방식. 예전엔 살짝만 겹쳐도 선택돼 의도치 않게 묶이는 경우가 많았다.
      const hits = shapes
        .filter((s) => s.x >= x && s.y >= y && s.x + s.w <= x + w && s.y + s.h <= y + h)
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
        guides(s); quick(s);
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
        updateOverlays(); // 다중 선택 박스·그룹 외곽선이 이동한 도형들을 따라오게
      }
    }
    if (rs) {
      const s = find(rs.id);
      const p = pt(e);
      const dx = p.x - rs.px;
      const dy = p.y - rs.py;
      const d = rs.d;
      // 캔버스 밖으로는 늘어나지 않게 한다(이동은 캔버스 안으로 막혀 있는데 크기 조절만 뚫려 있어서,
      // 가장자리 너머로 늘린 요소는 잘려 보이고 생성 결과에서도 화면 밖으로 삐져나갔다).
      if (d.includes('e')) s.w = Math.max(24, Math.min(BOARD_W - rs.ox, Math.round(rs.ow + dx)));
      if (d.includes('s')) s.h = Math.max(20, Math.min(BOARD_H - rs.oy, Math.round(rs.oh + dy)));
      if (d.includes('w')) { const w = Math.max(24, Math.min(rs.ox + rs.ow, Math.round(rs.ow - dx))); s.x = rs.ox + rs.ow - w; s.w = w; }
      if (d.includes('n')) { const h = Math.max(20, Math.min(rs.oy + rs.oh, Math.round(rs.oh - dy))); s.y = rs.oy + rs.oh - h; s.h = h; }
      snapSize(s, d, rs);
      resizeGuides(s, d, rs); quick(s);
      // 라디오·버튼은 폭이 좁아져 줄바꿈되면 선택 테두리(=도형 높이)도 같이 늘어나야
      // 잘리지 않고 다 보인다 — 가로 방향 리사이즈일 때만(세로만 직접 조절할 땐 그대로 둔다).
      if (WRAP_FIT_TYPES[s.t] && (d.includes('e') || d.includes('w'))) fitWrapHeight(s);
    }
    if (mrs) {
      const p = pt(e);
      const dx = p.x - mrs.px;
      const dy = p.y - mrs.py;
      const d = mrs.d;
      let nx = mrs.ox; let ny = mrs.oy; let nw = mrs.ow; let nh = mrs.oh;
      if (d.includes('e')) nw = Math.max(24, mrs.ow + dx);
      if (d.includes('s')) nh = Math.max(20, mrs.oh + dy);
      if (d.includes('w')) { nw = Math.max(24, mrs.ow - dx); nx = mrs.ox + mrs.ow - nw; }
      if (d.includes('n')) { nh = Math.max(20, mrs.oh - dy); ny = mrs.oy + mrs.oh - nh; }
      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      nw = Math.min(nw, BOARD_W - nx);
      nh = Math.min(nh, BOARD_H - ny);
      // 바운딩 박스가 커지고 작아진 비율만큼, 그 안의 도형들도 자기 위치·크기에 같은 비율을 적용한다
      // (개별 스냅은 안 걸고 비율만 유지 — 여럿이 동시에 움직이는 중엔 스냅이 오히려 더 헷갈린다).
      const scaleX = nw / mrs.ow;
      const scaleY = nh / mrs.oh;
      mrs.ids.forEach((id) => {
        const sh = find(id);
        const o = mrs.orig[id];
        sh.x = Math.round(nx + (o.x - mrs.ox) * scaleX);
        sh.y = Math.round(ny + (o.y - mrs.oy) * scaleY);
        sh.w = Math.max(24, Math.round(o.w * scaleX));
        sh.h = Math.max(20, Math.round(o.h * scaleY));
        quick(sh);
      });
      updateOverlays(); // 다중 선택 박스뿐 아니라, 그룹이 섞여 있으면 그 점선 외곽선도 같이 갱신
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
      if (endGesture()) notify();
    }
    move = null;
    rs = null;
    if (mrs) {
      // 라디오가 섞여 있었으면 방금 바뀐 폭 기준으로 줄바꿈 여부를 다시 재서 높이를 맞춘다.
      mrs.ids.forEach((id) => { const sh = find(id); if (sh && WRAP_FIT_TYPES[sh.t]) fitWrapHeight(sh); });
      mrs = null;
      const changed = endGesture();
      render(); // 바운딩 박스·손잡이를 최종 크기에 맞게 다시 그린다
      if (changed) notify();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!cmenu.hidden && e.key === 'Escape') { e.preventDefault(); hideMenu(); board.focus(); return; }
    if (pickingLinkFor != null && e.key === 'Escape') { e.preventDefault(); cancelPickLink(); return; }
    if (!itemsPop.hidden && e.key === 'Escape') { e.preventDefault(); closeItemsPop(true); return; }
    if (!posPop.hidden && e.key === 'Escape') { e.preventDefault(); closePosPop(true); return; }
    if (!alignPop.hidden && e.key === 'Escape') { e.preventDefault(); closeAlignPop(true); return; }
    if (!descPop.hidden && e.key === 'Escape') { e.preventDefault(); closeDescPop(true); return; }
    // 결과 모달·확인 대화상자가 떠 있는 동안엔 뒤에 가려진 캔버스를 건드리지 않는다 — 예전엔 모달의
    // 버튼에 포커스가 있는 채 Delete·방향키·Ctrl+Z 를 누르면 보이지 않는 캔버스의 요소가 지워지거나 움직였다.
    if (isBlocked()) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable) return;
    const c = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (c && (k === '0' || k === '1')) { e.preventDefault(); if (k === '0') zoomReset(); else zoomTo(100); }
    else if (c && (k === '=' || k === '+' || k === '-' || k === '_')) {
      e.preventDefault();
      zoomBy(k === '-' || k === '_' ? -10 : 10);
    }
    else if (c && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (c && k === 'y') { e.preventDefault(); redo(); }
    else if (c && k === 'a') { e.preventDefault(); setSel(shapes.map((s) => s.id)); }
    else if (c && k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); }
    else if (c && k === 'c') copySel();
    else if (c && k === 'x') { if (selIds.length) { e.preventDefault(); cutSel(); } }
    // Ctrl+V 는 여기서 막지 않는다 — keydown 을 preventDefault 하면 paste 이벤트 자체가 안 떠서
    // 다른 프로그램에서 복사한 이미지 붙여넣기가 통째로 막혔다. main.js 의 paste 처리가 이미지면
    // 이미지 요소로, 아니면 pasteShapes() 로 복사해 둔 요소를 붙여넣는다.
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
      if (!dx && !dy) return; // 이미 가장자리 — 되돌리기 기록만 쌓이지 않게
      push();
      ss.forEach((s) => { s.x += dx; s.y += dy; quick(s); });
      updateOverlays();
      notify();
    }
  });

  // 컨텍스트 툴바
  fL.addEventListener('input', applyLabel);
  fS.addEventListener('input', applyFontSize);
  fsUp.addEventListener('click', () => stepFontSize(1));
  fsDown.addEventListener('click', () => stepFontSize(-1));
  descInput.addEventListener('input', applyDesc);
  bDesc.addEventListener('click', toggleDescPop);
  descLinkPick.addEventListener('click', togglePickLink);
  pickDone.addEventListener('click', togglePickLink);
  bItems.addEventListener('click', toggleItemsPop);
  itemsAddBtn.addEventListener('click', addItemFromInput);
  itemsInput.addEventListener('keydown', (e) => {
    // 한글 조합 중 Enter 는 조합 확정용이라 무시한다 — 안 그러면 마지막 글자가 따로 한 항목으로 한 번 더 추가됐다
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addItemFromInput(); }
  });
  bPos.addEventListener('click', togglePosPop);
  bAlign.addEventListener('click', toggleAlignPop);
  document.addEventListener('mousedown', (e) => {
    if (!itemsPop.hidden && !itemsPop.contains(e.target) && !bItems.contains(e.target)) closeItemsPop(false);
    if (!posPop.hidden && !posPop.contains(e.target) && !bPos.contains(e.target)) closePosPop(false);
    if (!alignPop.hidden && !alignPop.contains(e.target) && !bAlign.contains(e.target)) closeAlignPop(false);
    if (!descPop.hidden && !descPop.contains(e.target) && !bDesc.contains(e.target) && !pickStatus.contains(e.target)) {
      closeDescPop(false);
    }
  });
  const ALIGN = {
    alignL: 'left', alignC: 'hcenter', alignR: 'right',
    alignT: 'top', alignM: 'vcenter', alignB: 'bottom',
    distH: 'hdist', distV: 'vdist',
  };
  const POS_ACTS = ['front', 'back', 'stepUp', 'stepDown'];
  ctx.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    if (ALIGN[act]) { alignAct(ALIGN[act]); return; }
    ({
      req: toggleReq, dup, front, back, del: delSel, group: groupSel, ungroup: ungroupSel,
      stepUp: () => stepZ(1), stepDown: () => stepZ(-1),
      matchW: () => matchSize('w'), matchH: () => matchSize('h'),
    })[act]?.();
    if (POS_ACTS.includes(act)) closePosPop(true);
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

  initCanvasNavigation();
  applyBoardSize();
  render();
}

// ── 확대·이동(패닝) ─────────────────────────────────────────
// Ctrl(⌘)+휠 = 커서 기준 확대·축소, 트랙패드 핀치도 같은 이벤트로 들어온다.
// 스페이스를 누른 채 드래그하거나 가운데 버튼으로 드래그 = 캔버스 끌어서 이동(손바닥 도구).
let panning = null;
let spaceHeld = false;

function setPanCursor() {
  cv.classList.toggle('panning', !!panning);
  cv.classList.toggle('pan-ready', spaceHeld && !panning);
}

function initCanvasNavigation() {
  cv.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; // 평소 휠은 그대로 스크롤
    e.preventDefault();
    // 휠 한 칸(deltaY ≈ ±100)에 약 1.1배 — 트랙패드의 잘게 쪼개진 값도 자연스럽게 누적된다
    zoomAtPoint(zm * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });

  // 스페이스: 누르고 있는 동안만 손바닥 도구 (입력칸에 타이핑 중이거나 모달이 떠 있으면 제외)
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || spaceHeld) return;
    if (isBlocked() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')
      || document.activeElement?.isContentEditable) return;
    spaceHeld = true;
    setPanCursor();
    e.preventDefault(); // 스페이스로 페이지가 스크롤되거나 포커스된 버튼이 눌리지 않게
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    spaceHeld = false;
    setPanCursor();
  });
  window.addEventListener('blur', () => { spaceHeld = false; panning = null; setPanCursor(); });

  cv.addEventListener('mousedown', (e) => {
    // 가운데 버튼은 언제나, 왼쪽 버튼은 스페이스를 누르고 있을 때만 이동으로 쓴다
    if (!(e.button === 1 || (e.button === 0 && spaceHeld))) return;
    e.preventDefault();
    e.stopPropagation(); // 요소 선택·드래그 선택으로 새지 않게
    panning = { x: e.clientX, y: e.clientY, left: cv.scrollLeft, top: cv.scrollTop };
    setPanCursor();
  }, true);
  document.addEventListener('mousemove', (e) => {
    if (!panning) return;
    cv.scrollLeft = panning.left - (e.clientX - panning.x);
    cv.scrollTop = panning.top - (e.clientY - panning.y);
  });
  document.addEventListener('mouseup', () => {
    if (!panning) return;
    panning = null;
    setPanCursor();
  });
  cv.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
}

// ── 우클릭 메뉴 구성 ──────────────────────────────────────
function hideMenu() { if (cmenu) cmenu.hidden = true; }

function menuItems() {
  const n = selIds.length;
  const hasGroup = selShapes().some((s) => s.g);
  const out = [];
  if (n >= 1) {
    out.push({ label: '잘라내기', sc: 'Ctrl+X', act: cutSel });
    out.push({ label: '복사', sc: 'Ctrl+C', act: copySel });
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
  zoomReset();
}

/** #boardWrap 을 "확대된 실제 크기"로 맞춘다 — transform 은 레이아웃 크기에 영향을 주지 않으므로,
 * 이 래퍼가 없으면 확대 시 캔버스 중앙정렬·스크롤 범위가 확대 전 크기 기준으로 계산돼
 * 상단 내용이 (고정된) 편집 툴바 뒤로 잘려 들어가 버린다. */
function applyZoomSize() {
  boardWrap.style.width = (BOARD_W * zm) / 100 + 'px';
  boardWrap.style.height = (BOARD_H * zm) / 100 + 'px';
}

/** 캔버스(보드) 크기 변경. 화면 유형/불러온 화면에 맞춰 호출. */
export function setBoardSize(w, h) {
  const nw = Math.max(320, Math.round(w) || DEFAULT_BOARD.w);
  const nh = Math.max(240, Math.round(h) || DEFAULT_BOARD.h);
  if (nw === BOARD_W && nh === BOARD_H) return;
  BOARD_W = nw;
  BOARD_H = nh;
  applyBoardSize(); // 내부에서 zoomReset() 까지 호출 — 보드 크기가 바뀌면 화면에 맞춰 배율도 다시 계산
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

// 신규 컴포넌트를 "연속으로" 추가할 때만 서로 겹치지 않게 조금씩 밀어서 놓는다 — 기존 요소와
// 겹치는 건 상관없다. 직전 호출도 addComponent 였는지는 push() 의 opSeq 로 판별한다: 그 사이에
// 다른 조작(이동·삭제 등)이 있었다면 그것도 push() 를 부르므로 연쇄가 자연히 끊긴다.
const ADD_STEP = 18;
let addStreakSeq = -1;
let addStreakSpot = null;

export function addComponent(t) {
  push();
  const [w, h] = DEF[t];
  const baseX = Math.round((BOARD_W - w) / 2);
  const baseY = Math.round((BOARD_H - h) / 2);
  let x = baseX;
  let y = baseY;
  if (addStreakSeq === opSeq - 1 && addStreakSpot) {
    x = Math.max(0, Math.min(BOARD_W - w, addStreakSpot.x + ADD_STEP));
    y = Math.max(0, Math.min(BOARD_H - h, addStreakSpot.y + ADD_STEP));
  }
  shapes.push({
    id: uid++, t,
    x, y, w, h,
    label: defaultLabel(t), cols: defaultCols(t), req: false,
  });
  addStreakSeq = opSeq;
  addStreakSpot = { x, y };
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

/** 변경화면: 소스 연동이 안 되는 화면의 캡처본을 캔버스 배경에 깔아 트레이싱용으로 쓴다.
 * shapes 와 무관한 순수 시각적 참고용이지만, "화면 생성" 시엔 payload.background 로 함께
 * 전달되어 생성 결과에서도 컴포넌트 뒤에 배경으로 표시된다(getBoardBackground 참고). */
export function setBoardBackground(src) {
  bgSrc = src;
  board.style.backgroundImage = `url("${src}")`;
  board.style.backgroundSize = '100% 100%';
  hint.style.display = 'none';
}
export function clearBoardBackground() {
  bgSrc = null;
  board.style.backgroundImage = '';
  // setBoardBackground 가 인라인으로 준 100% 100% 를 같이 지워야 CSS 의 20px 격자(안내선)가 원래대로 돌아온다
  board.style.backgroundSize = '';
  hint.style.display = shapes.length ? 'none' : 'block';
}
export const hasBoardBackground = () => !!bgSrc;
export const getBoardBackground = () => bgSrc;

export function setShapes(arr) {
  push();
  shapes = normalize(arr);
  uid = shapes.length + 1;
  const maxG = Math.max(0, ...shapes.map((s) => parseInt(String(s.g || '').replace(/\D/g, ''), 10) || 0));
  gid = maxG + 1;
  setSel([]);
}

/** 되돌리기·다시 기록을 비운다 — 다른 프로젝트를 열거나 새로 시작할 때 이전 내용으로 되돌아가지 않게 */
export function resetHistory() {
  hist = [];
  future = [];
  if (bU) bU.disabled = true;
  if (bR) bR.disabled = true;
}

export function clearShapes() {
  if (!shapes.length) return;
  push();
  shapes = [];
  setSel([]);
}

/** 되돌리기로 예전 상태를 불러오면 그 안의 id 가 지금 카운터보다 클 수 있다(다른 화면을 다녀오며
 * 번호를 다시 매긴 경우 등) — 새로 만드는 요소가 기존 id 와 겹치지 않게 카운터를 끌어올린다. */
function syncCounters() {
  uid = Math.max(uid, ...shapes.map((s) => (Number(s.id) || 0) + 1));
  gid = Math.max(gid, ...shapes.map((s) => (parseInt(String(s.g || '').replace(/D/g, ''), 10) || 0) + 1));
}

/** 화면(페이지)을 오갈 때 화면마다 편집 상태(요소·되돌리기 기록·id 카운터)를 그대로 보관한다(main.js).
 * payload 로 내보냈다 다시 읽으면 id 가 새로 매겨져 되돌리기 기록과 어긋나므로, 내부 형식 그대로 둔다. */
export function exportState() {
  return { shapes: JSON.stringify(shapes), hist: hist.slice(), future: future.slice(), uid, gid };
}
export function importState(st) {
  shapes = JSON.parse(st.shapes);
  hist = st.hist.slice();
  future = st.future.slice();
  uid = st.uid;
  gid = st.gid;
  syncCounters();
  setSel([]);
}

export function undo() {
  if (!hist.length) return;
  future.push(JSON.stringify(shapes));
  shapes = JSON.parse(hist.pop());
  syncCounters();
  setSel(selIds); // 되돌린 뒤에도 남아 있는 요소는 선택을 유지한다(PPT·캔바 방식)
}

export function redo() {
  if (!future.length) return;
  hist.push(JSON.stringify(shapes));
  shapes = JSON.parse(future.pop());
  syncCounters();
  setSel(selIds);
}

/** 확대율 한계 — 세로로 긴 화면(960×1400)도 한눈에 보이도록 아래를, 작은 요소를 다듬을 수 있도록 위를 넓혔다 */
export const ZOOM_MIN = 10;
export const ZOOM_MAX = 400;
const clampZoom = (v) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));

/** 지금 배율을 화면에 적용한다(확대는 좌상단 기준 — 커서 위치 유지 계산이 단순해진다) */
function applyZoom() {
  board.style.transformOrigin = '0 0';
  board.style.transform = 'scale(' + zm / 100 + ')';
  zv.textContent = Math.round(zm) + '%';
  applyZoomSize();
}

export function zoomBy(d) {
  setZoomAtCenter(clampZoom(zm + d));
}

/** 배율을 바꾸되 지금 보고 있는 화면 중앙이 그대로 가운데에 남도록 스크롤을 맞춘다 */
function setZoomAtCenter(next) {
  if (!cv) { zm = clampZoom(next); applyZoom(); return; }
  const r = cv.getBoundingClientRect();
  zoomAtPoint(next, r.left + cv.clientWidth / 2, r.top + cv.clientHeight / 2);
}

/**
 * 배율을 바꾸면서, 화면 좌표 (clientX, clientY) 아래에 있던 캔버스 지점이 계속 그 자리에 있도록
 * 스크롤을 보정한다 — Ctrl+휠 확대가 "커서 기준"으로 동작하게 하는 핵심.
 */
function zoomAtPoint(next, clientX, clientY) {
  const v = clampZoom(next);
  if (Math.abs(v - zm) < 0.01) return;
  const before = board.getBoundingClientRect();
  const bx = (clientX - before.left) / (zm / 100); // 캔버스(보드) 좌표
  const by = (clientY - before.top) / (zm / 100);
  zm = v;
  applyZoom();
  const after = board.getBoundingClientRect(); // 배율 적용 뒤 실제 위치를 다시 잰다
  cv.scrollLeft += after.left + bx * (zm / 100) - clientX;
  cv.scrollTop += after.top + by * (zm / 100) - clientY;
}

/** 화면 전체가 보이는 배율(zoomReset)과 100% 를 오가는 단축키용 */
export function zoomTo(percent) {
  setZoomAtCenter(percent);
}

/** 지금 보이는 캔버스 뷰포트에 맞춰 확대율을 계산한다(5% 단위, 25~200%) — "화면 필드가
 * 한눈에 보이는 크기"가 기본값이라는 요구사항. 보드 크기가 바뀔 때(화면 유형·변경화면·비율
 * 전환)와 하단 배율 버튼(리셋) 클릭 시 호출한다. 화면 유형 대부분이 같은 해상도(960×600)를
 * 쓰므로 자연히 같은 배율로 통일되고, 팝업처럼 작은 보드만 더 크게 보인다. */
export function zoomReset() {
  if (cv && cv.clientWidth && cv.clientHeight) {
    const availW = Math.max(160, cv.clientWidth - 60);
    const availH = Math.max(160, cv.clientHeight - 60);
    const scale = Math.min(availW / BOARD_W, availH / BOARD_H, 2);
    zm = clampZoom(Math.round((scale * 100) / 5) * 5);
  } else {
    zm = 100;
  }
  applyZoom();
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
    desc: s.desc || undefined,
    fontSize: s.fs || undefined,
    linksTo: Array.isArray(s.links) && s.links.length ? s.links.map((id) => 's' + id) : undefined,
  }));
}

/** 복사해 둔 요소 붙여넣기 (main.js 의 paste 이벤트에서 호출). 붙여넣었으면 true */
export function pasteShapes() {
  if (!clip || !clip.length) return false;
  pasteClip();
  return true;
}
