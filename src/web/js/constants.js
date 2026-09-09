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
  { t: 'buttongroup', n: '버튼그룹', g: '<div class="g" style="border:none;display:flex;gap:2px;padding:5px 4px"><span style="flex:1;background:#0F3B7C;border-radius:2px"></span><span style="flex:1;background:#0F3B7C;border-radius:2px"></span></div>' },
  { t: 'divider',     n: '구분선',  g: '<div class="g" style="border:none"><span style="display:block;width:36px;height:2px;background:#C7CFDA"></span></div>' },
  { t: 'area',        n: '묶음',    g: '<div class="g d"></div>' },
];

/** 요소 기본 크기 [w, h] */
export const DEF = {
  area: [420, 90], title: [180, 26], label: [90, 24], input: [160, 28], select: [140, 28],
  radio: [220, 26], date: [130, 28], check: [120, 24], text: [340, 70], file: [260, 28],
  list: [620, 180], pager: [260, 30], tab: [420, 34], image: [160, 120],
  button: [90, 30], buttongroup: [220, 32], divider: [900, 8],
};

/** 요소 타입 → 표시명 */
export const NAME = Object.fromEntries(COMPS.map((c) => [c.t, c.n]));

/** items(쉼표 목록)를 갖는 타입 — 컨텍스트 툴바에 항목 입력칸 표시 */
export const HAS_ITEMS = { list: 1, select: 1, radio: 1, tab: 1, buttongroup: 1 };

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
  ({
    title: '제목을 입력하세요', label: '항목명', button: '버튼', area: '묶음 영역',
    input: '', select: '', radio: '', date: '', check: '선택 항목', text: '',
    file: '파일 선택', list: '표', pager: '', tab: '', image: '이미지', buttongroup: '', divider: '',
  }[t] ?? NAME[t]);

export const defaultCols = (t) =>
  ({
    list: '순번,항목1,항목2,항목3',
    select: '선택1,선택2',
    radio: '선택1,선택2',
    tab: '탭1,탭2,탭3',
    buttongroup: '저장,취소',
  }[t] ?? '');
