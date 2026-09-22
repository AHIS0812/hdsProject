// 규칙 기반 변환기 — 개발지시서 §4, §8 A-3
//
// 외부 LLM 미사용. payload → { websquareXml, previewHtml } 를 규칙으로 만든다.
// `/api/generate` 가 이 변환기를 전담 호출한다 (routes/generate.js).
//
// "추론"은 하지 않는다(자연어 규칙 해석·질문 생성 없음). 다만 배치에서 직접 읽히는
// 두 가지는 반영한다: ① 필수(＊) 라벨 → 인접 필드 전파  ② area 안의 요소 → 자식으로 중첩.

import { readJson } from '../shared/paths.js';
import { readingOrder } from '../web/js/reading-order.js';

export { readingOrder };

const MAPPING = (readJson('catalog/websquare/mapping.json', { default: {} }).default) || {};
const BUTTON_ROLE_HINTS = readJson('config/policy.json', { buttonRoleHints: {} }).buttonRoleHints || {};

/** 버튼 문구가 힌트와 정확히 일치할 때만 역할을 부여한다(부분 포함 금지 — "고객통합조회"가
 * "조회"에 걸려 함께 강조되는 것을 막기 위함). 못 찾으면 기본(아웃라인, 보조 액션). */
function buttonRole(label) {
  const text = String(label || '').trim();
  if ((BUTTON_ROLE_HINTS.primary || []).includes(text)) return 'primary';
  if ((BUTTON_ROLE_HINTS.solid || []).includes(text)) return 'solid';
  return 'default';
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const splitItems = (s) =>
  String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** XML 주석 안에는 "--" 가 올 수 없다(XML 1.0) — 화면 이름에 "--" 가 있으면 주석이 깨져 XML 전체가
 * 파싱되지 않았다. 이스케이프한 뒤 연속 하이픈을 떼어 놓는다. */
const commentText = (s) => esc(s).replace(/-(?=-)/g, '- ').replace(/-$/, '- ');

function expand(v, n, label) {
  return String(v).replace(/\{n\}/g, n).replace(/\{label\}/g, label);
}

function attrString(attrs, n, label, extraClass) {
  const parts = Object.entries(attrs || {}).map(
    ([k, val]) => `${k}="${esc(expand(val, n, label))}"`,
  );
  if (extraClass) parts.push(`class="${esc(extraClass)}"`);
  return parts.join(' ');
}

// ── 필수(＊) 라벨 → 인접 필드 전파 ─────────────────────────────────
const FIELD_TYPES = new Set(['input', 'select', 'date', 'text', 'file', 'radio', 'check']);

/**
 * `required` 인 label 을 찾아, 같은 줄 오른쪽(없으면 바로 아래)에서 가장 가까운
 * 입력 필드에 `required` 를 옮긴다. shapes 를 직접 수정하고 전파 건수를 반환.
 */
export function propagateRequired(shapes) {
  let n = 0;
  const fields = shapes.filter((s) => FIELD_TYPES.has(s.type));
  for (const lb of shapes.filter((s) => s.type === 'label' && s.required)) {
    let best = null;
    let bestKey = Infinity;
    // 1) 같은 줄 오른쪽
    for (const f of fields) {
      const rowOverlap = f.y < lb.y + lb.h && f.y + f.h > lb.y;
      const gap = f.x - (lb.x + lb.w);
      if (rowOverlap && gap >= -20 && gap < bestKey) { bestKey = gap; best = f; }
    }
    // 2) 바로 아래 (같은 열)
    if (!best) {
      for (const f of fields) {
        const colOverlap = f.x < lb.x + lb.w && f.x + f.w > lb.x;
        const gap = f.y - (lb.y + lb.h);
        if (colOverlap && gap >= -4 && gap < 40 && gap < bestKey) { bestKey = gap; best = f; }
      }
    }
    if (best && !best.required) { best.required = true; n += 1; }
  }
  return n;
}

// ── area 포함 관계 트리 ───────────────────────────────────────────
const areaOf = (s) => s.w * s.h;
/** area a 가 shape s 를 담고 있나 (s 의 중심이 a 안) */
function areaContains(a, s) {
  const cx = (s.x ?? 0) + (s.w ?? 0) / 2;
  const cy = (s.y ?? 0) + (s.h ?? 0) / 2;
  return cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h;
}

/**
 * 각 shape 의 부모 area(가장 작은 포함 area)를 찾아 트리를 만든다.
 * @returns {{ roots: object[], childrenOf: Map<object, object[]> }}
 */
export function buildContainmentTree(shapes) {
  const areas = shapes.filter((s) => s.type === 'area');
  const smallFirst = [...areas].sort((x, y) => areaOf(x) - areaOf(y));
  const childrenOf = new Map(areas.map((a) => [a, []]));
  const parentOf = new Map();

  const findParent = (s) => {
    for (const a of smallFirst) {
      if (a === s) continue;
      if (a.type === 'area' && s.type === 'area' && areaOf(a) <= areaOf(s)) continue;
      if (areaContains(a, s)) return a;
    }
    return null;
  };

  // area 를 먼저 배치(중첩 섹션), 그다음 일반 요소
  for (const s of [...smallFirst.slice().reverse(), ...shapes.filter((x) => x.type !== 'area')]) {
    const p = findParent(s);
    parentOf.set(s, p);
    if (p) childrenOf.get(p).push(s);
  }
  const roots = shapes.filter((s) => !parentOf.get(s));
  return { roots, childrenOf };
}

/** 한 shape → WebSquare XML 조각 */
export function shapeToXml(shape, n) {
  const m = MAPPING[shape.type];
  if (!m) return `<!-- ${commentText(shape.type)} (매핑 정의 없음) -->`;
  const label = shape.label || '';
  const attrs = attrString(m.attrs, n, label, m.requiredClass && shape.required ? m.requiredClass : '');
  const items = splitItems(shape.items);

  if (m.columnTag && items.length) {
    const cols = items.map((c) => `  <${m.columnTag} value="${esc(c)}"/>`).join('\n');
    return `<${m.tag} ${attrs}>\n${cols}\n</${m.tag}>`;
  }
  if (m.tabItemTag && items.length) {
    const tabs = items
      .map((c, i) => `  <${m.tabItemTag} id="tab${n}_${i + 1}" title="${esc(c)}"/>`)
      .join('\n');
    return `<${m.tag} ${attrs}>\n${tabs}\n</${m.tag}>`;
  }
  if (m.options && items.length) {
    const opts = items.map((o) => `  <option value="${esc(o)}">${esc(o)}</option>`).join('\n');
    return `<${m.tag} ${attrs}>\n${opts}\n</${m.tag}>`;
  }
  if (shape.type === 'image' && shape.src) {
    return `<${m.tag} ${attrs} src="${esc(shape.src)}"/>`;
  }
  return `<${m.tag} ${attrs}/>`;
}

// ── 상호작용 가능한 Preview HTML ─────────────────────────────
// select/radio/check 은 실제 form 요소(브라우저 기본 동작으로 클릭·선택 가능),
// list 는 항목을 실제 <table> 헤더로, tab/button 은 클릭 시 반응하도록 만든다.
// 값 자체(shape.label/items/desc)는 항상 esc() 로 이스케이프해 주입을 막는다.

const STATIC_STYLE = {
  // "▸ 주소" 처럼 섹션 제목 앞에 작은 삼각형을 붙이고 밑줄로 구획한다(실제 화면의 section header 톤).
  title: 'border:none;border-bottom:1px solid #e3e6ec;background:none;font-weight:700;color:#1a2942;' +
    'font-size:11.5px;justify-content:flex-start;padding-bottom:3px',
  label: 'border:none;background:none;font-weight:600;font-size:11px;color:#333;justify-content:flex-start',
  // 실제 화면은 점선 박스가 아니라 옅은 테두리의 흰 카드 — 라벨은 title 과 같은 섹션 헤더 톤으로.
  area: 'border:1px solid #e3e6ec;background:#fff;align-items:flex-start;justify-content:flex-start;' +
    'color:#1a2942;font-size:11.5px;font-weight:700',
  divider: 'border:none;background:none;border-top:1px solid #d3d8e0;border-radius:0',
  image: 'border:1px dashed #b9b7b2;background:#fafaf8;color:#9a9a9a;font-size:10px',
  pager: 'border:none;background:none;color:#9a9a9a;justify-content:center',
};

// 필수 표시(＊)는 입력 폭을 갉아먹지 않도록 별도 flex 자식이 아니라 컨트롤 위에 얹는 절대배치
// 오버레이로 그린다 — 그래야 좁은 필드에서도 레이아웃이 안 깨진다. control() 이 필요한 만큼
// 왼쪽 패딩을 넓혀 글자와 겹치지 않게 한다.
const reqStar = (shape) => (shape.required
  ? '<span style="position:absolute;left:3px;top:50%;transform:translateY(-50%);' +
    'color:#c00000;font-weight:800;font-size:10px;line-height:1;pointer-events:none;z-index:1">＊</span>'
  : '');
/** shape.linksTo(여러 개 가능)를 클릭 시 화살표를 그릴 data-link-targets 속성으로 바꾼다.
 * 화살표 연결의 대상을 런타임에 찾을 수 있도록, payload 의 shape.id 를 그대로 DOM id 로 쓴다. */
const linkTargetsAttr = (shape) => {
  const links = Array.isArray(shape.linksTo) ? shape.linksTo.filter(Boolean) : [];
  return links.length ? ` data-link-targets="${links.map((id) => `hs-${esc(id)}`).join(' ')}"` : '';
};
/** 버튼은 자기만의 클릭 처리(hs-btn)가 있으니 중복으로 달지 않는다 — 그 외 타입은
 * desc·linksTo 가 있으면 클릭 시 안내 문구 말풍선·연결 화살표가 뜨도록 표시해 둔다(annotate). */
const annoAttrs = (shape) => {
  if (shape.type === 'button') return '';
  const d = shape.desc && String(shape.desc).trim();
  const linkAttr = linkTargetsAttr(shape);
  if (!d && !linkAttr) return '';
  return ` class="hs-note"${d ? ` data-note="${esc(shape.desc)}"` : ''}${linkAttr}`;
};
const elId = (shape) => (shape.id ? ` id="hs-${esc(shape.id)}"` : '');
const wrapAbs = (shape, inner, extra = '') =>
  `<div${elId(shape)}${annoAttrs(shape)} style="position:absolute;box-sizing:border-box;left:${shape.x}px;top:${shape.y}px;` +
  `width:${shape.w}px;height:${shape.h}px;display:flex;align-items:center;gap:3px;${extra}">${inner}</div>`;

/** 필수 입력은 실제 화면처럼 옅은 크림색 배경으로 강조한다(별표 하나만으로는 눈에 잘 안 띔). */
const control = (shape) => 'flex:1;height:100%;min-width:0;font-size:11px;font-family:inherit;' +
  `border:1px solid #d3d8e0;border-radius:3px;box-sizing:border-box;color:#333;` +
  `padding:0 5px 0 ${shape.required ? 13 : 5}px;` + // 필수면 ＊ 오버레이가 안 겹치게 왼쪽 여백만 더
  `background:${shape.required ? '#FFFAE6' : '#fff'}`;

/** 한 shape → 상호작용 가능한 HTML 조각 (n = 읽기순 번호, radio name 그룹핑에 사용) */
function shapeToHtml(shape, n) {
  const t = shape.type;
  const items = splitItems(shape.items);

  if (t === 'image') {
    return shape.src
      ? wrapAbs(shape, `<img src="${esc(shape.src)}" alt="${esc(shape.label || '이미지')}" style="width:100%;height:100%;object-fit:contain">`, 'border:none')
      : wrapAbs(shape, esc(shape.label || '이미지'), STATIC_STYLE.image + ';justify-content:center;font-size:11px');
  }

  if (t === 'select') {
    const opts = items.length
      ? items.map((o) => `<option>${esc(o)}</option>`).join('')
      : `<option>(항목 없음)</option>`;
    return wrapAbs(shape, `${reqStar(shape)}<select style="${control(shape)}">${opts}</select>`);
  }
  if (t === 'radio') {
    const name = 'rg' + n;
    const inner = items.length
      ? items.map((o, i) => `<label style="display:flex;align-items:center;gap:2px;font-size:11px;white-space:nowrap">` +
          `<input type="radio" name="${name}"${i === 0 ? ' checked' : ''}> ${esc(o)}</label>`).join('')
      : '<span style="color:#9a9a9a;font-size:10px">(항목 없음)</span>';
    // 폭이 좁아 한 줄에 다 안 들어가면 스크롤바 대신 줄바꿈(세로로 쌓임) — 실제 라디오 버튼도
    // 자리가 부족하면 세로로 배치하지, 가로 스크롤을 달지는 않는다.
    return wrapAbs(shape, `${reqStar(shape)}${inner}`, `flex-wrap:wrap;gap:4px 10px${shape.required ? ';padding-left:11px' : ''}`);
  }
  if (t === 'check') {
    // 레이블 없이 체크박스 하나만 두고 싶을 수 있다 — 비워 두면 강제로 "선택 항목"을 채우지 않는다.
    const labelText = String(shape.label ?? '').trim();
    const inner = labelText ? `<input type="checkbox"> ${esc(labelText)}` : `<input type="checkbox">`;
    return wrapAbs(
      shape,
      `${reqStar(shape)}<label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#333;white-space:nowrap">${inner}</label>`,
      shape.required ? 'padding-left:11px' : '',
    );
  }
  if (t === 'list') {
    const ths = items.length ? items.map((c) => `<th style="padding:4px 6px;text-align:left;white-space:nowrap">${esc(c)}</th>`).join('') : '<th>(컬럼 없음)</th>';
    return wrapAbs(
      shape,
      `<div style="width:100%;height:100%;overflow:auto;border:1px solid #d3d8e0;background:#fff">` +
        `<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#EEF3FB">${ths}</tr></thead>` +
        `<tbody><tr><td colspan="${items.length || 1}" style="text-align:center;color:#9a9a9a;padding:12px">데이터 없음 (미리보기)</td></tr></tbody></table></div>`,
      'align-items:stretch',
    );
  }
  if (t === 'tab') {
    const btns = items.length
      ? items.map((label, i) => `<button type="button" class="hs-tab${i === 0 ? ' on' : ''}" ` +
          `style="font-size:10px;letter-spacing:1px;border:none;background:${i === 0 ? '#0F3B7C' : '#eef1f5'};` +
          `color:${i === 0 ? '#fff' : '#5a6472'};border-radius:5px;padding:0 10px;height:100%;cursor:pointer;font-family:inherit">${esc(label)}</button>`).join('')
      : '<span style="color:#9a9a9a;font-size:10px">(탭 없음)</span>';
    return wrapAbs(shape, btns, 'gap:4px;justify-content:flex-start');
  }
  if (t === 'button') {
    const role = buttonRole(shape.label);
    const roleStyle = {
      primary: 'background:#F5821F;border-color:#F5821F;color:#fff',
      solid: 'background:#0F3B7C;border-color:#0F3B7C;color:#fff',
      default: 'background:#fff;border-color:#9fb3d1;color:#0F3B7C',
    }[role];
    // linksTo(스케치에서 "연결할 요소"로 지정한 대상들)가 있으면 클릭 시 그 요소들로 화살표를 그린다.
    // 문구가 길면 한 줄로 잘리는 대신 줄바꿈된다 — 스케치 쪽에서 이미 그만큼 shape.h 를
    // 늘려서 보내주므로(editor.js fitWrapHeight) 박스 높이는 따로 계산할 필요가 없다.
    return wrapAbs(
      shape,
      `<button type="button" class="hs-btn" data-note="${esc(shape.desc || '')}"${linkTargetsAttr(shape)} style="${control({ required: false })};` +
        `${roleStyle};font-weight:700;cursor:pointer;white-space:normal;line-height:1.25;word-break:keep-all">${esc(shape.label || '버튼')}</button>`,
    );
  }
  if (t === 'date') return wrapAbs(shape, `${reqStar(shape)}<input type="date" style="${control(shape)}">`);
  if (t === 'input') return wrapAbs(shape, `${reqStar(shape)}<input type="text" placeholder="${esc(shape.label || '')}" style="${control(shape)}">`);
  if (t === 'text') return wrapAbs(shape, `${reqStar(shape)}<textarea placeholder="${esc(shape.label || '')}" style="${control(shape)};resize:none"></textarea>`);
  // 파일 선택은 브라우저 기본 위젯이라 ＊ 오버레이를 얹으면 "파일 선택" 버튼과 겹친다 —
  // 대신 배경색만으로 필수 표시(테두리는 그대로 둬 위젯이 잘려 보이지 않게).
  if (t === 'file') {
    return wrapAbs(shape, `<input type="file" style="flex:1;font-size:10px;min-width:0;` +
      `background:${shape.required ? '#FFFAE6' : 'transparent'}">`);
  }
  // 구분선·페이지 이동은 label 을 쓰지 않는 순수 장식/고정 위젯 — label 이 없을 때
  // 아래 공용 분기로 떨어지면 타입 영문 slug("divider"/"pager")가 그대로 찍혀 보였다.
  if (t === 'divider') return wrapAbs(shape, '', STATIC_STYLE.divider);
  if (t === 'pager') return wrapAbs(shape, '<span style="letter-spacing:2px">‹ 1 2 3 ›</span>', STATIC_STYLE.pager);

  // title / label / area / 알 수 없는 타입
  const extra = STATIC_STYLE[t] || 'border:1px solid #c6c4bf;background:#fff;justify-content:center';
  // 실제 화면의 섹션 제목("▸ 주소" 처럼)을 흉내낸다 — title/area 만 화살표 프리픽스를 단다.
  // 문구가 비어 있으면 "label"·"title" 같은 타입 슬러그가 그대로 찍히던 버그가 있었다 —
  // 화살표 프리픽스도 문구가 있을 때만 붙인다(빈 것에 "▸ "만 남는 걸 피함).
  const prefix = t === 'title' || t === 'area' ? '▸ ' : '';
  const text = shape.label ? prefix + shape.label : '';
  return `<div${elId(shape)}${annoAttrs(shape)} style="position:absolute;box-sizing:border-box;left:${shape.x}px;top:${shape.y}px;` +
    `width:${shape.w}px;height:${shape.h}px;display:flex;align-items:center;font-size:11px;color:#333;` +
    `padding:4px 6px;overflow:hidden;white-space:nowrap;${extra}">${esc(text)}</div>`;
}

/** 버튼·주석(hs-note) 클릭 시 설명 문구·탭 전환·연결 화살표(여러 개 가능)를 처리하는 공통 스크립트.
 * data-note/data-link-targets 는 이미 HTML-escape 되어 있어 textContent/id 조회로만 다룬다. */
const INTERACTION_SCRIPT = `
<script>
function hsEdgePoint(r, cx, cy, tx, ty) {
  var dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  var hw = r.width / 2, hh = r.height / 2;
  var scale = Math.min(dx ? Math.abs(hw / dx) : Infinity, dy ? Math.abs(hh / dy) : Infinity);
  return { x: cx + dx * scale, y: cy + dy * scale };
}
function hsClearArrows() {
  var svg = document.getElementById('hsLinkLayer');
  if (!svg) return;
  [].forEach.call(svg.querySelectorAll('line'), function (l) { l.remove(); });
}
function hsDrawArrow(svg, cvR, srcEl, tgtEl) {
  var sr = srcEl.getBoundingClientRect();
  var tr = tgtEl.getBoundingClientRect();
  var sc = { x: sr.left - cvR.left + sr.width / 2, y: sr.top - cvR.top + sr.height / 2 };
  var tc = { x: tr.left - cvR.left + tr.width / 2, y: tr.top - cvR.top + tr.height / 2 };
  var p1 = hsEdgePoint(sr, sc.x, sc.y, tc.x, tc.y);
  var p2 = hsEdgePoint(tr, tc.x, tc.y, sc.x, sc.y);
  var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
  line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
  line.setAttribute('stroke', '#F5821F'); line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '5 4'); line.setAttribute('marker-end', 'url(#hsLinkArrow)');
  svg.appendChild(line);
}
function hsDrawArrows(srcEl, targetEls) {
  var svg = document.getElementById('hsLinkLayer');
  var cv = document.querySelector('.d-cv');
  hsClearArrows();
  if (!svg || !cv || !targetEls.length) return;
  var cvR = cv.getBoundingClientRect();
  targetEls.forEach(function (t) { hsDrawArrow(svg, cvR, srcEl, t); });
}
function hsHideBubble() {
  var bubble = document.getElementById('hsBubble');
  if (bubble) bubble.style.opacity = '0';
}
/** 말풍선을 마우스로 직접 끌어서 옮길 수 있게 한다 — 자동 배치가 요소를 가리거나 자리가 마땅치
 * 않을 때 직접 빼둘 수 있도록. 좌우로 옮기면 꼬리도 계속 원래 요소 쪽을 가리키게 다시 계산하고
 * (위/아래 방향은 처음 켤 때 정해진 대로 유지), 옮긴 사실은 data-moved 로 표시해 둔다 —
 * result-modal.js 가 이미지 캡처 시 이 위치를 그대로 복사해 재현한다. */
function hsInitBubbleDrag(bubble) {
  var drag = null;
  bubble.addEventListener('mousedown', function (e) {
    var cv = document.querySelector('.d-cv');
    if (!cv) return;
    var cvR = cv.getBoundingClientRect();
    var bR = bubble.getBoundingClientRect();
    drag = {
      cvR: cvR, w: bR.width, h: bR.height,
      offX: e.clientX - bR.left, offY: e.clientY - bR.top,
    };
    bubble.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', function (e) {
    if (!drag) return;
    var left = Math.max(0, Math.min(drag.cvR.width - drag.w, e.clientX - drag.cvR.left - drag.offX));
    var top = Math.max(0, Math.min(drag.cvR.height - drag.h, e.clientY - drag.cvR.top - drag.offY));
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
    bubble.dataset.moved = '1';
    if (hsActiveNoted) {
      var tr = hsActiveNoted.getBoundingClientRect();
      var targetCenter = tr.left - drag.cvR.left + tr.width / 2;
      bubble.style.setProperty('--tail-x', Math.max(12, Math.min(drag.w - 12, targetCenter - left)) + 'px');
    }
  });
  document.addEventListener('mouseup', function () {
    if (!drag) return;
    drag = null;
    bubble.style.cursor = 'grab';
  });
}
/** noted 요소(.hs-btn 또는 .hs-note)를 담은 hs-{shape.id} wrapper 의 id.
 * 버튼은 wrapper(바깥 div)에 id 가 있고 정작 클릭 대상인 .hs-btn 자신에는 없어서,
 * "지금 켜져 있는 요소가 무엇인지"를 안정적으로 식별하려면 이 id 를 써야 한다
 * (result-modal.js 가 이미지 캡처 시 같은 요소를 다시 찾아 켜는 데 쓴다). */
function hsStableId(el) {
  var w = el.closest('[id]');
  return w ? w.id : '';
}
/** hsStableId 로 저장해 둔 id → 클릭 가능한 노드(.hs-btn 또는 .hs-note)를 되찾는다. */
function hsFindNotedById(id) {
  var w = id && document.getElementById(id);
  if (!w) return null;
  return w.matches('.hs-btn,.hs-note') ? w : w.querySelector('.hs-btn,.hs-note');
}
// 현재 말풍선·화살표가 켜져 있는 요소(다시 클릭하면 끈다).
// hsActiveId 는 result-modal.js 가 이미지 캡처 시 이 상태를 그대로 재현하는 데 읽어간다
// (이 iframe 은 캡처용으로 새로 렌더될 때마다 새 문서라 hsActiveNoted 참조 자체는 못 넘기고,
// 전역 var 로 선언돼 window 프로퍼티가 되는 id 문자열만 넘긴다).
var hsActiveNoted = null;
var hsActiveId = null;
function hsActivate(noted) {
  hsActiveNoted = noted;
  hsActiveId = hsStableId(noted);

  var targetIds = (noted.dataset.linkTargets || '').split(/\\s+/).filter(Boolean);
  var targetEls = targetIds.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  hsDrawArrows(noted, targetEls);

  var msg = noted.dataset.note || '';
  if (!msg) { hsHideBubble(); return; }
  var cv = document.querySelector('.d-cv');
  if (!cv) return;
  var bubble = document.getElementById('hsBubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'hsBubble';
    // pointer-events 는 켜져 있다 — 말풍선을 직접 드래그로 옮길 수 있게 하기 위함(hsInitBubbleDrag).
    bubble.style.cssText = 'position:absolute;z-index:999;max-width:260px;padding:9px 13px;border-radius:10px;' +
      'background:#fff;color:#222;border:1.5px solid #F5821F;font-size:12.5px;line-height:1.45;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.16);cursor:grab;opacity:0;transition:opacity .15s';
    cv.appendChild(bubble);
    hsInitBubbleDrag(bubble);
  }
  // 말풍선은 뷰포트가 아니라 .d-cv(캔버스) 기준 좌표로 배치한다 — 캡처 대상이 .d-cv 하나뿐이라
  // 말풍선·화살표가 그 안에 같이 들어있어야 이미지 복사·저장에 함께 찍힌다.
  var cvR = cv.getBoundingClientRect();
  var r = noted.getBoundingClientRect();
  var localLeft = r.left - cvR.left;
  var localTop = r.top - cvR.top;
  // 텍스트를 먼저 넣어 실제 렌더 폭·높이를 잰 뒤(내용에 따라 260px 보다 좁을 수 있다),
  // 그 크기를 기준으로 꼬리·위치를 잡아야 캔버스 밖으로 벗어나지 않는다.
  bubble.textContent = msg;
  bubble.classList.remove('below');
  delete bubble.dataset.moved; // 새로 켜는 요소이므로 이전에 사용자가 직접 옮겨둔 위치는 잊는다
  var bw = bubble.getBoundingClientRect().width || 260;
  var bh = bubble.getBoundingClientRect().height || 38;
  var GAP = 10; // 요소와 꼬리 끝 사이 여백
  var TAIL = 9; // 꼬리 삼각형 높이
  // 요소가 캔버스 위쪽 끝 가까이 있어 위에 놓을 자리가 없으면 아래로 뒤집는다
  // (버튼이 화면 맨 위 줄에 있는 경우 등 — 말풍선이 캔버스 밖으로 잘리거나 겹쳐 안 보이던 문제).
  var fitsAbove = localTop - (bh + GAP + TAIL) >= 4;
  var top;
  if (fitsAbove) {
    top = localTop - bh - GAP - TAIL;
  } else {
    bubble.classList.add('below');
    top = localTop + r.height + GAP + TAIL;
  }
  top = Math.max(4, Math.min(cvR.height - bh - 4, top));
  var bubbleLeft = Math.max(6, Math.min(cvR.width - 6 - bw, localLeft));
  bubble.style.left = bubbleLeft + 'px';
  bubble.style.top = top + 'px';
  var tailX = localLeft + r.width / 2 - bubbleLeft;
  bubble.style.setProperty('--tail-x', Math.max(12, Math.min(bw - 12, tailX)) + 'px');
  bubble.style.opacity = '1';
}
document.addEventListener('click', function (e) {
  // 말풍선을 드래그해서 옮긴 뒤에도(또는 그냥 말풍선 위를 클릭해도) mouseup 에서 click 이 한 번
  // 더 발생하는데, 이걸 "빈 곳 클릭"으로 처리하면 옮기자마자 꺼져버린다 — 무시한다.
  if (e.target.closest('#hsBubble')) return;
  var toggle = e.target.closest('#hsToggle');
  if (toggle) {
    var on = document.body.classList.toggle('hs-hl');
    toggle.classList.toggle('on', on);
    toggle.textContent = on ? '✕ 설명 표시 끄기' : '📍 설명 붙은 요소 보기';
    return;
  }
  var tab = e.target.closest('.hs-tab');
  if (tab) {
    var bar = tab.parentElement;
    [].forEach.call(bar.querySelectorAll('.hs-tab'), function (b) {
      b.classList.remove('on'); b.style.background = '#eef1f5'; b.style.color = '#5a6472';
    });
    tab.classList.add('on'); tab.style.background = '#0F3B7C'; tab.style.color = '#fff';
    return;
  }
  var noted = e.target.closest('.hs-btn, .hs-note');
  if (!noted || noted === hsActiveNoted) {
    // 빈 곳을 클릭했거나, 이미 켜져 있는 요소를 다시 클릭 — 끈다.
    hsClearArrows();
    hsHideBubble();
    hsActiveNoted = null;
    hsActiveId = null;
    return;
  }
  hsActivate(noted);
});
</script>`;

function buildPreviewHtml(title, payload) {
  const { w = 960, h = 600 } = payload.canvas || {};
  const els = readingOrder(payload.shapes)
    .map((s, i) => shapeToHtml(s, i + 1))
    .join('');
  // 변경화면 캡처 배경(payload.background)이 있으면 컴포넌트 뒤에 깔아, 실제 화면과 겹쳐 비교할 수 있게 한다.
  const bgStyle = payload.background
    ? ` style="background-image:url(&quot;${esc(payload.background)}&quot;);background-size:100% 100%"`
    : '';
  // 설명·연결이 하나라도 있어야 "설명 붙은 요소 보기" 토글을 보여준다(없으면 눌러도 아무 의미 없음).
  const hasAnno = (payload.shapes || []).some(
    (s) => (s.desc && String(s.desc).trim()) || (Array.isArray(s.linksTo) && s.linksTo.length),
  );
  const toggleHtml = hasAnno ? `<button type="button" id="hsToggle" class="hs-toggle">📍 설명 붙은 요소 보기</button>` : '';
  return (
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>body{margin:0;font-family:'맑은 고딕','Malgun Gothic',sans-serif;background:#f5f4f1}` +
    `.d-note{font-size:11px;color:#8a8a8a;text-align:center;padding:7px}` +
    // 토글 버튼이 안내 줄 오른쪽 끝에 들어가므로(캔버스를 가리지 않게) 안내 문구가 그 밑으로 안 들어가게 비운다.
    `.d-note.tg{padding-right:168px}` +
    `.d-cv{position:relative;width:${w}px;height:${h}px;background:#fff;margin:0 auto 16px;` +
    `border:1px solid #ddd;box-shadow:0 1px 4px rgba(0,0,0,.08)}` +
    `.hs-note{cursor:pointer}` +
    `#hsLinkLayer{position:absolute;top:0;left:0;pointer-events:none;overflow:visible}` +
    // "설명 붙은 요소 보기"를 켜면 desc·연결이 달린 요소(버튼 포함)에 빨간 테두리로 표시한다.
    `.hs-toggle{position:fixed;right:8px;top:3px;z-index:998;padding:3px 11px;border-radius:999px;` +
    `border:1px solid #d8dee6;background:#fff;color:#333;font-size:11.5px;font-weight:700;cursor:pointer;` +
    `box-shadow:0 1px 5px rgba(0,0,0,.14);font-family:inherit}` +
    `.hs-toggle.on{background:#E5484D;border-color:#E5484D;color:#fff}` +
    `.hs-hl .hs-note,.hs-hl .hs-btn[data-note]:not([data-note=""]),.hs-hl .hs-btn[data-link-targets]{` +
    `outline:2px solid #E5484D;outline-offset:2px;box-shadow:0 0 0 5px rgba(229,72,77,.18)}` +
    // 말풍선 꼬리 — 클릭한 요소 쪽을 가리키도록 수평 위치는 JS 에서 --tail-x 로 맞춘다.
    // 테두리색 삼각형(::before, 크게) 위에 배경색 삼각형(::after, 작게)을 겹쳐 테두리가 있는
    // 꼬리처럼 보이게 한다 — 두 삼각형 모두 같은 --tail-x 를 기준으로 좌우 대칭이라 폭이 달라도
    // 중심이 어긋나지 않는다. 기본은 말풍선이 요소 위에 떠서 꼬리가 아래를 가리키는 형태이고,
    // 요소가 캔버스 위쪽 끝에 가까워 위에 놓을 자리가 없으면 .below 를 붙여 요소 아래로 뒤집는다
    // (꼬리도 위를 가리키게 반전).
    `#hsBubble::before{content:"";position:absolute;left:var(--tail-x,20px);bottom:-9px;width:0;height:0;` +
    `border-width:9px 8px 0 8px;border-style:solid;border-color:#F5821F transparent transparent transparent}` +
    `#hsBubble::after{content:"";position:absolute;left:var(--tail-x,20px);bottom:-6.5px;width:0;height:0;` +
    `border-width:7px 6.5px 0 6.5px;border-style:solid;border-color:#fff transparent transparent transparent}` +
    `#hsBubble.below::before{bottom:auto;top:-9px;border-width:0 8px 9px 8px;` +
    `border-color:transparent transparent #F5821F transparent}` +
    `#hsBubble.below::after{bottom:auto;top:-6.5px;border-width:0 6.5px 7px 6.5px;` +
    `border-color:transparent transparent #fff transparent}` +
    `</style></head>` +
    `<body>${toggleHtml}<div class="d-note${hasAnno ? ' tg' : ''}">규칙 기반 변환 미리보기 · 버튼 클릭·선택·체크 상호작용 가능` +
    ` · 설명·연결 있는 요소는 클릭하면 표시, 다시 클릭하면 숨김 · 말풍선은 드래그로 옮길 수 있음</div>` +
    `<div class="d-cv"${bgStyle}>${els}` +
    `<svg id="hsLinkLayer" width="${w}" height="${h}"><defs>` +
    `<marker id="hsLinkArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0L10,5L0,10z" fill="#F5821F"></path></marker></defs></svg>` +
    `</div>${INTERACTION_SCRIPT}</body></html>`
  );
}

const indent = (frag, pad) => frag.split('\n').map((l) => pad + l).join('\n');

/** 트리 노드 → XML (area 는 자식을 중첩) */
function emitNode(shape, numOf, childrenOf, depth) {
  const pad = '  '.repeat(depth);
  const n = numOf.get(shape);
  if (shape.type === 'area') {
    const m = MAPPING.area || { tag: 'w2:group', attrs: { id: 'grp{n}' } };
    const attrs = attrString(m.attrs, n, shape.label || '');
    const kids = readingOrder(childrenOf.get(shape) || []);
    if (!kids.length) return `${pad}<${m.tag} ${attrs}/>`;
    const inner = kids.map((k) => emitNode(k, numOf, childrenOf, depth + 1)).join('\n');
    return `${pad}<${m.tag} ${attrs}>\n${inner}\n${pad}</${m.tag}>`;
  }
  return indent(shapeToXml(shape, n), pad);
}

/**
 * @param {object} payload 화면정의 payload (screen-draft.schema.json)
 * @returns {{ websquareXml: string, previewHtml: string, propagatedRequired: number }}
 */
export function compileDeterministic(payload) {
  const title = payload.screenName || payload.baseScreen?.name || '무제 화면';
  // 원본을 건드리지 않도록 복제 후 처리
  const shapes = readingOrder((payload.shapes || []).map((s) => ({ ...s })));
  const propagated = propagateRequired(shapes);

  // 읽기 순서대로 id 번호 부여(중첩과 무관하게 안정적)
  const numOf = new Map(shapes.map((s, i) => [s, i + 1]));
  const { roots, childrenOf } = buildContainmentTree(shapes);
  const body = readingOrder(roots)
    .map((s) => emitNode(s, numOf, childrenOf, 1))
    .join('\n');

  const websquareXml =
    `<!-- ${commentText(title)} · 규칙 기반 변환 · 요소 ${shapes.length}개` +
    (propagated ? ` · 필수 전파 ${propagated}건` : '') +
    ` -->\n<w2:group id="screenRoot">\n${body}\n</w2:group>`;

  return {
    websquareXml,
    previewHtml: buildPreviewHtml(title, { ...payload, shapes }),
    propagatedRequired: propagated,
  };
}

/**
 * 완전한 생성결과(generation-result.schema.json) 객체를 만든다.
 * @param {object} payload
 */
export function deterministicResult(payload) {
  const { websquareXml, previewHtml, propagatedRequired } = compileDeterministic(payload || {});
  return {
    status: 'ok',
    preview: { html: previewHtml },
    code: {
      websquareXml,
      files: [{ path: 'screen.xml', content: websquareXml }],
    },
    report: {
      converter: 'deterministic',
      elapsedMs: 0,
      propagatedRequired,
      unresolved: [],
      note: '외부 LLM 미사용 — 규칙 기반 변환 결과입니다.',
    },
  };
}
