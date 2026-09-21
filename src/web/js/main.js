// 하이스케치 — 에디터 조립 (프론트엔드).
// 예시 프로토타입(samples/화면스케치스튜디오_예시_v1.html)을 src/web 모듈 구조로 이전.

import { COMPS, DEFAULT_BOARD, boardSizeFor } from './constants.js';
import * as api from './api.js';
import * as editor from './editor.js';
import { makeCombo } from './combobox.js';
import { templateShapes } from './templates.js';
import { initResultModal, runBuild } from './result-modal.js';
import { toast } from './toast.js';
import { createProjectStore, cleanName } from './projects.js';
import { showDialog } from './dialog.js';

const $ = (id) => document.getElementById(id);
const scrNm = $('scrNm');
const abL = $('abL');

let workMode = 'new';
let currentTpl = 'blank'; // 처음 열면 빈 화면에서 시작
let loadedScreenId = null;   // 변경 모드에서 현재 캔버스에 로드된 화면 id
// 사용자가 캔버스를 직접 수정했는지. 템플릿/화면/샘플을 "프로그램으로" 로드한 직후엔 false.
// true 일 때만 다른 템플릿·화면으로 전환 시 확인을 묻는다.
let canvasDirty = false;
// "PC" 비율 프리셋이 돌아갈 기준 크기 — 신규는 화면 유형 기본값, 변경화면은 그 화면의 canvas
let baseBoardSize = DEFAULT_BOARD;

// 캔버스 편집 내용은 새로고침해도 유지된다 — PPT·캔바처럼 "지금 작업 중인 화면" 하나를
// 자동 저장(localStorage, 디바운스)해 뒀다가 부팅 시 이어서 불러온다(§AUTOSAVE_KEY 아래).
// 다른 화면으로 새로 시작하려면 상단 신규/변경 화면 전환이나 화면 유형 타일을 쓴다 — 그 자체가
// "새로 시작하기" 진입점이고, 그 순간부터 그게 새로운 자동 저장 대상이 된다.
// 이름 붙여 따로 보관하려면 "저장본" 슬롯(다른 이름으로 저장 = 사본) 또는 .hds.json 내보내기를 쓴다.

/**
 * 캔버스를 새 shapes 로 교체 (프로그램 로드 — dirty 아님)
 * @param {object} [size] { w, h } — 지정 시 보드 크기도 변경
 */
function loadCanvas(shapes, name, size) {
  editor.clearBoardBackground(); // 다른 화면으로 바뀌면 이전에 깔아둔 캡처 배경은 의미가 없어진다
  syncBgButtons();
  if (size && (size.w || size.h)) {
    const w = size.w || DEFAULT_BOARD.w;
    const h = size.h || DEFAULT_BOARD.h;
    editor.setBoardSize(w, h);
    baseBoardSize = { w, h };
  }
  editor.setShapes(shapes || []);
  if (name != null) scrNm.value = name;
  syncAbL();
  canvasDirty = false;
}

/** 지금 캔버스 상태 스냅샷(되돌리기 토스트용) — 화면 전환류(guardedRun) 직전에만 호출 */
function snapshotForUndo() {
  return {
    workMode, currentTpl, loadedScreenId, baseBoardSize,
    scrName: scrNm.value,
    canvas: editor.getBoardSize(),
    shapes: editor.toPayloadShapes(),
  };
}

/** snapshotForUndo() 로 찍어둔 상태로 복원 — combo 는 silent 모드로 맞춰 onPick 재귀를 피한다 */
function restoreSnapshot(snap) {
  workMode = snap.workMode;
  markMode(workMode);
  applyMode();
  currentTpl = snap.currentTpl;
  highlightTpl(currentTpl);
  loadedScreenId = snap.loadedScreenId;
  baseBoardSize = snap.baseBoardSize;
  editor.clearBoardBackground();
  syncBgButtons();
  editor.setBoardSize(snap.canvas.w, snap.canvas.h);
  editor.setShapes(snap.shapes);
  scrNm.value = snap.scrName;
  syncAbL();
  if (workMode === 'edit' && loadedScreenId) scrCombo.choose(loadedScreenId, true);
  else scrCombo.reset();
  canvasDirty = true; // 되돌린 내용도 사용자가 실제로 작업했던 내용이므로 dirty 로 유지
  toast('이전 화면으로 되돌렸습니다');
}

// ── 자동 저장(현재 작업 중인 화면 1개, localStorage) ────────
// "저장본" 슬롯(이름 붙여 여러 개 보관)과는 별개로, PPT·캔바처럼 지금 캔버스에 있는 내용 그대로를
// 디바운스해서 계속 최신 상태로 남겨 두고, 새로고침·재접속 시 그 상태를 이어서 연다.
const AUTOSAVE_KEY = 'hds:autosave';
let autosaveTimer = null;

