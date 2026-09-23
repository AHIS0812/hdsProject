// 항목정의서 — 화면에 놓인 요소를 화면설계서의 "항목 목록" 표로 바꾼다.
// 사내 화면설계서가 요구하는 항목(영역·항목명·유형·필수·선택지·설명·연결)을 캔버스 데이터에서 그대로 뽑는다.
// DOM 없는 순수 로직(Node 테스트 가능) — CSV 저장과 PPT 산출물이 같은 표를 쓴다.

import { readingOrder } from './reading-order.js';
import { NAME } from './constants.js';

/** 표에 넣지 않는 장식용 타입 — 구분선은 항목이 아니다 */
const SKIP = new Set(['divider']);
/** 묶음(area)은 항목이 아니라 "영역" 이름으로만 쓴다 */
const AREA = 'area';

export const COLUMNS = ['화면', 'No', '영역', '항목명', '유형', '필수', '선택 항목', '설명', '연결'];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const typeOf = (s) => s.type || s.t;
const itemsOf = (s) => text(s.items ?? s.cols);

/** 요소 중심이 이 영역 안에 있나 */
function inside(area, s) {
  const cx = num(s.x) + num(s.w) / 2;
  const cy = num(s.y) + num(s.h) / 2;
  return cx >= num(area.x) && cx <= num(area.x) + num(area.w)
    && cy >= num(area.y) && cy <= num(area.y) + num(area.h);
}

/** 요소를 담고 있는 가장 작은 묶음(area)의 이름 — 없으면 빈 문자열 */
function areaNameOf(shape, areas) {
  let best = null;
  for (const a of areas) {
    if (a === shape || !inside(a, shape)) continue;
    if (!best || num(a.w) * num(a.h) < num(best.w) * num(best.h)) best = a;
  }
  return best ? text(best.label) : '';
}

/** 화면에 보이는 이름 — 문구가 없으면 선택지 첫 항목, 그것도 없으면 유형 이름 */
function nameOf(shape) {
  const label = text(shape.label);
  if (label) return label;
  const items = itemsOf(shape);
  if (items) return items.split(',')[0].trim();
  return NAME[typeOf(shape)] || typeOf(shape);
}

/**
 * 화면 한 장의 항목 행 목록.
 * @param {{screenName?:string, shapes?:object[]}} page
 * @param {{ screenName?: string, startNo?: number }} [opts]
 */
export function pageRows(page, { screenName, startNo = 1 } = {}) {
  const shapes = Array.isArray(page?.shapes) ? page.shapes : [];
  const areas = shapes.filter((s) => typeOf(s) === AREA);
  const byId = new Map(shapes.filter((s) => s.id != null).map((s) => [String(s.id), s]));
  const scr = text(screenName ?? page?.screenName) || '화면';
  let no = startNo;
  return readingOrder(shapes.filter((s) => !SKIP.has(typeOf(s)) && typeOf(s) !== AREA)).map((s) => {
    const links = (Array.isArray(s.linksTo) ? s.linksTo : [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map(nameOf);
    return {
      화면: scr,
      No: no++,
      영역: areaNameOf(s, areas),
      항목명: nameOf(s),
      유형: NAME[typeOf(s)] || typeOf(s),
      필수: (s.required ?? s.req) ? '필수' : '',
      '선택 항목': itemsOf(s),
      설명: text(s.desc),
      연결: links.join(', '),
    };
  });
}

/**
 * 프로젝트 전체(화면 여러 장)의 항목정의서 행 목록. 번호는 화면마다 1번부터 다시 센다.
 * @param {{screenName?:string, shapes?:object[]}[]} pages
 */
export function buildItemSpec(pages) {
  return (Array.isArray(pages) ? pages : []).flatMap((pg) => pageRows(pg));
}

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 내부 따옴표는 두 번 쓴다 */
const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * 엑셀에서 바로 열리는 CSV 문자열. 맨 앞 BOM 은 엑셀이 한글을 깨뜨리지 않게 하기 위한 것이고,
 * 줄바꿈은 엑셀 호환을 위해 CRLF 를 쓴다.
 * @param {object[]} rows  buildItemSpec 결과
 * @param {{ columns?: string[], bom?: boolean }} [opts]
 */
export function toCsv(rows, { columns = COLUMNS, bom = true } = {}) {
  const lines = [columns.map(cell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(','));
  return (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n';
}
