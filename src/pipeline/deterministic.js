// 규칙 기반 변환기 — 개발지시서 §4, §8 A-3
//
// 외부 LLM 미사용. payload → { websquareXml, previewHtml } 를 규칙으로 만든다.
// `/api/generate` 가 이 변환기를 전담 호출한다 (routes/generate.js).
//
// "추론"은 하지 않는다(자연어 규칙 해석·질문 생성 없음). 다만 배치에서 직접 읽히는
// 두 가지는 반영한다: ① 필수(＊) 라벨 → 인접 필드 전파  ② area 안의 요소 → 자식으로 중첩.

import { readJson } from '../shared/paths.js';

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

/** 러프 좌표를 읽기 순서(위→아래, 같은 줄이면 왼→오른쪽)로 정렬 */
export function readingOrder(shapes) {
  return [...(shapes || [])].sort((a, b) =>
    Math.abs((a.y ?? 0) - (b.y ?? 0)) > 18 ? (a.y ?? 0) - (b.y ?? 0) : (a.x ?? 0) - (b.x ?? 0),
  );
}

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
  if (!m) return `<!-- ${esc(shape.type)} (매핑 정의 없음) -->`;
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
  pager: 'border:none;background:none;color:#9a9a9a;justify-content:flex-end',
};

// 필수 표시(＊)는 입력 폭을 갉아먹지 않도록 별도 flex 자식이 아니라 컨트롤 위에 얹는 절대배치
// 오버레이로 그린다 — 그래야 좁은 필드에서도 레이아웃이 안 깨진다. control() 이 필요한 만큼
// 왼쪽 패딩을 넓혀 글자와 겹치지 않게 한다.
const reqStar = (shape) => (shape.required
  ? '<span style="position:absolute;left:3px;top:50%;transform:translateY(-50%);' +
    'color:#c00000;font-weight:800;font-size:10px;line-height:1;pointer-events:none;z-index:1">＊</span>'
  : '');
const wrapAbs = (shape, inner, extra = '') =>
  `<div style="position:absolute;box-sizing:border-box;left:${shape.x}px;top:${shape.y}px;` +
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
    return wrapAbs(shape, `${reqStar(shape)}${inner}`, `overflow:auto;gap:8px${shape.required ? ';padding-left:11px' : ''}`);
  }
  if (t === 'check') {
    return wrapAbs(
      shape,
      `${reqStar(shape)}<label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#333;white-space:nowrap">` +
        `<input type="checkbox"> ${esc(shape.label || '선택 항목')}</label>`,
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
    return wrapAbs(
      shape,
      `<button type="button" class="hs-btn" data-note="${esc(shape.desc || '')}" style="${control({ required: false })};` +
        `${roleStyle};font-weight:700;cursor:pointer">${esc(shape.label || '버튼')}</button>`,
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

  // title / label / divider / area / pager / 알 수 없는 타입
  const extra = STATIC_STYLE[t] || 'border:1px solid #c6c4bf;background:#fff;justify-content:center';
  // 실제 화면의 섹션 제목("▸ 주소" 처럼)을 흉내낸다 — title/area 만 화살표 프리픽스를 단다.
  const prefix = t === 'title' || t === 'area' ? '▸ ' : '';
  return `<div style="position:absolute;box-sizing:border-box;left:${shape.x}px;top:${shape.y}px;` +
    `width:${shape.w}px;height:${shape.h}px;display:flex;align-items:center;font-size:11px;color:#333;` +
    `padding:4px 6px;overflow:hidden;white-space:nowrap;${extra}">${esc(prefix + (shape.label || t))}</div>`;
}

/** 버튼 클릭(설명 문구)·탭 전환을 처리하는 공통 스크립트. data-note 는 이미 HTML-escape 되어 있어 textContent 로만 다룬다. */
const INTERACTION_SCRIPT = `
<script>
document.addEventListener('click', function (e) {
  var tab = e.target.closest('.hs-tab');
  if (tab) {
    var bar = tab.parentElement;
    [].forEach.call(bar.querySelectorAll('.hs-tab'), function (b) {
      b.classList.remove('on'); b.style.background = '#eef1f5'; b.style.color = '#5a6472';
    });
    tab.classList.add('on'); tab.style.background = '#0F3B7C'; tab.style.color = '#fff';
    return;
  }
  var btn = e.target.closest('.hs-btn');
  if (btn) {
    var msg = btn.dataset.note || '실제 동작은 없는 미리보기 버튼입니다.';
    var bubble = document.getElementById('hsBubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'hsBubble';
      bubble.style.cssText = 'position:fixed;z-index:999;max-width:260px;padding:8px 12px;border-radius:8px;' +
        'background:#141A22;color:#fff;font-size:12px;line-height:1.4;box-shadow:0 6px 20px rgba(0,0,0,.28);' +
        'pointer-events:none;opacity:0;transition:opacity .15s';
      document.body.appendChild(bubble);
    }
    var r = btn.getBoundingClientRect();
    bubble.textContent = msg;
    bubble.style.left = Math.max(6, Math.min(window.innerWidth - 268, r.left)) + 'px';
    bubble.style.top = Math.max(6, r.top - 44) + 'px';
    bubble.style.opacity = '1';
    clearTimeout(bubble._t);
    bubble._t = setTimeout(function () { bubble.style.opacity = '0'; }, 2400);
  }
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
  return (
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>body{margin:0;font-family:'맑은 고딕','Malgun Gothic',sans-serif;background:#f5f4f1}` +
    `.d-note{font-size:11px;color:#8a8a8a;text-align:center;padding:7px}` +
    `.d-cv{position:relative;width:${w}px;height:${h}px;background:#fff;margin:0 auto 16px;` +
    `border:1px solid #ddd;box-shadow:0 1px 4px rgba(0,0,0,.08)}</style></head>` +
    `<body><div class="d-note">규칙 기반 변환 미리보기 · 버튼 클릭·선택·체크 상호작용 가능</div>` +
    `<div class="d-cv"${bgStyle}>${els}</div>${INTERACTION_SCRIPT}</body></html>`
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
    `<!-- ${esc(title)} · 규칙 기반 변환 · 요소 ${shapes.length}개` +
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