/** snapshotForUndo() 와 같은 필드 + 복원에 필요한 시스템 선택·캡처 배경까지 포함한 전체 스냅샷 */
function autosaveSnapshot() {
  return {
    ...snapshotForUndo(),
    systemId: sysCombo.get()?.id || null,
    background: editor.hasBoardBackground() ? editor.getBoardBackground() : null,
    // 열려 있는 프로젝트 — 새로고침해도 같은 프로젝트를 이어서 저장할 수 있게
    projectId: project.id,
    projectName: project.name,
    projectDirty: isDirty(),
  };
}
let booted = false; // 부팅(시스템·화면 콤보 복원)이 끝나기 전엔 반쯤 복원된 상태를 초안으로 덮어쓰지 않는다
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (!booted) return;
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(autosaveSnapshot())); } catch { /* 저장 공간 부족 등 — 조용히 무시 */ }
  }, 500);
  scheduleStatus();
}
function readAutosave() {
  try {
    const doc = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
    return doc && Array.isArray(doc.shapes) ? doc : null;
  } catch { return null; }
}
/** autosaveSnapshot() 으로 저장해 둔 상태를 부팅 시 그대로 복원한다(시스템/화면 선택은 boot() 이 이어서 처리) */
function restoreAutosave(snap) {
  workMode = snap.workMode === 'edit' ? 'edit' : 'new';
  markMode(workMode);
  applyMode();
  currentTpl = document.querySelector(`.tpl[data-tpl="${snap.currentTpl}"]`) ? snap.currentTpl : 'blank';
  highlightTpl(currentTpl);
  loadedScreenId = snap.loadedScreenId || null;
  baseBoardSize = snap.baseBoardSize || DEFAULT_BOARD;
  editor.clearBoardBackground();
  editor.setBoardSize(snap.canvas?.w || DEFAULT_BOARD.w, snap.canvas?.h || DEFAULT_BOARD.h);
  editor.setShapes(snap.shapes);
  if (snap.background) editor.setBoardBackground(snap.background);
  syncBgButtons();
  scrNm.value = snap.scrName || '';
  // 열려 있던 프로젝트가 그 사이 삭제됐으면 저장 안 된 새 프로젝트로 이어 간다
  const pid = snap.projectId && store.has(snap.projectId) ? snap.projectId : null;
  setProject(pid, pid ? store.meta(pid).name : (snap.projectName || ''));
  syncAbL();
  canvasDirty = snap.shapes.length > 0; // 이어서 작업 중이던 내용이므로, 비어있지 않으면 dirty 유지
}

/**
 * 캔버스를 교체하는 동작(템플릿/모드/화면 전환, 배경 이미지 업로드 등)을 감싼다.
 * 사용자가 실제로 손댄 내용(canvasDirty)이 있을 때만 — 프로그램으로 막 불러온 직후처럼
 * 아무 것도 고치지 않은 상태에서 넘어갈 땐 바로 적용하고 아무 것도 띄우지 않는다 — 적용 후
 * "화면이 초기화되었습니다 · 되돌리기" 토스트를 띄운다. blocking confirm() 대신 즉시 적용하고,
 * 실수로 눌렀으면 토스트의 되돌리기로 돌아갈 수 있게 한다.
 * @returns {boolean} 되돌리기 토스트를 띄웠는지 — 호출부가 이어서 다른 토스트를 띄울지 판단할 때 쓴다.
 */
function guardedRun(applyFn, msg = '화면이 초기화되었습니다 · 지금까지 작업한 내용은 사라집니다') {
  const needsUndo = canvasDirty && editor.count();
  const snap = needsUndo ? snapshotForUndo() : null;
  applyFn();
  if (snap) {
    toast(msg, { actionLabel: '되돌리기', onAction: () => restoreSnapshot(snap) });
  }
  return !!snap;
}


// ── 상단 바 ───────────────────────────────────────────────
function syncAbL() {
  const { w, h } = editor.getBoardSize();
  abL.textContent = (scrNm.value || '제목 없음') + '  ';
  const span = document.createElement('span');
  span.textContent = `${w} × ${h}`;
  abL.append(span);
  scheduleAutosave();
}
scrNm.addEventListener('input', syncAbL);

$('btnClear').addEventListener('click', () => {
  if (!editor.count()) return;
  editor.clearShapes();
  toast('캔버스를 비웠습니다 · 되돌리기(Ctrl+Z)로 복구');
});
$('btnBuild').addEventListener('click', build);

// ── 요소 팔레트 ───────────────────────────────────────────
// div 를 클릭 요소로 쓰는 곳에 키보드(Enter/Space) 지원을 붙인다.
function clickable(el, onActivate) {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('click', onActivate);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(e); }
  });
}

const clist = $('clist');
clist.replaceChildren(
  ...COMPS.map((c) => {
    const el = document.createElement('div');
    el.className = 'ci';
    el.innerHTML = `${c.g}<div class="t">${c.n}</div>`;
    el.setAttribute('aria-label', `${c.n} 요소 추가`);
    clickable(el, () => editor.addComponent(c.t));
    return el;
  }),
);

// ── 하단 툴바 (되돌리기 / 줌) ─────────────────────────────
const TOOL = {
  undo: editor.undo, redo: editor.redo,
  zoomIn: () => editor.zoomBy(10), zoomOut: () => editor.zoomBy(-10), zoomReset: editor.zoomReset,
};
document.querySelector('.tools').addEventListener('click', (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act || !TOOL[act]) return;
  TOOL[act]();
});

// ── 화면 비율 프리셋 (PC / PC·스크롤 고려 / 모바일) ───────────
// 화면 유형·확대율과는 별개로, 캔버스 자체를 다른 기기 폭에 맞춰 그려보고 싶을 때 쓴다.
const RATIO_SIZES = { pcScroll: { w: 960, h: 1400 }, mobile: { w: 390, h: 844 } };
const btnRatio = $('btnRatio');
const ratioPop = $('ratioPop');
const ratioW = $('ratioW');
const ratioH = $('ratioH');
function setRatioPop(open) {
  ratioPop.hidden = !open;
  btnRatio.setAttribute('aria-expanded', String(open));
  if (open) {
    const { w, h } = editor.getBoardSize();
    ratioW.value = w;
    ratioH.value = h;
  }
}
function applyBoardSize(w, h) {
  editor.setBoardSize(w, h);
  syncAbL();
  canvasDirty = true;
}
btnRatio.addEventListener('click', () => setRatioPop(ratioPop.hidden));
ratioPop.addEventListener('click', (e) => {
  const key = e.target.closest('button')?.dataset.ratio;
  if (!key) return;
  const size = RATIO_SIZES[key] || baseBoardSize; // 'pc' = 원래 크기로 복귀
  applyBoardSize(size.w, size.h);
  setRatioPop(false);
});
$('ratioApply').addEventListener('click', () => {
  const w = parseInt(ratioW.value, 10);
  const h = parseInt(ratioH.value, 10);
  if (!w || !h) { toast('폭·높이를 숫자로 입력해주세요'); return; }
  applyBoardSize(w, h);
  setRatioPop(false);
});
document.addEventListener('mousedown', (e) => {
  if (!ratioPop.hidden && !ratioPop.contains(e.target) && !btnRatio.contains(e.target)) setRatioPop(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !ratioPop.hidden) { setRatioPop(false); btnRatio.focus(); }
});

