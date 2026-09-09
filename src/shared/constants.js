/** 캔버스 팔레트 요소 타입. (src/web/js/constants.js 의 COMPS 와 일치해야 함) */
export const SHAPE_TYPES = [
  'title', 'label', 'input', 'select', 'radio', 'date', 'check', 'text', 'file',
  'list', 'pager', 'tab', 'image', 'button', 'divider', 'area',
];

/** 요소가 items(쉼표 구분 목록)를 갖는 타입. */
export const HAS_ITEMS = ['list', 'select', 'radio', 'tab'];

/** 작업 구분. */
export const WORK_MODES = ['new', 'edit'];

/** 화면 유형 템플릿. */
export const TEMPLATES = ['list', 'detail', 'form', 'popup', 'main', 'blank'];

/** 요소 타입 → WebSquare 태그 (기준, 상세는 catalog/websquare/mapping.json). */
export const WEBSQUARE_TAG = {
  input: 'w2:inputBox',
  select: 'w2:selectBox',
  radio: 'w2:radiobutton',
  date: 'w2:calendar',
  check: 'w2:checkbox',
  text: 'w2:textarea',
  file: 'w2:fileUpload',
  list: 'w2:gridView',
  pager: 'w2:pagination',
  tab: 'w2:tabControl',
  image: 'w2:image',
  button: 'w2:trigger',
  divider: 'w2:group', // 스타일상의 선 — group 으로 대체
  label: 'w2:textbox',
  title: 'w2:textbox',
  area: 'w2:group',
};
