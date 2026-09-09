// 캔버스 팔레트 요소 정의 (예시 프로토타입 계승)

export const COMPS = [
  { t: 'title',  n: '제목',   g: '<div class="g n">▮</div>' },
  { t: 'label',  n: '글자',   g: '<div class="g n" style="color:#3C4655;font-size:13px">가</div>' },
  { t: 'input',  n: '입력칸', g: '<div class="g u"></div>' },
  { t: 'select', n: '선택',   g: '<div class="g">▾</div>' },
  { t: 'date',   n: '날짜',   g: '<div class="g">▤</div>' },
  { t: 'check',  n: '체크',   g: '<div class="g" style="border:none;font-size:17px">☐</div>' },
  { t: 'text',   n: '긴 글',  g: '<div class="g" style="height:30px"></div>' },
  { t: 'list',   n: '표',     g: '<div class="g l"><span></span><span></span><span></span></div>' },
  { t: 'button', n: '버튼',   g: '<div class="g f"></div>' },
  { t: 'area',   n: '묶음',   g: '<div class="g d"></div>' },
];

/** 요소 기본 크기 [w, h] */
export const DEF = {
  area: [420, 90], title: [180, 26], label: [90, 24], input: [160, 28], select: [140, 28],
  date: [130, 28], check: [120, 24], text: [340, 70], list: [620, 180], button: [90, 30],
};

/** 요소 타입 → 표시명 */
export const NAME = Object.fromEntries(COMPS.map((c) => [c.t, c.n]));

/** items(쉼표 목록)를 갖는 타입 */
export const HAS_ITEMS = { list: 1, select: 1 };

export const SNAP = 6;

/** 캔버스 기본 크기 */
export const DEFAULT_BOARD = { w: 960, h: 600 };

/** 화면 유형별 캔버스 크기 (U-12) */
export const BOARD_SIZES = {
  list:   { w: 960, h: 600 },
  detail: { w: 960, h: 600 },
  form:   { w: 960, h: 600 },
  blank:  { w: 960, h: 600 },
  main:   { w: 1280, h: 720 },
  popup:  { w: 560, h: 420 },
};

export const boardSizeFor = (key) => BOARD_SIZES[key] || DEFAULT_BOARD;

export const defaultLabel = (t) =>
  ({ title: '제목을 입력하세요', label: '항목명', button: '버튼', area: '묶음 영역',
     input: '', select: '', date: '', check: '선택 항목', text: '', list: '표' }[t] ?? NAME[t]);

export const defaultCols = (t) =>
  (t === 'list' ? '순번,항목1,항목2,항목3' : t === 'select' ? '선택1,선택2' : '');