// ── 작업 구분 (신규 / 변경) ───────────────────────────────
// 화면 유형(템플릿)은 신규 모드에서만 노출한다. 변경 모드는 완성된 화면을 불러와 고치므로 불필요.
function applyMode() {
  $('newBlock').classList.toggle('hidden', workMode !== 'new');
  $('editBlock').classList.toggle('hidden', workMode !== 'edit');
  // 신규: 화면 이름 직접 입력 / 변경: 불러온 화면 이름 고정
  scrNm.readOnly = workMode === 'edit';
  scrNm.title = workMode === 'edit' ? '변경 모드에서는 화면 이름을 바꿀 수 없습니다' : '화면 이름 (클릭해서 수정)';
}
// 세그먼트 선택 상태를 aria-checked 로 표시
function markMode(mode) {
  document.querySelectorAll('#modeSeg button').forEach((x) =>
    x.setAttribute('aria-checked', String(x.dataset.mode === mode)));
}
document.querySelectorAll('#modeSeg button').forEach((el) => {
  el.addEventListener('click', () => {
    const next = el.dataset.mode;
    if (next === workMode) return;
    guardedRun(() => {
      workMode = next;
      markMode(workMode);
      applyMode();
      loadedScreenId = null;
      if (workMode === 'new') {
        loadCanvas(templateShapes(currentTpl), '새 화면', boardSizeFor(currentTpl));
      } else {
        loadCanvas([], '', DEFAULT_BOARD);
        scrCombo.reset();
      }
    });
  });
});

// ── 화면 유형 (신규 모드) ─────────────────────────────────
function highlightTpl(key) {
  document.querySelectorAll('.tpl').forEach((x) => {
    const on = x.dataset.tpl === key;
    x.classList.toggle('on', on);
    x.setAttribute('aria-pressed', String(on));
  });
}
document.querySelectorAll('.tpl').forEach((el) => {
  clickable(el, () => {
    if (workMode !== 'new') return;
    const key = el.dataset.tpl;
    if (key === currentTpl && !canvasDirty) { highlightTpl(key); return; }
    guardedRun(() => {
      currentTpl = key;
      highlightTpl(key);
      // 방금까지 기존 화면을 보고 있었다면 이름을 새 화면 기본값으로
      loadCanvas(templateShapes(key), loadedScreenId ? '새 화면' : undefined, boardSizeFor(key));
      loadedScreenId = null;
    });
  });
});

// ── 시스템 / 변경화면 콤보박스 ────────────────────────────
const sysCombo = makeCombo($('sysBox'), {
  placeholder: '시스템 선택',
  emptyText: '시스템이 없습니다',
  onPick: async (sys) => {
    scrCombo.setItems([]);
    loadedScreenId = null;
    scrCombo.setPlaceholder(sys ? '불러오는 중…' : '먼저 시스템을 선택하세요');
    scheduleAutosave();
    if (!sys) return;
    try {
      const screens = await api.getScreens(sys.id);
      scrCombo.setItems(screens.map((s) => ({ id: s.id, name: s.name, sub: s.template })));
      scrCombo.setPlaceholder(screens.length ? '화면 선택' : '등록된 화면이 없습니다');
    } catch (e) {
      toast('화면 목록을 불러오지 못했습니다');
      console.error(e);
    }
  },
});

const scrCombo = makeCombo($('scrBox'), {
  placeholder: '화면 선택',
  emptyText: '해당 시스템에 등록된 화면이 없습니다',
  // 변경할 화면을 바꾸는 건 지금 캔버스(전 화면 또는 편집 중이던 내용)를 지운다는 뜻이라,
  // 작업한 내용이 있으면 적용 후 되돌리기 토스트를 띄운다.
  onPick: async (scr) => {
    if (!scr || scr.id === loadedScreenId) return;
    try {
      const def = await api.getScreen(scr.id);
      guardedRun(() => {
        loadCanvas(def.shapes || [], def.name || scr.name, def.canvas || DEFAULT_BOARD);
        loadedScreenId = scr.id;
      });
    } catch (e) {
      toast('화면을 불러오지 못했습니다');
      console.error(e);
    }
  },
});

// ── 이미지 추가 (드래그·선택·붙여넣기 → 캔버스 image 요소) ──
const IMG_MAX_BYTES = 15 * 1024 * 1024;
const IMG_MAX_PX = 1400;   // 긴 변이 이보다 크면 축소해서 저장 (data URL 용량 절약)
const drop = $('drop');
const DROP_LABEL = '＋ 이미지 추가 (드래그 · 선택 · 붙여넣기)';
drop.textContent = DROP_LABEL;

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.multiple = true;
fileInput.accept = 'image/*';
fileInput.hidden = true;
document.body.append(fileInput);

