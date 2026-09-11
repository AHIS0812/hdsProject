// 캔버스 팔레트 요소 정의 (예시 프로토타입 계승 + 확장)

export const COMPS = [
  { t: 'title',       n: '제목',    g: '<div class="g n">▮</div>' },
  { t: 'label',       n: '글자',    g: '<div class="g n" style="color:#3C4655;font-size:13px">가</div>' },
  { t: 'input',       n: '입력칸',  g: '<div class="g u"></div>' },
  { t: 'select',      n: '선택',    g: '<div class="g">▾</div>' },
  { t: 'radio',       n: '라디오',  g: '<div class="g" style="border:none;font-size:14px">◉</div>' },
  { t: 'date',        n: '날짜',    g: '<div class="g">▤</div>' },
  { t: 'check',       n: '체크',    g: '<div class="g" style="border:none;font-size:17px">☐</div>' },
  { t: 'text',        n: '긴 글',   g: '<div class="g" style="height:30px"></div>' },
  { t: 'file',        n: '파일',    g: '<div class="g" style="border:none;font-size:13px">⇪</div>' },
  { t: 'list',        n: '표',      g: '<div class="g l"><span></span><span></span><span></span></div>' },
  { t: 'pager',       n: '페이지',  g: '<div class="g" style="border:none;font-size:11px;letter-spacing:1px">‹1›</div>' },
  { t: 'tab',         n: '탭',      g: '<div class="g" style="border:none;font-size:11px;letter-spacing:1px">▢▢</div>' },
  { t: 'image',       n: '이미지',  g: '<div class="g d" style="font-size:12px;color:#8E98A6">▨</div>' },
  { t: 'button',      n: '버튼',    g: '<div class="g f"></div>' },
  { t: 'divider',     n: '구분선',  g: '<div class="g" style="border:none"><span style="display:block;width:36px;height:2px;background:#C7CFDA"></span></div>' },
  { t: 'area',        n: '묶음',    g: '<div class="g d"></div>' },
];

/** 요소 기본 크기 [w, h] — 실제 화면 밀도에 맞춰 축소(2026-09, 2차 조정) */
export const DEF = {
  area: [420, 68], title: [170, 17], label: [85, 15], input: [150, 19], select: [130, 19],
  radio: [210, 17], date: [125, 19], check: [115, 15], text: [330, 48], file: [250, 19],
  list: [620, 145], pager: [250, 20], tab: [400, 24], image: [160, 110],
  button: [85, 20], divider: [900, 5],
};

/** 요소 타입 → 표시명 */
export const NAME = Object.fromEntries(COMPS.map((c) => [c.t, c.n]));

/** items(쉼표 목록)를 갖는 타입 — 컨텍스트 툴바에 항목 입력칸 표시 */
export const HAS_ITEMS = { list: 1, select: 1, radio: 1, tab: 1 };

export const SNAP = 6;

/** 캔버스 기본 크기 */
export const DEFAULT_BOARD = { w: 960, h: 600 };

/** 화면 유형별 캔버스 크기 (U-12) — 팝업만 별도 크기, 나머지는 전부 동일 해상도로 통일 */
export const BOARD_SIZES = {
  list:   { w: 960, h: 600 },
  detail: { w: 960, h: 600 },
  form:   { w: 960, h: 600 },
  blank:  { w: 960, h: 600 },
  main:   { w: 960, h: 600 },
  popup:  { w: 560, h: 420 },
};

export const boardSizeFor = (key) => BOARD_SIZES[key] || DEFAULT_BOARD;

export const defaultLabel = (t) =>
  ({
    title: '제목을 입력하세요', label: '항목명', button: '버튼', area: '묶음 영역',
    input: '', select: '', radio: '', date: '', check: '선택 항목', text: '',
    file: '파일 선택', list: '표', pager: '', tab: '', image: '이미지', divider: '',
  }[t] ?? NAME[t]);

export const defaultCols = (t) =>
  ({
    list: '순번,항목1,항목2,항목3',
    select: '선택1,선택2',
    radio: '선택1,선택2',
    tab: '탭1,탭2,탭3',
  }[t] ?? '');
