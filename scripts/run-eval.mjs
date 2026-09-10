// 평가 케이스 배치 실행 — docs/03_평가결과.md §1 케이스를 결정론적 변환기로 돌린다.
//
//   node scripts/run-eval.mjs
//
// 규칙 기반 변환기(deterministic.js)로 케이스를 일괄 변환한다.
// 결과: runs/<timestamp>/<CASE>/{payload.json, screen.xml, preview.html, report.json}
//       runs/<timestamp>/summary.json

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from '../src/shared/paths.js';
import { validateScreenDraft, validateGenerationResult } from '../src/shared/validate.js';
import { deterministicResult } from '../src/pipeline/deterministic.js';
import { NAME } from '../src/web/js/constants.js';

// templates.js 의 build() 와 동일 규칙으로 preset 정의를 payload shape 로 변환
function shapesFrom(defs) {
  return defs.map(([type, x, y, w, h, label, items, required], i) => {
    const s = { id: `s${i + 1}`, type, x, y, w, h };
    const lb = label ?? NAME[type];
    if (lb) s.label = lb;
    if (items) s.items = items;
    if (required) s.required = true;
    return s;
  });
}

// ── preset 정의 (src/web/js/templates.js 와 동기화) ──────────────────
const LIST = [
  ['area', 30, 30, 900, 100, '조회 영역'],
  ['label', 50, 52, 80, 24, '계약번호', null, 1],
  ['input', 140, 50, 180, 28, ''],
  ['label', 360, 52, 80, 24, '계약자'],
  ['input', 450, 50, 180, 28, ''],
  ['label', 50, 92, 80, 24, '체결일'],
  ['date', 140, 90, 140, 28, ''],
  ['date', 300, 90, 140, 28, ''],
  ['button', 740, 66, 80, 28, '조회'],
  ['button', 830, 66, 80, 28, '초기화'],
  ['title', 30, 150, 200, 26, '조회 결과'],
  ['label', 800, 152, 130, 24, '총 0 건'],
  ['list', 30, 188, 900, 372, '목록', '순번,계약번호,계약자,체결일,상태'],
];
const DETAIL = [
  ['area', 30, 30, 900, 66, '조회 영역'],
  ['label', 50, 52, 80, 24, '계약번호', null, 1],
  ['input', 140, 50, 180, 28, ''],
  ['button', 830, 50, 80, 28, '조회'],
  ['title', 30, 112, 200, 26, '목록'],
  ['list', 30, 148, 900, 150, '', '선택,계약번호,계약자,상품명,상태'],
  ['title', 30, 320, 200, 26, '상세 정보'],
  ['area', 30, 356, 900, 170, '상세 영역'],
  ['label', 52, 384, 90, 24, '계약번호'],
  ['input', 150, 382, 200, 28, ''],
  ['label', 400, 384, 90, 24, '계약자'],
  ['input', 500, 382, 200, 28, ''],
  ['label', 52, 428, 90, 24, '상품명'],
  ['input', 150, 426, 200, 28, ''],
  ['label', 400, 428, 90, 24, '상태'],
  ['date', 500, 426, 160, 28, ''],
  ['button', 740, 540, 90, 30, '수정'],
  ['button', 840, 540, 90, 30, '삭제'],
];
const FORM = [
  ['title', 30, 30, 200, 26, '기본 정보'],
  ['area', 30, 66, 900, 150, '입력 영역'],
  ['label', 52, 92, 90, 24, '성명', null, 1],
  ['input', 150, 90, 200, 28, ''],
  ['label', 400, 92, 90, 24, '구분', null, 1],
  ['select', 500, 90, 180, 28, '', '개인,법인'],
  ['label', 52, 136, 90, 24, '주민번호', null, 1],
  ['input', 150, 134, 200, 28, ''],
  ['label', 400, 136, 90, 24, '등록일'],
  ['date', 500, 134, 160, 28, ''],
  ['title', 30, 240, 140, 26, '추가 정보'],
  ['area', 30, 276, 900, 120, '입력 영역'],
  ['label', 52, 302, 90, 24, '비고'],
  ['text', 150, 300, 750, 80, ''],
  ['button', 740, 430, 100, 32, '저장'],
  ['button', 850, 430, 80, 32, '취소'],
];
const POPUP = [
  ['title', 20, 16, 240, 24, '고객 검색'],
  ['area', 20, 48, 520, 56, '검색 영역'],
  ['label', 36, 66, 60, 22, '검색어'],
  ['input', 104, 64, 250, 26, ''],
  ['button', 458, 64, 64, 26, '검색'],
  ['list', 20, 116, 520, 236, '검색 결과', '선택,코드,명칭,비고'],
  ['button', 358, 366, 84, 28, '선택'],
  ['button', 454, 366, 66, 28, '닫기'],
];
const MAIN = [
  ['title', 30, 24, 300, 30, '영업 메인'],
  ['area', 30, 70, 400, 170, '요약 1'],
  ['label', 56, 108, 130, 24, '오늘 상담'],
  ['label', 250, 108, 140, 24, '0'],
  ['label', 56, 156, 130, 24, '대기'],
  ['label', 250, 156, 140, 24, '0'],
  ['area', 450, 70, 400, 170, '요약 2'],
  ['label', 476, 108, 130, 24, '처리율'],
  ['label', 670, 108, 140, 24, '0'],
  ['label', 476, 156, 130, 24, '평균시간'],
  ['label', 670, 156, 140, 24, '0'],
  ['area', 870, 70, 380, 170, '공지사항'],
  ['text', 888, 106, 344, 118, ''],
  ['title', 30, 264, 180, 28, '바로가기'],
  ['button', 30, 302, 160, 38, '메뉴 1'],
  ['button', 210, 302, 160, 38, '메뉴 2'],
  ['button', 390, 302, 160, 38, '메뉴 3'],
  ['button', 570, 302, 160, 38, '메뉴 4'],
  ['title', 30, 366, 220, 28, '최근 처리 내역'],
  ['list', 30, 404, 1220, 286, '', '일시,구분,내용,상태'],
];
const BLANK = [
  ['area', 40, 30, 880, 300, '입력 영역'],
  ['label', 70, 70, 90, 24, '고객명', null, 1],
  ['input', 180, 68, 220, 28, ''],
  ['label', 70, 120, 90, 24, '연락처'],
  ['input', 180, 118, 220, 28, ''],
  ['label', 70, 170, 90, 24, '메모'],
  ['input', 180, 168, 500, 28, ''],
  ['button', 700, 360, 100, 34, '저장'],
  ['button', 810, 360, 90, 34, '취소'],
];