/** 이미지 파일 → (필요 시 축소된) data URL + 크기 */
function fileToImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('파일을 읽지 못했습니다'));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error('이미지를 열지 못했습니다'));
      im.onload = () => {
        const { naturalWidth: nw, naturalHeight: nh } = im;
        const k = Math.min(1, IMG_MAX_PX / Math.max(nw, nh));
        if (k === 1 && file.size < 400 * 1024) {
          res({ src: fr.result, w: nw, h: nh });
          return;
        }
        const c = document.createElement('canvas');
        c.width = Math.round(nw * k);
        c.height = Math.round(nh * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const type = /png|gif|webp/.test(file.type) ? 'image/png' : 'image/jpeg';
        res({ src: c.toDataURL(type, 0.85), w: c.width, h: c.height });
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/** 보드 60% 안으로 비율 유지 축소 */
function fitBoard(w, h) {
  const { w: bw, h: bh } = editor.getBoardSize();
  const k = Math.min(1, (bw * 0.6) / w, (bh * 0.6) / h);
  return { w: Math.max(24, Math.round(w * k)), h: Math.max(20, Math.round(h * k)) };
}

async function addImages(list) {
  const files = [...list].filter((f) => f.type?.startsWith('image/'));
  if (![...list].length) return;
  if (!files.length) { toast('이미지 파일만 캔버스에 추가할 수 있어요'); return; }
  drop.textContent = '불러오는 중…';
  drop.style.pointerEvents = 'none';
  try {
    for (const f of files) {
      if (f.size > IMG_MAX_BYTES) { toast(`이미지가 너무 큽니다: ${f.name} (15MB 이하)`); continue; }
      // eslint-disable-next-line no-await-in-loop
      const img = await fileToImage(f);
      editor.addImage({ src: img.src, ...fitBoard(img.w, img.h) });
    }
  } catch (e) {
    toast(e.message);
  } finally {
    drop.textContent = DROP_LABEL;
    drop.style.pointerEvents = '';
  }
}

// ── 변경화면: 소스 연동이 안 되는 화면은 캡처 이미지를 캔버스 배경으로 ──
// shapes 와 무관한 순수 트레이싱 참고용(화면 전환 시 loadCanvas 가 자동으로 지운다).
function syncBgButtons() {
  const has = editor.hasBoardBackground();
  $('btnBgUp').hidden = has;
  $('btnBgClear').hidden = !has;
}
$('btnBgUp').addEventListener('click', () => $('bgFile').click());
$('bgFile').addEventListener('change', async () => {
  const file = $('bgFile').files[0];
  $('bgFile').value = '';
  if (!file || !file.type?.startsWith('image/')) return;
  if (file.size > IMG_MAX_BYTES) { toast('이미지가 너무 큽니다 (15MB 이하)'); return; }
  try {
    const img = await fileToImage(file);
    const showedUndo = guardedRun(() => {
      editor.clearShapes();
      editor.setBoardBackground(img.src);
      syncBgButtons();
      canvasDirty = true;
    }, '캡처 이미지를 캔버스 배경으로 깔면서 기존 요소가 초기화되었습니다');
    if (!showedUndo) toast('캡처 이미지를 캔버스 배경으로 깔았습니다 — 위에 요소를 그려보세요');
  } catch (e) {
    toast(e.message);
  }
});
$('btnBgClear').addEventListener('click', () => {
  editor.clearBoardBackground();
  syncBgButtons();
  scheduleAutosave();
});

drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => { addImages(fileInput.files); fileInput.value = ''; });
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }),
);
['dragleave', 'dragend'].forEach((ev) =>
  drop.addEventListener(ev, () => drop.classList.remove('drag')),
);
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('drag');
  addImages(e.dataTransfer.files);
});
// 페이지 어디서나 이미지 붙여넣기 → 캔버스에
document.addEventListener('paste', (e) => {
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  const imgs = [...(e.clipboardData?.items || [])]
    .filter((it) => it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (!imgs.length) return;
  e.preventDefault();
  addImages(imgs);
});

// ── 프로젝트 (저장 · 열기 · 새로 만들기) ──────────────────
// PPT·캔바처럼 "지금 열려 있는 프로젝트" 가 있고, 저장(Ctrl+S)은 그 프로젝트를 덮어쓴다.
//   · project.id 가 없으면 아직 한 번도 저장 안 한 새 프로젝트 — 첫 저장 때 이름을 정한다
//   · 내용이 마지막 저장/열기 시점과 달라지면 "변경 사항 있음" 으로 표시(내용 서명 비교 —
//     고쳤다가 되돌리면 다시 "저장됨")
//   · 새 프로젝트·다른 프로젝트 열기·파일 열기 전에 저장 안 한 변경이 있으면 확인을 받는다
// 자동 저장(위)은 이와 별개로 "작업 중 초안" 을 새로고침 복구용으로 남긴다.
const store = createProjectStore(pickStorage());
let project = { id: null, name: '' };
let savedSig = null;   // 마지막 저장/열기 시점의 내용 서명. null 이면 저장 기록 없음(= 항상 변경됨)
let savedAtTs = null;  // 마지막 저장 시각(ms) — 상태 표시용
const projNm = $('projNm');
const saveStat = $('saveStat');
const btnSave = $('btnSave');

function pickStorage() {
  try { localStorage.getItem('hds:probe'); return localStorage; } catch {
    const m = new Map(); // 사생활 보호 모드 등 — 이 탭이 열려 있는 동안만 유지
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
  }
}

function currentDoc() {
  return {
    app: 'hds',
    version: 1,
    savedAt: new Date().toISOString(),
    projectName: project.name,
    screenName: scrNm.value,
    systemId: sysCombo.get()?.id || null,
    mode: workMode,
    template: currentTpl,
    // 변경 모드에서 어떤 기존 화면을 고치던 중이었는지 — 없으면 불러온 뒤 생성할 때
    // "변경할 화면을 선택하세요" 로 막힌다.
    baseScreenId: workMode === 'edit' ? (scrCombo.get()?.id || null) : null,
    canvas: editor.getBoardSize(),
    shapes: editor.toPayloadShapes(),
    // 변경화면 캡처 배경(트레이싱) — 빠지면 저장본·파일을 다시 열었을 때 배경이 사라진다
    ...(editor.hasBoardBackground() ? { background: editor.getBoardBackground() } : {}),
  };
}

/** 저장 대상 내용의 서명 — currentDoc 과 같은 항목(프로젝트 이름·저장 시각 제외). 큰 배경 이미지는 지문만 비교한다. */
function contentSig() {
  const bg = editor.hasBoardBackground() ? editor.getBoardBackground() : '';
  return JSON.stringify([
    workMode, scrNm.value, sysCombo.get()?.id || null,
    workMode === 'edit' ? (scrCombo.get()?.id || null) : currentTpl,
    editor.getBoardSize(), editor.toPayloadShapes(), bg.length, bg.slice(-48),
  ]);
}
const isDirty = () => savedSig === null || contentSig() !== savedSig;
/** 저장 안 한 변경이 있는가 — 아무 것도 안 그린 새 프로젝트는 잃을 게 없으므로 제외 */
const hasUnsaved = () => isDirty() && (!!project.id || editor.count() > 0 || editor.hasBoardBackground());

const fmtClock = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
function fmtWhen(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function refreshStatus() {
  const unsaved = hasUnsaved();
  let text; let cls = '';
  if (!project.id) { text = unsaved ? '저장 안 됨' : '새 프로젝트'; if (unsaved) cls = 'dirty'; }
  else if (unsaved) { text = '변경 사항 있음'; cls = 'dirty'; }
  else { text = savedAtTs ? `저장됨 · ${fmtClock(savedAtTs)}` : '저장됨'; cls = 'saved'; }
  saveStat.textContent = text;
  saveStat.className = 'saveStat ' + cls;
  btnSave.classList.toggle('dirty', unsaved);
  document.title = `${unsaved ? '● ' : ''}${project.name || '제목 없는 프로젝트'} — 하이스케치`;
  if (!$('projPop').hidden) renderProjects();
}
let statusTimer = null;
function scheduleStatus() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(refreshStatus, 120);
}

function setProject(id, name) {
  project = { id: id || null, name: name || '' };
  projNm.value = project.name;
}
/** 지금 캔버스 내용을 "저장된 상태" 로 기준 삼는다 */
function markSaved(ts = null) {
  savedSig = contentSig();
  savedAtTs = ts;
  refreshStatus();
}
function markUnsaved() {
  savedSig = null;
  savedAtTs = null;
  refreshStatus();
}

// 프로젝트 이름 입력 — 저장된 프로젝트는 입력을 확정할 때(Enter·포커스 이동) 이름이 바뀐다
function commitProjectName() {
  const n = cleanName(projNm.value);
  if (!project.id) {
    project.name = n;
    projNm.value = n;
    scheduleAutosave();
    return;
  }
  if (!n || n === project.name) { projNm.value = project.name; return; }
  let meta = null;
  try { meta = store.rename(project.id, n); } catch (e) { console.error(e); }
  if (!meta) {
    toast('같은 이름의 프로젝트가 이미 있습니다');
    projNm.value = project.name;
    return;
  }
  project.name = meta.name;
  projNm.value = meta.name;
  refreshStatus();
  scheduleAutosave();
  toast(`프로젝트 이름을 "${meta.name}"(으)로 바꿨습니다`);
}
projNm.addEventListener('input', () => { if (!project.id) { project.name = projNm.value; scheduleAutosave(); scheduleStatus(); } });
projNm.addEventListener('change', commitProjectName);
projNm.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); projNm.blur(); }
  else if (e.key === 'Escape') { projNm.value = project.name; projNm.blur(); }
});

