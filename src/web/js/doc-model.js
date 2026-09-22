// 프로젝트 문서 모델 — 한 프로젝트에 화면(페이지) 여러 개. DOM 없는 순수 로직(Node 테스트 가능).
//
// v2 (다중 화면):
//   { app:'hds', version:2, projectName, systemId, systemName, activePage,
//     pages: [{ id, screenName, mode, template, baseScreenId, baseBoard, canvas, shapes, background? }] }
// v1 (예전 저장본·내보낸 파일): 화면 하나의 필드가 문서 최상위에 있다 — 읽을 때 1페이지짜리 v2 로 본다.
// 시스템은 프로젝트 단위(한 프로젝트 = 한 시스템의 화면 묶음), 나머지는 화면마다 다르다.

export const DOC_VERSION = 2;
export const MAX_PAGES = 50;
const DEFAULT_CANVAS = { w: 960, h: 600 };

export const newPageId = () => 'pg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const validCanvas = (c) => (c && Number(c.w) > 0 && Number(c.h) > 0 ? { w: Number(c.w), h: Number(c.h) } : { ...DEFAULT_CANVAS });
const isImageData = (s) => typeof s === 'string' && s.startsWith('data:image/');

/** 페이지 하나를 정리한다(빠진 필드 채우기, 이상한 값 걸러내기) */
export function normalizePage(p = {}) {
  const canvas = validCanvas(p.canvas);
  const page = {
    id: typeof p.id === 'string' && p.id ? p.id : newPageId(),
    screenName: typeof p.screenName === 'string' ? p.screenName : '새 화면',
    mode: p.mode === 'edit' ? 'edit' : 'new',
    template: typeof p.template === 'string' && p.template ? p.template : 'blank',
    baseScreenId: p.mode === 'edit' && p.baseScreenId ? String(p.baseScreenId) : null,
    baseBoard: validCanvas(p.baseBoard || p.canvas),
    canvas,
    shapes: Array.isArray(p.shapes) ? p.shapes : [],
  };
  if (isImageData(p.background)) page.background = p.background;
  return page;
}

/** 문서가 하이스케치 프로젝트로 읽을 수 있는 형식인지 (v1 또는 v2) */
export const isProjectDoc = (doc) =>
  !!doc && typeof doc === 'object' && (Array.isArray(doc.pages) ? doc.pages.length > 0 : Array.isArray(doc.shapes));

/** v1·v2 어느 쪽이든 페이지 배열로 */
export function docPages(doc) {
  if (!doc || typeof doc !== 'object') return [normalizePage()];
  if (Array.isArray(doc.pages) && doc.pages.length) {
    const seen = new Set();
    return doc.pages.slice(0, MAX_PAGES).map((p) => {
      const page = normalizePage(p);
      if (seen.has(page.id)) page.id = newPageId(); // 사본 파일을 합치다 id 가 겹친 경우
      seen.add(page.id);
      return page;
    });
  }
  return [normalizePage({
    id: 'pg1',
    screenName: doc.screenName, mode: doc.mode, template: doc.template, baseScreenId: doc.baseScreenId,
    canvas: doc.canvas, shapes: doc.shapes, background: doc.background,
  })];
}

/** 열어 둘 페이지 번호(범위 밖이면 0) */
export function activeIndex(doc, pages = docPages(doc)) {
  const i = Number.isInteger(doc?.activePage) ? doc.activePage : 0;
  return i >= 0 && i < pages.length ? i : 0;
}

/** v2 문서를 만든다 */
export function makeDoc({ projectName = '', systemId = null, systemName = null, pages, activePage = 0 }) {
  const list = (pages && pages.length ? pages : [normalizePage()]).map(normalizePage);
  return {
    app: 'hds',
    version: DOC_VERSION,
    savedAt: new Date().toISOString(),
    projectName,
    systemId: systemId || null,
    systemName: systemName || null,
    activePage: Math.max(0, Math.min(list.length - 1, activePage | 0)),
    pages: list,
  };
}

/** 어떤 형식이든 v2 로 올린다(시스템·프로젝트 이름은 유지) */
export function upgradeDoc(doc) {
  const pages = docPages(doc);
  return makeDoc({
    projectName: doc?.projectName || '',
    systemId: doc?.systemId || null,
    systemName: doc?.systemName || null,
    pages,
    activePage: activeIndex(doc, pages),
  });
}

/** 홈 카드·목록 메타에 쓰는 요약. 썸네일은 첫 화면(캔바·미리캔버스의 표지 페이지와 같음) */
export function docSummary(doc) {
  const pages = docPages(doc);
  const first = pages[0];
  return {
    pages: pages.length,
    screenName: first.screenName,
    mode: first.mode,
    shapes: pages.reduce((n, p) => n + p.shapes.length, 0),
    hasBg: pages.some((p) => !!p.background),
    canvas: first.canvas,
    cover: first,
  };
}

/** 페이지 사본 — 새 id, 이름 뒤에 "사본" */
export function clonePage(page) {
  const p = normalizePage(JSON.parse(JSON.stringify(page)));
  p.id = newPageId();
  p.screenName = `${page.screenName || '화면'} 사본`.slice(0, 60);
  return p;
}

/** 배열에서 from 위치의 항목을 to 위치로 옮긴 새 배열 */
export function movePage(pages, from, to) {
  const arr = [...pages];
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const [it] = arr.splice(from, 1);
  arr.splice(to, 0, it);
  return arr;
}

/** 내용 비교용 서명 — 큰 이미지(data URL)는 길이·끝부분만 넣어 비교 비용을 줄인다 */
export function docSignature(doc) {
  const fp = (s) => (isImageData(s) && s.length > 256 ? `img:${s.length}:${s.slice(-48)}` : s);
  return JSON.stringify(doc, (k, v) => {
    if (k === 'savedAt') return undefined;
    if (k === 'background' || k === 'src') return fp(v);
    return v;
  });
}