const B = (w, h) => ({ w, h });

// 변경 케이스: 기존 화면 shapes 를 그대로 가져와 일부 추가
function editShapes(file, id, extra) {
  const scr = readJson(`fixtures/screens/${file}.json`).screens.find((s) => s.id === id);
  const shapes = JSON.parse(JSON.stringify(scr.shapes));
  return { scr, shapes: shapes.concat(extra) };
}

const eq = editShapes('portal', 'SCR-P-LIST-01', [
  { id: 's12', type: 'label', x: 620, y: 54, w: 70, h: 24, label: '담당자' },
  { id: 's13', type: 'input', x: 700, y: 52, w: 150, h: 28 },
]);
// 결과 컬럼에 담당자 추가
eq.shapes = eq.shapes.map((s) =>
  s.type === 'list' ? { ...s, items: `${s.items},담당자` } : s,
);

const em = editShapes('hicall', 'SCR-C-MAIN-01', [
  { id: 's16', type: 'label', x: 476, y: 156, w: 130, h: 24, label: '누적콜' },
  { id: 's17', type: 'label', x: 670, y: 156, w: 140, h: 24, label: '0' },
]);

// ── 케이스 정의 ─────────────────────────────────────────────────────
const CASES = [
  { id: 'N-LIST', payload: { systemId: 'salesportal', systemName: '영업포탈', mode: 'new', template: 'list', screenName: '계약 조회', note: '조회조건은 최소 1개 이상 입력 시 조회 버튼 활성화', canvas: B(960, 600), shapes: shapesFrom(LIST) } },
  { id: 'N-DETAIL', payload: { systemId: 'salesportal', systemName: '영업포탈', mode: 'new', template: 'detail', screenName: '계약 상세', note: '상단 목록에서 행 선택 시 하단 상세가 채워짐', canvas: B(960, 600), shapes: shapesFrom(DETAIL) } },
  { id: 'N-FORM', payload: { systemId: 'salesportal', systemName: '영업포탈', mode: 'new', template: 'form', screenName: '계약자 등록', note: '주민번호는 필수, 등록일은 오늘로 기본값', canvas: B(960, 600), shapes: shapesFrom(FORM) } },
  { id: 'N-POPUP', payload: { systemId: 'salesportal', systemName: '영업포탈', mode: 'new', template: 'popup', screenName: '고객 검색 팝업', note: '선택 버튼은 목록에서 1건 선택했을 때만 활성화', canvas: B(560, 420), shapes: shapesFrom(POPUP) } },
  { id: 'N-MAIN', payload: { systemId: 'salesportal', systemName: '영업포탈', mode: 'new', template: 'main', screenName: '영업 메인', note: '요약 카드 값은 로그인 사용자 기준', canvas: B(1280, 720), shapes: shapesFrom(MAIN) } },
  { id: 'N-BLANK', payload: { systemId: 'salesportal', systemName: '영업포탈', mode: 'new', template: 'blank', screenName: '자유 배치 화면', note: '', canvas: B(960, 600), shapes: shapesFrom(BLANK) } },
  { id: 'E-QUERY', payload: { systemId: 'portal', systemName: '하이포탈', mode: 'edit', screenName: eq.scr.name, baseScreen: { id: eq.scr.id, name: eq.scr.name }, note: '조회 영역에 담당자 1쌍 추가, 결과 컬럼에 담당자 추가', canvas: eq.scr.canvas, shapes: eq.shapes } },
  { id: 'E-MAIN', payload: { systemId: 'hicall', systemName: '하이콜', mode: 'edit', screenName: em.scr.name, baseScreen: { id: em.scr.id, name: em.scr.name }, note: '"오늘 처리" 영역에 누적콜 지표 1개 추가', canvas: em.scr.canvas, shapes: em.shapes } },
];