/**
 * 지금 프로젝트에 저장한다. 처음 저장하거나 asNew 면 이름을 물어 새 프로젝트로 만들고,
 * 이미 저장된 프로젝트는 그 자리에 덮어쓴다.
 * @returns {Promise<boolean>} 저장됐는지(취소·실패면 false)
 */
async function saveProject({ asNew = false } = {}) {
  closeProjPop();
  commitProjectName(); // 이름 입력칸에서 바로 Ctrl+S 를 눌러도 방금 친 이름이 반영되게
  let id = project.id;
  let name = project.name;

  if (asNew || (!id && !name)) {
    const base = asNew && id ? `${name} 사본` : (name || scrNm.value || '새 프로젝트');
    const r = await showDialog({
      title: asNew ? '다른 이름으로 저장' : '프로젝트 저장',
      message: asNew
        ? '지금 내용을 새 프로젝트로 저장합니다. 원래 프로젝트는 그대로 남고, 이후 저장은 새 프로젝트에 이어집니다.'
        : '이름을 정하면 이후 저장(Ctrl+S)은 이 프로젝트를 덮어씁니다.',
      input: { label: '프로젝트 이름', value: store.uniqueName(base), maxLength: 40 },
      buttons: [{ label: '취소', action: 'cancel' }, { label: '저장', action: 'ok', kind: 'primary' }],
    });
    if (!r || r.action !== 'ok') return false;
    name = cleanName(r.value);
    if (!name) { toast('프로젝트 이름을 입력하세요'); return false; }
    id = store.newId();
  } else if (!id) {
    id = store.newId(); // 이름 칸에 미리 이름을 적어 둔 새 프로젝트의 첫 저장
  }
  if (!store.has(id)) name = store.uniqueName(name); // 새로 만드는 경우만 이름 충돌을 비켜 간다

  const existed = store.has(id);
  let meta;
  try {
    meta = store.put({ id, name, doc: currentDoc() });
  } catch (e) {
    console.error(e);
    toast('브라우저 저장 공간이 부족합니다 · 파일로 내보내기를 이용해주세요');
    return false;
  }
  setProject(meta.id, meta.name);
  markSaved(meta.updatedAt);
  scheduleAutosave();
  toast(existed ? `"${meta.name}" 저장됨` : `"${meta.name}" 프로젝트를 만들어 저장했습니다`);
  return true;
}

