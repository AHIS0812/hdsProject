// [담당 1 영역 · 담당 2 가 폴백용으로 선구현] 결정론적 변환기 — 개발지시서 §4.2, D-7, §8 A-3
//
// AI 없이 payload → { websquareXml, previewHtml } 를 만드는 기준 변환기.
// - AI 파이프라인 장애 / 오프라인 시 폴백으로 동작 (routes/generate.js)
// - AI 산출물 회귀 판단의 기준선
//
// "추론"은 하지 않는다(자연어 규칙 해석·질문 생성 없음). 다만 배치에서 직접 읽히는
// 두 가지는 반영한다: ① 필수(＊) 라벨 → 인접 필드 전파  ② area 안의 요소 → 자식으로 중첩.

import { readJson } from '../shared/paths.js';

const MAPPING = (readJson('catalog/websquare/mapping.json', { default: {} }).default) || {};

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
  return `<${m.tag} ${attrs}/>`;
}

const PREVIEW_STYLE = {
  title: 'border:none;background:none;font-weight:800;color:#0F3B7C;font-size:15px;justify-content:flex-start',
  label: 'border:none;background:none;font-weight:600;justify-content:flex-start',
  input: 'background:#fff;border:1px solid #b9b7b2;color:#9a9a9a;justify-content:flex-start',
  select: 'background:#fff;border:1px solid #b9b7b2;justify-content:space-between',
  date: 'background:#fff;border:1px solid #b9b7b2;color:#9a9a9a;justify-content:space-between',
  text: 'background:#fff;border:1px solid #b9b7b2;color:#9a9a9a;align-items:flex-start;padding-top:6px',
  button: 'background:#0F3B7C;border:1px solid #0F3B7C;color:#fff;font-weight:700',
  list: 'background:repeating-linear-gradient(#fff 0 22px,#f1f0ec 22px 44px);border:1px solid #c6c4bf;align-items:flex-start;justify-content:center',
  area: 'border:1px dashed #b9b7b2;background:#fafaf8;align-items:flex-start;justify-content:flex-start;color:#9a9a9a;font-size:11px',
  divider: 'border:none;background:none;border-top:2px solid #c6c4bf;border-radius:0',
  radio: 'border:none;background:none;justify-content:flex-start',
  check: 'border:none;background:none;justify-content:flex-start',
  image: 'border:1px dashed #b9b7b2;background:#fafaf8;color:#9a9a9a;font-size:11px',
  pager: 'border:none;background:none;color:#9a9a9a;justify-content:flex-end',
  file: 'background:#fff;border:1px solid #b9b7b2;color:#9a9a9a;justify-content:flex-start',
};

function shapeToHtml(shape) {
  const base =
    'position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;' +
    'font-size:12px;color:#333;border:1px solid #c6c4bf;border-radius:3px;background:#fff;padding:0 6px;overflow:hidden;white-space:nowrap';
  const extra = PREVIEW_STYLE[shape.type] || '';
  const text = (shape.required ? '＊ ' : '') + (shape.label || shape.type);
  return (
    `<div style="${base};${extra};` +
    `left:${shape.x}px;top:${shape.y}px;width:${shape.w}px;height:${shape.h}px">${esc(text)}</div>`
  );
}

function buildPreviewHtml(title, payload) {
  const { w = 960, h = 600 } = payload.canvas || {};
  const els = readingOrder(payload.shapes).map(shapeToHtml).join('');
  return (
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>body{margin:0;font-family:'맑은 고딕','Malgun Gothic',sans-serif;background:#f5f4f1}` +
    `.d-note{font-size:11px;color:#8a8a8a;text-align:center;padding:7px}` +
    `.d-cv{position:relative;width:${w}px;height:${h}px;background:#fff;margin:0 auto 16px;` +
    `border:1px solid #ddd;box-shadow:0 1px 4px rgba(0,0,0,.08)}</style></head>` +
    `<body><div class="d-note">결정론적 변환 미리보기 · AI 정리 없음 (배치 그대로)</div>` +
    `<div class="d-cv">${els}</div></body></html>`
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
    `<!-- ${esc(title)} · 결정론적 변환 (AI 미사용) · 요소 ${shapes.length}개` +
    (propagated ? ` · 필수 전파 ${propagated}건` : '') +
    ` -->\n<w2:group id="screenRoot">\n${body}\n</w2:group>`;

  return {
    websquareXml,
    previewHtml: buildPreviewHtml(title, { ...payload, shapes }),
    propagatedRequired: propagated,
  };
}

/**
 * 폴백용: 완전한 생성결과(generation-result.schema.json) 객체를 만든다.
 * @param {object} payload
 * @param {string} [reason] 폴백 사유 (파이프라인 오류 메시지)
 */
export function deterministicResult(payload, reason) {
  const { websquareXml, previewHtml } = compileDeterministic(payload || {});
  return {
    status: 'ok',
    preview: { html: previewHtml },
    code: {
      websquareXml,
      files: [{ path: 'screen.xml', content: websquareXml }],
    },
    report: {
      retries: 0,
      elapsedMs: 0,
      fallbacksApplied: ['deterministic'],
      unresolved: [],
      usedDeterministicFallback: true,
      note: 'AI 파이프라인을 사용하지 못해 결정론적 변환기로 생성했습니다.',
      ...(reason ? { fallbackReason: reason } : {}),
    },
  };
}