// ── 실행 ────────────────────────────────────────────────────────────
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outRoot = path.join(ROOT, 'runs', ts);
const summary = { ts, mode: 'deterministic', cases: [] };

function runCase(id, payload) {
  const dir = path.join(outRoot, id);
  mkdirSync(dir, { recursive: true });

  const payloadErrors = validateScreenDraft(payload);
  const result = deterministicResult(payload);
  const resultErrors = validateGenerationResult(result);

  writeFileSync(path.join(dir, 'payload.json'), JSON.stringify(payload, null, 2));
  writeFileSync(path.join(dir, 'screen.xml'), result.code.websquareXml);
  writeFileSync(path.join(dir, 'preview.html'), result.preview.html);
  writeFileSync(path.join(dir, 'report.json'), JSON.stringify(result.report, null, 2));

  // 간단 지표
  const xml = result.code.websquareXml;
  const tags = [...xml.matchAll(/<(w2:[\w]+)/g)].map((m) => m[1]);
  const tagCounts = tags.reduce((a, t) => ((a[t] = (a[t] || 0) + 1), a), {});
  const unmapped = [...xml.matchAll(/<!-- (\w+) \(매핑 정의 없음\)/g)].map((m) => m[1]);
  const nonSelfOpen = [...xml.matchAll(/<w2:\w+(?:\s[^>]*?)?>/g)].filter((m) => !m[0].endsWith('/>')).length;
  const closes = [...xml.matchAll(/<\/w2:\w+>/g)].length;
  const wellFormed = nonSelfOpen === closes;

  const row = {
    id,
    payloadOk: payloadErrors === null,
    payloadErrors,
    resultOk: resultErrors === null,
    resultErrors,
    shapeCount: payload.shapes.length,
    xmlTags: tagCounts,
    unmappedTypes: unmapped,
    wellFormedGroup: wellFormed,
    converter: result.report.converter,
  };
  summary.cases.push(row);
  return row;
}

for (const c of CASES) {
  const r = runCase(c.id, c.payload);
  const flag = r.payloadOk && r.resultOk && r.wellFormedGroup && !r.unmappedTypes.length ? 'OK ' : 'CHK';
  console.log(
    `[${flag}] ${r.id.padEnd(9)} shapes=${String(r.shapeCount).padStart(2)} ` +
      `tags=${Object.entries(r.xmlTags).map(([k, v]) => `${k.replace('w2:', '')}:${v}`).join(' ')}` +
      (r.unmappedTypes.length ? `  ⚠ 미매핑: ${r.unmappedTypes.join(',')}` : '') +
      (r.payloadOk ? '' : `  ⚠ payload: ${r.payloadErrors.join('; ')}`),
  );
}

// CONSIST — N-LIST 동일 입력 3회
const consistDir = path.join(outRoot, 'CONSIST');
mkdirSync(consistDir, { recursive: true });
const nlist = CASES[0].payload;
const runs3 = [1, 2, 3].map((n) => {
  const res = deterministicResult(nlist);
  writeFileSync(path.join(consistDir, `run${n}.xml`), res.code.websquareXml);
  return res.code.websquareXml;
});
const identical = runs3.every((x) => x === runs3[0]);
summary.consist = { identical, note: '결정론적 변환기이므로 동일 입력 → 100% 동일 출력' };
console.log(`\n[CONSIST] N-LIST 3회 동일: ${identical ? 'YES (byte-identical)' : 'NO'}`);

writeFileSync(path.join(outRoot, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\n→ ${path.relative(ROOT, outRoot)}/  (${CASES.length} cases + CONSIST)`);