/** 저장 안 한 변경이 있으면 [저장하고 계속 / 저장 안 함 / 취소] 를 묻는다. 계속해도 되면 true */
async function confirmDiscard() {
  if (!hasUnsaved()) return true;
  const nm = project.name || '제목 없는 프로젝트';
  const r = await showDialog({
    title: '저장하지 않은 변경 사항',
    message: `"${nm}"에 저장하지 않은 변경 사항이 있습니다.\n저장하지 않고 계속하면 이 변경 내용은 사라집니다.`,
    buttons: [
      { label: '취소', action: 'cancel' },
      { label: '저장 안 함', action: 'discard', kind: 'danger' },
      { label: '저장하고 계속', action: 'save', kind: 'primary' },
    ],
  });
  if (!r || r.action === 'cancel') return false;
  if (r.action === 'save') return saveProject();
  return true;
}

async function newProject() {
  closeProjPop();
  if (!(await confirmDiscard())) return;
  workMode = 'new';
  markMode(workMode);
  applyMode();
  currentTpl = 'blank';
  highlightTpl(currentTpl);
  loadedScreenId = null;
  scrCombo.reset();
  loadCanvas(templateShapes(currentTpl), '새 화면', boardSizeFor(currentTpl));
  editor.resetHistory();
  setProject(null, '');
  markSaved();
  scheduleAutosave();
  toast('새 프로젝트를 시작했습니다');
}

async function openProject(id) {
  closeProjPop();
  if (id === project.id && !isDirty()) { toast('이미 열려 있는 프로젝트입니다'); return; }
  if (!(await confirmDiscard())) return;
  const doc = store.get(id);
  const meta = store.meta(id);
  if (!doc || !meta) { toast('프로젝트를 찾지 못했습니다'); refreshStatus(); return; }
  await applyDoc(doc, {
    project: { id, name: meta.name }, saved: true, savedTs: meta.updatedAt,
    message: `"${meta.name}" 프로젝트를 열었습니다`,
  });
}

async function renameProject(id) {
  const meta = store.meta(id);
  if (!meta) return;
  const r = await showDialog({
    title: '프로젝트 이름 바꾸기',
    input: { label: '프로젝트 이름', value: meta.name, maxLength: 40 },
    buttons: [{ label: '취소', action: 'cancel' }, { label: '바꾸기', action: 'ok', kind: 'primary' }],
  });
  if (!r || r.action !== 'ok') return;
  const n = cleanName(r.value);
  if (!n || n === meta.name) return;
  let m = null;
  try { m = store.rename(id, n); } catch (e) { console.error(e); }
  if (!m) { toast('같은 이름의 프로젝트가 이미 있습니다'); return; }
  if (id === project.id) { project.name = m.name; projNm.value = m.name; scheduleAutosave(); }
  refreshStatus();
}

async function deleteProject(id) {
  const meta = store.meta(id);
  if (!meta) return;
  const isCur = id === project.id;
  const r = await showDialog({
    title: '프로젝트 삭제',
    message: `"${meta.name}" 프로젝트를 삭제합니다. 되돌릴 수 없습니다.`
      + (isCur ? '\n지금 열려 있는 내용은 캔버스에 남지만 저장되지 않은 상태가 됩니다.' : ''),
    buttons: [{ label: '취소', action: 'cancel' }, { label: '삭제', action: 'del', kind: 'danger' }],
  });
  if (!r || r.action !== 'del') return;
  store.remove(id);
  if (isCur) { setProject(null, ''); markUnsaved(); scheduleAutosave(); }
  refreshStatus();
  toast(`"${meta.name}" 프로젝트를 삭제했습니다`);
}

