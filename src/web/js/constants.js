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
  list: [620, 145], pager: [120, 20], tab: [400, 24], image: [160, 110],
  button: [85, 20], divider: [900, 5],
};

/** 요소 타입 → 표시명 */
export const NAME = Object.fromEntries(COMPS.map((c) => [c.t, c.n]));

/** items(쉼표 목록)를 갖는 타입 — 컨텍스트 툴바에 항목 입력칸 표시 */
export const HAS_ITEMS = { list: 1, select: 1, radio: 1, tab: 1 };

/** label 이 실제 화면에 보이는 문구로 쓰이는 타입 — 컨텍스트 툴바에 문구·글자 크기 입력칸 표시.
 * select/radio/list/tab 은 label 이 아니라 items 를 쓰고, date/file/pager/divider 는 label 을
 * 아예 쓰지 않으므로 여기서 뺀다(넣어봐야 결과 화면에 아무 영향이 없어 혼란만 준다). */
export const HAS_TEXT = { title: 1, label: 1, button: 1, input: 1, text: 1, check: 1, area: 1, image: 1 };

/** required(＊ 표시)가 실제 화면에 반영되는 타입만 컨텍스트 툴바에 "필수" 토글을 보여준다. */
export const HAS_REQ = { input: 1, select: 1, radio: 1, date: 1, check: 1, text: 1, file: 1 };

export const SNAP = 6;

/** 캔버스 기본 크기 — 고정 3개 시스템 외(사용자가 추가한 시스템) 전부 이 크기를 쓴다 */
export const DEFAULT_BOARD = { w: 900, h: 600 };

/** 팝업 화면 유형은 시스템과 무관하게 항상 이 작은 크기 (U-12) */
export const POPUP_BOARD = { w: 560, h: 420 };

/** 고정 3개 시스템의 기본 캔버스 크기 — 실제 화면 캡처·사이트 기준(§1 참고).
 * homepage 는 hi.co.kr 실제 레이아웃 폭(#wrap, 1240px)에 다른 두 시스템과 비슷한 높이를 맞춘 값. */
export const SYSTEM_BOARD_SIZES = {
  salesportal: { w: 1180, h: 755 },
  portal: { w: 1280, h: 738 },
  homepage: { w: 1240, h: 750 },
};

/**
 * 화면 유형(template)·시스템(systemId) 에 맞는 기본 캔버스 크기.
 * 팝업은 시스템과 무관하게 항상 작은 고정 크기. 그 외 유형은 시스템 기본 크기(없으면 DEFAULT_BOARD)로
 * 전부 통일된다 — U-12 의 "화면 유형별이 아니라 시스템별로 통일" 확장판.
 */
export const boardSizeFor = (key, systemId) => {
  if (key === 'popup') return POPUP_BOARD;
  return SYSTEM_BOARD_SIZES[systemId] || DEFAULT_BOARD;
};

export const defaultLabel = (t) =>
  ({
    title: '제목을 입력하세요', label: '항목명', button: '버튼', area: '묶음 영역',
    input: '', select: '', radio: '', date: '', check: '선택 항목', text: '',
    file: '파일 선택', list: '표', pager: '', tab: '', image: '이미지', divider: '',
  }[t] ?? NAME[t]);

/** 항목 이름 정리 — 항목은 쉼표로 이어 저장하므로 쉼표는 공백으로 바꾸고, 앞뒤·연속 공백을 정리한다 */
export const cleanItemName = (s) => String(s ?? '').replace(/[,，]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 쉼표로 이은 항목 문자열(cols)에서 idx 번째 항목의 이름을 바꾼다.
 * 이름이 비었거나(지우는 대신 원래 값 유지) 그대로거나 범위를 벗어나면 null(변경 없음).
 * @returns {string|null} 바뀐 cols 문자열
 */
export function renameItemAt(cols, idx, next) {
  const items = String(cols || '').split(',').map((x) => x.trim()).filter(Boolean);
  const name = cleanItemName(next);
  if (!name || idx < 0 || idx >= items.length || items[idx] === name) return null;
  items[idx] = name;
  return items.join(',');
}

export const defaultCols = (t) =>
  ({
    list: '순번,항목1,항목2,항목3',
    select: '선택1,선택2',
    radio: '선택1,선택2',
    tab: '탭1,탭2,탭3',
  }[t] ?? '');
