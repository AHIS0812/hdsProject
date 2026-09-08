/** 캔버스 팔레트 요소 타입 (예시 UI 계승). */
export const SHAPE_TYPES = [
  'title', 'label', 'input', 'select', 'date', 'check', 'text', 'list', 'button', 'area',
];

/** 요소가 items(쉼표 구분 목록)를 갖는 타입. */
export const HAS_ITEMS = ['list', 'select'];

/** 작업 구분. */
export const WORK_MODES = ['new', 'edit'];

/** 화면 유형 템플릿. */
export const TEMPLATES = ['list', 'detail', 'form', 'popup'];

/** 요소 타입 → WebSquare 태그 (기준, 상세는 catalog/websquare/mapping.json). */
export const WEBSQUARE_TAG = {
  input: 'w2:inputBox',
  select: 'w2:selectBox',
  date: 'w2:calendar',
  check: 'w2:checkbox',
  text: 'w2:textarea',
  list: 'w2:gridView',
  button: 'w2:trigger',
  label: 'w2:textbox',
  title: 'w2:textbox',
  area: 'w2:group',
};