// 파일로 내보내기
$('btnExport').addEventListener('click', () => {
  const name = (project.name || scrNm.value || 'screen').replace(/[\\/:*?"<>|]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(currentDoc(), null, 2)], { type: 'application/json' }));
  a.download = `${name}.hds.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('파일로 내보냈습니다');
  closeProjPop();
});

// 파일에서 열기 — 열린 내용은 아직 어느 프로젝트에도 저장되지 않은 새 프로젝트로 시작한다
const importInput = document.createElement('input');
importInput.type = 'file';
importInput.accept = '.json,application/json';
importInput.hidden = true;
document.body.append(importInput);
$('btnImport').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  let doc;
  try {
    doc = JSON.parse(await file.text());
  } catch {
    toast('JSON 파일을 읽지 못했습니다');
    return;
  }
  if (!doc || !Array.isArray(doc.shapes)) { toast('형식이 맞지 않는 파일입니다'); return; }
  closeProjPop();
  if (!(await confirmDiscard())) return;
  const name = cleanName(doc.projectName || file.name.replace(/(\.hds)?\.json$/i, ''));
  await applyDoc(doc, {
    project: { id: null, name },
    message: '파일을 열었습니다 · 저장하면 내 프로젝트에 보관됩니다',
  });
});

// ── 프로젝트 메뉴 (새로 만들기 · 저장 · 목록) ─────────────
function renderProjects() {
  const box = $('projList');
  const list = store.list();
  if (!list.length) {
    box.replaceChildren(Object.assign(document.createElement('div'), {
      className: 'pop-empty', textContent: '저장한 프로젝트가 없습니다 · Ctrl+S 로 저장하세요',
    }));
    return;
  }
  box.replaceChildren(...list.map((m) => {
    const cur = m.id === project.id;
    const row = document.createElement('div');
    row.className = 'pop-item' + (cur ? ' cur' : '');
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'pop-item-main';
    main.innerHTML = '<b></b><span></span>';
    main.querySelector('b').textContent = m.name;
    if (cur) {
      const chip = document.createElement('i');
      chip.className = 'pcur';
      chip.textContent = '열려 있음';
      main.querySelector('b').append(chip);
    }
    main.querySelector('span').textContent =
      `${m.screenName || '제목 없음'} · ${m.mode === 'edit' ? '변경' : '신규'} · 요소 ${m.shapes ?? 0} · ${fmtWhen(m.updatedAt)}`;
    main.addEventListener('click', () => openProject(m.id));
    const ren = document.createElement('button');
    ren.type = 'button';
    ren.className = 'pop-item-btn';
    ren.textContent = '✎';
    ren.title = '이름 바꾸기';
    ren.setAttribute('aria-label', `프로젝트 "${m.name}" 이름 바꾸기`);
    ren.addEventListener('click', (e) => { e.stopPropagation(); renameProject(m.id); });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'pop-item-del';
    del.textContent = '✕';
    del.title = '삭제';
    del.setAttribute('aria-label', `프로젝트 "${m.name}" 삭제`);
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteProject(m.id); });
    row.append(main, ren, del);
    return row;
  }));
}

function closeProjPop() {
  $('projPop').hidden = true;
  $('btnProj').classList.remove('on');
  $('btnProj').setAttribute('aria-expanded', 'false');
}
$('btnProj').addEventListener('click', () => {
  const pop = $('projPop');
  const open = pop.hidden;
  pop.hidden = !open;
  $('btnProj').classList.toggle('on', open);
  $('btnProj').setAttribute('aria-expanded', String(open));
  if (open) renderProjects();
});
$('pNew').addEventListener('click', newProject);
$('pSave').addEventListener('click', () => saveProject());
$('pSaveAs').addEventListener('click', () => saveProject({ asNew: true }));
btnSave.addEventListener('click', () => saveProject());
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.savesbox') && !e.target.closest('.dlg-mask')) closeProjPop();
});
$('projPop').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeProjPop(); $('btnProj').focus(); }
});
// Ctrl+S 저장 · Ctrl+Shift+S 다른 이름으로 저장 (브라우저의 "페이지 저장" 대신)
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
  e.preventDefault();
  if (document.querySelector('.dlg-mask') || document.getElementById('mask')?.classList.contains('on')) return;
  saveProject({ asNew: e.shiftKey });
});

/**
 * 시스템·변경화면 콤보를 조용히(onPick 없이) 맞춘다 — onPick 을 타면 loadedScreenId 가 초기화되고
 * 화면 콤보가 비워져 변경 모드의 "기준 화면" 선택이 사라진다.
 * @returns {Promise<boolean>} 기준 화면까지 복원했는지
 */
async function restoreSystemAndScreen(systemId, screenId, fallbackName) {
  sysCombo.choose(systemId, true);
  const screens = await api.getScreens(systemId);
  scrCombo.setItems(screens.map((s) => ({ id: s.id, name: s.name, sub: s.template })));
  scrCombo.setPlaceholder(screens.length ? '화면 선택' : '등록된 화면이 없습니다');
  // baseScreenId 가 없는 예전 저장본 — 변경 모드는 화면 이름이 기준 화면 이름으로 고정되므로
  // 그 이름으로 기준 화면을 찾는다(캡처 배경만 깐 저장본은 기준 화면이 없어도 되니 건너뜀).
  const target = screens.find((s) => s.id === screenId)
    || (workMode === 'edit' && fallbackName && !editor.hasBoardBackground()
      ? screens.find((s) => s.name === fallbackName) : null);
  if (target) {
    scrCombo.choose(target.id, true);
    loadedScreenId = target.id;
    return true;
  }
  return false;
}

/**
 * 저장된 내용(doc)으로 캔버스·시스템·기준 화면을 통째로 바꾼다.
 * @param {{ project?: {id:string|null,name:string}, saved?: boolean, savedTs?: number|null, message?: string }} [opts]
 *   saved=true 면 불러온 내용이 곧 "저장된 상태"(프로젝트 열기), 아니면 아직 저장 안 된 상태(파일 열기)
 */
async function applyDoc(doc, { project: p = { id: null, name: '' }, saved = false, savedTs = null, message = '불러왔습니다' } = {}) {
  if (!doc || !Array.isArray(doc.shapes)) {
    toast('형식이 맞지 않는 파일입니다');
    return;
  }
  workMode = doc.mode === 'edit' ? 'edit' : 'new';
  markMode(workMode);
  applyMode();

  if (doc.template && document.querySelector(`.tpl[data-tpl="${doc.template}"]`)) {
    currentTpl = doc.template;
    highlightTpl(doc.template);
  }

  loadCanvas(doc.shapes, doc.screenName || '새 화면', doc.canvas || DEFAULT_BOARD);
  loadedScreenId = null;
  // loadCanvas 가 배경을 지우므로 그 뒤에 복원(이미지 data URL 만 허용)
  if (typeof doc.background === 'string' && doc.background.startsWith('data:image/')) {
    editor.setBoardBackground(doc.background);
    syncBgButtons();
  }
  editor.resetHistory(); // 이전에 열려 있던 내용으로 Ctrl+Z 가 되돌아가지 않게
  setProject(p.id, p.name);
  toast(message);

  try {
    if (!doc.systemId) {
      scrCombo.reset();
    } else {
      const hasBase = await restoreSystemAndScreen(doc.systemId, doc.baseScreenId, doc.screenName);
      if (workMode === 'edit' && !hasBase && !editor.hasBoardBackground()) {
        toast('변경할 화면을 선택해주세요 (이 저장본에는 기준 화면 정보가 없습니다)');
      }
    }
  } catch (e) {
    toast('화면 목록을 불러오지 못했습니다');
    console.error(e);
  } finally {
    // 시스템·기준 화면 복원까지 끝난 뒤의 상태를 기준으로 삼아야 열자마자 "변경됨" 으로 뜨지 않는다
    if (saved) markSaved(savedTs); else markUnsaved();
    scheduleAutosave();
  }
}

// ── payload / 생성 ────────────────────────────────────────
function payload() {
  const sys = sysCombo.get();
  const scr = scrCombo.get();
  const p = {
    systemId: sys?.id,
    systemName: sys?.name,
    mode: workMode,
    screenName: scrNm.value,
    canvas: editor.getBoardSize(),
    shapes: editor.toPayloadShapes(),
  };
  if (workMode === 'new') p.template = currentTpl;
  if (workMode === 'edit' && scr) p.baseScreen = { id: scr.id, name: scr.name };
  if (editor.hasBoardBackground()) p.background = editor.getBoardBackground();
  return p;
}

/** 생성 요청 직전 캔버스 모습 스냅샷 (결과 모달의 "내 스케치" 비교용) */
function snapshotSketch() {
  const { w, h } = editor.getBoardSize();
  const clone = $('board').cloneNode(true);
  // 선택 표시(테두리 오버레이·리사이즈 손잡이)·스냅 가이드·드래그 선택 박스 등 편집 중에만
  // 보이는 UI는 "내 스케치" 비교 화면에는 안 나와야 한다.
  clone.querySelectorAll('.hh,.gd,.marq,#hint,.coach,.sel-outline,.sel-bbox,.grp-outline').forEach((e) => e.remove());
  return { html: clone.innerHTML, w, h };
}

function build() {
  if (!editor.count()) { toast('먼저 화면 요소를 배치해주세요'); return; }
  if (!sysCombo.get()) { toast('시스템을 선택해주세요'); return; }
  if (workMode === 'edit' && !scrCombo.get() && !editor.hasBoardBackground()) { toast('변경할 화면을 선택하거나 캡처 이미지를 배경으로 깔아주세요'); return; }
  runBuild(payload(), scrNm.value || '생성 결과', snapshotSketch());
}

// ── 온보딩 코치 / 단축키 도움말 ──────────────────────────
function initHelp() {
  const helpPop = $('helpPop');
  const btnHelp = $('btnHelp');
  const setHelp = (open) => {
    helpPop.hidden = !open;
    btnHelp.setAttribute('aria-expanded', String(open));
    if (open) $('helpClose').focus();
  };
  const toggleHelp = () => setHelp(helpPop.hidden);
  const closeHelp = (refocus) => { setHelp(false); if (refocus) btnHelp.focus(); };
  btnHelp.addEventListener('click', toggleHelp);
  $('helpClose').addEventListener('click', () => closeHelp(true));
  document.addEventListener('mousedown', (e) => {
    if (!helpPop.hidden && !helpPop.contains(e.target) && e.target.id !== 'btnHelp') closeHelp(false);
  });
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    if (e.key === '?') { e.preventDefault(); toggleHelp(); }
    else if (e.key === 'Escape' && !helpPop.hidden) closeHelp(true);
  });

  let seen = false;
  try { seen = !!localStorage.getItem('hds:coachDone'); } catch { /* 무시 */ }
  const coach = $('coach');
  if (!seen) coach.hidden = false;
  $('coachOk').addEventListener('click', () => {
    coach.hidden = true;
    try { localStorage.setItem('hds:coachDone', '1'); } catch { /* 무시 */ }
  });
}

// ── 부팅 ─────────────────────────────────────────────────
async function boot() {
  // 예전 버전의 자동 저장 초안이 남아 있으면 정리 (형식이 달라 더 이상 복원 못 함)
  try { localStorage.removeItem('aiScreenDraft:v1'); } catch { /* 무시 */ }

  editor.initEditor({ onChange: () => { canvasDirty = true; scheduleAutosave(); } });
  initResultModal();
  initHelp();

  applyMode();
  const draft = readAutosave();
  if (draft) {
    restoreAutosave(draft);
    toast('작업 중이던 화면을 이어서 불러왔습니다');
  } else {
    // 자동 저장된 내용이 없으면(첫 방문 등) 선택된 유형(빈 화면)의 프리셋을 올려 시작 상태로
    loadCanvas(templateShapes(currentTpl), '새 화면', boardSizeFor(currentTpl));
    syncAbL();
    canvasDirty = false; // 부팅 시점의 로드는 사용자 수정이 아님
  }

  try {
    const systems = await api.getSystems();
    sysCombo.setItems(systems.map((s) => ({ id: s.id, name: s.name, sub: s.sub })));
    const draftSys = draft?.systemId && systems.some((s) => s.id === draft.systemId) ? draft.systemId : null;
    if (draftSys) {
      // 자동 저장된 시스템 선택을 조용히 재현(onPick 을 타면 loadedScreenId 가 초기화돼 버린다) —
      // 화면 목록도 같이 불러와 변경화면 선택까지 이어 붙인다.
      try {
        await restoreSystemAndScreen(draftSys, draft.loadedScreenId);
      } catch (e) {
        toast('화면 목록을 불러오지 못했습니다');
        console.error(e);
      }
    } else {
      const want = systems.find((s) => s.id === 'salesportal') ? 'salesportal' : systems[0]?.id;
      if (want) sysCombo.choose(want);
    }
  } catch (e) {
    toast('API 서버에 연결하지 못했습니다 — npm run dev 로 실행했는지 확인하세요');
    console.error(e);
  }

  // 열려 있던 프로젝트와의 관계 확정 — 시스템·기준 화면까지 복원된 뒤의 상태를 기준으로 삼는다.
  // 초안이 "저장된 상태 그대로" 였다면 저장됨, 아니면(또는 예전 초안이면) 변경 사항 있음으로 이어 간다.
  if (draft && draft.projectDirty === false) markSaved(project.id ? store.meta(project.id)?.updatedAt ?? null : null);
  else if (draft) markUnsaved();
  else markSaved();
  booted = true;
  scheduleAutosave();
}

boot();
