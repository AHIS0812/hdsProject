// 하이스케치 — 에디터 조립 (프론트엔드).
// 예시 프로토타입(samples/화면스케치스튜디오_예시_v1.html)을 src/web 모듈 구조로 이전.

import { COMPS, DEFAULT_BOARD, boardSizeFor } from './constants.js';
import * as editor from './editor.js';
import { createSystemStore } from './systems.js';
import { makeCombo } from './combobox.js';
import { templateShapes } from './templates.js';
import { initResultModal, runBuild } from './result-modal.js';
import { toast } from './toast.js';
import { createProjectStore, browserStorage, cleanName, UNTITLED } from './projects.js';
import { thumbnailSvg, makeBgThumb } from './thumbnail.js';
import { sortProjects, relTime, metaLine, safeFileName } from './home-logic.js';
import { showDialog } from './dialog.js';
import { openVersionPanel } from './version-panel.js';
import { AUTO_INTERVAL_MS } from './versions.js';
import {
  docPages, activeIndex, makeDoc, normalizePage, clonePage, movePage, newPageId, docSignature, MAX_PAGES,
} from './doc-model.js';
import { createPageBar, pageThumbSvg } from './pagebar.js';

const $ = (id) => document.getElementById(id);
/** 결과 모달이나 확인 대화상자가 떠 있는지 — 떠 있으면 뒤의 캔버스 단축키·붙여넣기를 멈춘다 */
const isModalOpen = () => !!document.querySelector('.dlg-mask') || !!$('mask')?.classList.contains('on');
const scrNm = $('scrNm');
const abL = $('abL');

let currentTpl = 'blank'; // 처음 열면 빈 화면에서 시작
// 사용자가 캔버스를 직접 수정했는지. 템플릿을 "프로그램으로" 로드한 직후엔 false.
// true 일 때만 다른 템플릿으로 전환 시 확인을 묻는다.
let canvasDirty = false;
let pageBar = null;       // 하단 화면 띠(pagebar.js) — "화면(페이지)" 절에서 만든다
let pageBarTimer = null;
// 마지막으로 "프로그램으로" 불러온 캔버스 내용 — 요소를 클릭해 선택만 해도 onChange 가 불려서 예전엔
// 아무것도 안 고쳤는데도 dirty 가 되어, 템플릿을 바꿀 때 괜한 "초기화되었습니다 · 되돌리기" 토스트가 떴다.
let canvasBaseline = '[]';
const shapesSig = () => JSON.stringify(editor.toPayloadShapes());
// "PC" 비율 프리셋이 돌아갈 기준 크기 — 화면 유형 기본값(캡처 이미지로 시작했으면 그 이미지 크기)
let baseBoardSize = DEFAULT_BOARD;

// 편집 내용은 열려 있는 프로젝트(?p=<id>)에 자동 저장된다(§프로젝트 절). 프로젝트를 고르거나 새로 만드는 곳은 홈(/).

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
  canvasBaseline = shapesSig();
}

/** 지금 캔버스 상태 스냅샷(되돌리기 토스트용) — 화면 전환류(guardedRun) 직전에만 호출 */
function snapshotForUndo() {
  return {
    pageId: pages[activePage]?.id,
    currentTpl, baseBoardSize,
    scrName: scrNm.value,
    canvas: editor.getBoardSize(),
    shapes: editor.toPayloadShapes(),
    // 캡처 배경도 같이 — 빠뜨리면 배경을 새로 깔았다가 되돌렸을 때 이전 배경이 사라졌다
    background: editor.hasBoardBackground() ? editor.getBoardBackground() : null,
  };
}

/** snapshotForUndo() 로 찍어둔 상태로 복원 */
function restoreSnapshot(snap) {
  // 토스트를 누르기 전에 다른 화면으로 옮겨 갔으면 그 화면으로 돌아가서 되돌린다
  const idx = pages.findIndex((pg) => pg.id === snap.pageId);
  if (idx < 0) { toast('그 화면이 삭제되어 되돌릴 수 없습니다'); return; }
  if (idx !== activePage) switchPage(idx);
  currentTpl = snap.currentTpl;
  highlightTpl(currentTpl);
  baseBoardSize = snap.baseBoardSize;
  editor.clearBoardBackground();
  editor.setBoardSize(snap.canvas.w, snap.canvas.h);
  editor.setShapes(snap.shapes);
  if (snap.background) editor.setBoardBackground(snap.background);
  syncBgButtons();
  scrNm.value = snap.scrName;
  syncAbL();
  canvasDirty = true; // 되돌린 내용도 사용자가 실제로 작업했던 내용이므로 dirty 로 유지
  toast('이전 화면으로 되돌렸습니다');
}

// ── 자동 저장 예약 ─────────────────────────────────────────
// 내용이 바뀔 때마다(여러 경로에서) 호출된다. 실제 저장·충돌 처리는 아래 "프로젝트" 절의 persist().
let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { persist(); }, 800);
  scheduleStatus();
  schedulePageBar(); // 하단 화면 띠의 썸네일·이름도 곧 따라오게
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
  pages: () => pageBar?.setCollapsed(!pageBar.isCollapsed()),
  hand: () => editor.setHandTool(!editor.isHandTool()),
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

// ── 화면 유형 ─────────────────────────────────────────────
function highlightTpl(key) {
  document.querySelectorAll('.tpl').forEach((x) => {
    const on = x.dataset.tpl === key;
    x.classList.toggle('on', on);
    x.setAttribute('aria-pressed', String(on));
  });
}
document.querySelectorAll('.tpl').forEach((el) => {
  clickable(el, () => {
    const key = el.dataset.tpl;
    if (key === currentTpl && !canvasDirty) { highlightTpl(key); return; }
    guardedRun(() => {
      currentTpl = key;
      highlightTpl(key);
      loadCanvas(templateShapes(key), undefined, boardSizeFor(key));
    });
  });
});

// ── 시스템 콤보박스 ───────────────────────────────────────
const sysCombo = makeCombo($('sysBox'), {
  placeholder: '시스템 선택',
  emptyText: '시스템이 없습니다',
  onPick: () => { scheduleAutosave(); },
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

// ── 배경 이미지 추가: 기존 화면을 일부만 고칠 때, 그 화면 캡처를 캔버스 배경으로 깔고 위에 그린다 ──
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
    }, '배경 이미지를 추가하면서 기존 요소가 초기화되었습니다');
    if (!showedUndo) toast('배경 이미지를 추가했습니다 — 위에 요소를 그려보세요');
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
// (이미지가 아니면 캔버스에서 Ctrl+C 로 복사해 둔 요소를 붙여넣는다)
document.addEventListener('paste', (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || isModalOpen()) return;
  const imgs = [...(e.clipboardData?.items || [])]
    .filter((it) => it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (imgs.length) { e.preventDefault(); addImages(imgs); return; }
  if (editor.pasteShapes()) e.preventDefault();
});

// ── 프로젝트 (자동 저장) ────────────────────────────────────
// 에디터는 항상 프로젝트 하나(?p=<id>)를 열고, 내용이 바뀌면 그 프로젝트에 자동 저장한다(캔바·미리캔버스처럼).
// 프로젝트를 고르거나 새로 만드는 곳은 홈(/)이다. 저장 안 한 변경이 없으니 "저장하시겠습니까?" 도 없다.
//   · 고치면 잠시 뒤(0.8초) 저장 — 상단에 "저장 중… → 저장됨 · 시각"
//   · 탭을 닫거나 홈으로 나갈 때(pagehide) 대기 중인 변경을 즉시 저장
//   · 다른 탭이 같은 프로젝트를 먼저 고쳤으면(수정 시각이 다름) 덮어쓰기 전에 물어본다
const store = createProjectStore(browserStorage());
const sysStore = createSystemStore(browserStorage());
let project = { id: null, name: '' };
let savedSig = null;   // 마지막으로 저장(또는 열었을 때)한 내용의 서명
let savedAtTs = null;  // 마지막 저장 시각
let lastRev = null;    // 우리가 마지막으로 읽거나 쓴 프로젝트 수정 시각 — 다른 탭이 고쳤는지 감지용
let saveError = false;
let booted = false;    // 열기가 끝나기 전엔(반쯤 복원된 상태) 저장하지 않는다
let conflictOpen = false;
const projNm = $('projNm');
const saveStat = $('saveStat');

// ── 화면(페이지) ────────────────────────────────────────────
// 한 프로젝트에 화면이 여러 개(doc-model.js). 지금 캔버스에 열린 화면(activePage)의 정본은 에디터고,
// 나머지 화면은 pages[] 의 값이 정본이다 — 저장하거나 화면을 옮길 때 capturePage() 로 합친다.
// 예전 v1(화면 하나) 저장본도 docPages() 가 1페이지짜리로 읽어 그대로 열린다.
let pages = [normalizePage()];
let activePage = 0;
/** 화면별 에디터 상태(요소·되돌리기 기록) — 화면을 오가도 Ctrl+Z 가 그 화면 기준으로 이어진다 */
const pageStates = new Map();

/** 지금 캔버스에 열린 화면을 페이지 객체로 */
function capturePage() {
  const page = {
    id: pages[activePage]?.id || newPageId(),
    screenName: scrNm.value,
    template: currentTpl,
    baseBoard: baseBoardSize,
    canvas: editor.getBoardSize(),
    shapes: editor.toPayloadShapes(),
  };
  // 캡처 이미지로 시작한 경우의 배경(트레이싱) — 빠지면 다시 열었을 때 배경이 사라진다
  if (editor.hasBoardBackground()) page.background = editor.getBoardBackground();
  return page;
}
const livePages = () => pages.map((pg, i) => (i === activePage ? capturePage() : pg));

function currentDoc() {
  const sys = sysCombo.get();
  return makeDoc({
    projectName: project.name,
    systemId: sys?.id || null,
    systemName: sys?.name || null,
    pages: livePages(),
    activePage,
  });
}

/** 저장 대상 내용의 서명 — currentDoc 과 같은 항목(프로젝트 이름·저장 시각 제외). 큰 배경 이미지는 지문만 비교한다. */
function contentSig() {
  return docSignature([sysCombo.get()?.id || null, activePage, livePages()]);
}
const isDirty = () => savedSig === null || contentSig() !== savedSig;

const fmtClock = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

function refreshStatus() {
  let text; let cls = 'saved';
  if (saveError) { text = '저장 실패 — 다시 시도합니다'; cls = 'err'; }
  else if (booted && isDirty()) { text = '저장 중…'; cls = 'dirty'; }
  else { text = savedAtTs ? `저장됨 · ${fmtClock(savedAtTs)}` : '저장됨'; }
  saveStat.textContent = text;
  saveStat.className = 'saveStat ' + cls;
  document.title = `${project.name || UNTITLED} — 하이스케치`;
}
let statusTimer = null;
function scheduleStatus() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(refreshStatus, 120);
}

function setProject(id, name) {
  if ((id || null) !== project.id) nextAutoVersionAt = null; // 다른 프로젝트(충돌 사본 등)로 바뀌면 다시 읽는다
  project = { id: id || null, name: name || '' };
  projNm.value = project.name;
}
/** 지금 캔버스 내용을 "저장된 상태" 로 기준 삼는다 */
function markSaved(ts = null) {
  savedSig = contentSig();
  savedAtTs = ts;
  if (ts != null) lastRev = ts;
  refreshStatus();
}

// 변경 화면의 캡처 배경은 홈 카드 썸네일에도 보여야 한다. 원본(수백 KB~MB)을 그대로 넣으면 저장 공간이
// 아까우니 작게 줄인 이미지를 한 번만 만들어 두고(배경이 바뀔 때만 다시), 저장할 때 썸네일에 얹는다.
let bgThumb = { key: '', url: null };
let bgThumbPending = '';
const bgKey = () => (editor.hasBoardBackground() ? `${editor.getBoardBackground().length}:${editor.getBoardBackground().slice(-48)}` : '');
const bgThumbUrl = () => { const k = bgKey(); return k && bgThumb.key === k ? bgThumb.url : null; };
function ensureBgThumb() {
  const k = bgKey();
  if (!k || bgThumb.key === k || bgThumbPending === k) return;
  bgThumbPending = k;
  makeBgThumb(editor.getBoardBackground()).then((url) => {
    bgThumb = { key: k, url };
    bgThumbPending = '';
    // 줄인 이미지가 준비되면, 방금 저장된 프로젝트의 썸네일만 배경을 넣어 다시 써 둔다
    if (url && project.id && store.has(project.id) && bgKey() === k) {
      if (activePage !== 0) return; // 표지(첫 화면)가 아닌 화면의 배경이다
      const cover = livePages()[0];
      store.setThumb(project.id, thumbnailSvg(cover.shapes, cover.canvas, { background: url }));
    }
  });
}

// 버전 기록 — 저장할 때 마지막 버전에서 AUTO_INTERVAL(10분)이 지났으면 자동 버전을 하나 남긴다.
// (저장은 0.8초마다 일어날 수 있어 매번 버전 목록을 읽지 않도록 다음 자동 버전 시각만 기억해 둔다)
let versionWarned = false;
let nextAutoVersionAt = null;
function autoVersion(doc) {
  if (!project.id) return;
  const now = Date.now();
  if (nextAutoVersionAt == null) {
    const last = store.versions.latest(project.id);
    nextAutoVersionAt = last ? last.ts + AUTO_INTERVAL_MS : 0;
  }
  if (now < nextAutoVersionAt) return;
  nextAutoVersionAt = now + AUTO_INTERVAL_MS;
  try { store.versions.add(project.id, doc, { auto: true, now }); } catch (e) {
    console.warn(e);
    if (!versionWarned) toast('저장 공간이 부족해 버전 기록을 남기지 못했습니다 (프로젝트 저장은 정상)');
    versionWarned = true;
  }
}

/** 홈 카드 썸네일 — 첫 화면(표지). 캡처 배경은 지금 캔버스가 표지일 때만 줄인 이미지를 얹는다 */
function coverThumb(doc) {
  const cover = docPages(doc)[0];
  return thumbnailSvg(cover.shapes, cover.canvas, { background: activePage === 0 ? bgThumbUrl() : null });
}

/** 실제로 저장소에 쓴다(동기). 실패하면 false */
function writeProject(sig, id = project.id, name = null) {
  try {
    const doc = currentDoc();
    const stored = store.meta(id);
    const meta = store.put({
      id, name: name ?? (stored?.name || project.name), doc,
      thumb: coverThumb(doc),
    });
    ensureBgThumb();
    setProject(meta.id, meta.name);
    autoVersion(doc);
    lastRev = meta.updatedAt;
    savedSig = sig;
    savedAtTs = meta.updatedAt;
    if (saveError) saveError = false;
    refreshStatus();
    return true;
  } catch (e) {
    console.error(e);
    if (!saveError) toast('브라우저 저장 공간이 부족합니다 · 홈에서 안 쓰는 프로젝트를 정리하거나 파일로 내보내주세요');
    saveError = true;
    refreshStatus();
    return false;
  }
}

/** 충돌 사본으로 저장(탭을 닫는 중처럼 물어볼 수 없을 때) — 지금 탭이 이 사본을 이어서 쓴다 */
function saveConflictCopy(sig) {
  const name = store.uniqueName(`${project.name || UNTITLED} (충돌 사본)`);
  const ok = writeProject(sig, store.newId(), name);
  if (ok) history.replaceState(null, '', `editor.html?p=${encodeURIComponent(project.id)}`);
  return ok;
}

async function resolveConflict(sig) {
  if (conflictOpen) return false;
  conflictOpen = true;
  const r = await showDialog({
    title: '다른 곳에서 이 프로젝트를 수정했어요',
    message: '다른 탭이나 창에서 같은 프로젝트를 먼저 고쳤습니다.\n이 탭의 내용으로 덮어쓸지, 사본으로 따로 남길지 선택하세요.',
    buttons: [
      { label: '내 변경 버리고 새로고침', action: 'reload', kind: 'danger' },
      { label: '사본으로 저장', action: 'copy' },
      { label: '이 탭 내용으로 덮어쓰기', action: 'overwrite', kind: 'primary' },
    ],
  });
  conflictOpen = false;
  if (!r) return false; // 취소 — 다음 변경 때 다시 묻는다
  if (r.action === 'reload') { location.reload(); return false; }
  if (r.action === 'copy') { const ok = saveConflictCopy(sig); if (ok) toast(`"${project.name}" 사본으로 저장했습니다`); return ok; }
  return writeProject(sig);
}

/** 대기 중인 변경을 저장한다. hidden=true 는 탭을 닫는 중이라 대화상자를 못 띄울 때 */
async function persist({ hidden = false } = {}) {
  clearTimeout(autosaveTimer);
  if (!booted || !project.id) return true;
  const sig = contentSig();
  if (sig === savedSig) { refreshStatus(); return true; }
  const stored = store.meta(project.id);
  if (stored && lastRev != null && stored.updatedAt !== lastRev) {
    return hidden ? saveConflictCopy(sig) : resolveConflict(sig);
  }
  return writeProject(sig);
}
const flush = () => { if (booted && !conflictOpen) persist({ hidden: true }); };
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

// 프로젝트 이름 입력 — 입력을 확정할 때(Enter·포커스 이동) 이름이 바뀐다
function commitProjectName() {
  const n = cleanName(projNm.value);
  if (!n || n === project.name) { projNm.value = project.name; return; }
  let meta = null;
  try { meta = store.rename(project.id, n); } catch (e) { console.error(e); }
  if (!meta) {
    toast('같은 이름의 프로젝트가 이미 있습니다');
    projNm.value = project.name;
    return;
  }
  setProject(meta.id, meta.name);
  refreshStatus();
  toast(`프로젝트 이름을 "${meta.name}"(으)로 바꿨습니다`);
}
projNm.addEventListener('change', commitProjectName);
projNm.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); projNm.blur(); }
  else if (e.key === 'Escape') { projNm.value = project.name; projNm.blur(); }
});

/** 지금 저장(Ctrl+S) — 자동 저장을 기다리지 않고 바로 */
async function saveNow() {
  if (document.activeElement === projNm) commitProjectName();
  const ok = await persist();
  if (ok) toast('저장했습니다');
}

/** 사본 만들기 — 지금 내용을 새 프로젝트로 저장하고 그 프로젝트를 연다 */
async function duplicateProject() {
  closeProjPop();
  await persist();
  const r = await showDialog({
    title: '사본 만들기',
    message: '지금 내용을 새 프로젝트로 복사합니다. 원래 프로젝트는 그대로 남습니다.',
    input: { label: '새 프로젝트 이름', value: store.uniqueName(`${project.name} 사본`), maxLength: 40 },
    buttons: [{ label: '취소', action: 'cancel' }, { label: '사본 만들기', action: 'ok', kind: 'primary' }],
  });
  if (!r || r.action !== 'ok') return;
  const copy = store.duplicate(project.id, cleanName(r.value) || undefined);
  if (!copy) { toast('사본을 만들지 못했습니다'); return; }
  location.href = `editor.html?p=${encodeURIComponent(copy.id)}`;
}

function exportFile() {
  const name = safeFileName(project.name || scrNm.value, 'screen');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(currentDoc(), null, 2)], { type: 'application/json' }));
  a.download = `${name}.hds.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); // 바로 해제하면 일부 브라우저에서 내려받기가 취소된다
  toast('파일로 내보냈습니다');
  closeProjPop();
}

// ── 프로젝트 메뉴 (홈 · 새로 만들기 · 저장 · 사본 · 내보내기 · 최근 프로젝트) ──
function renderRecent() {
  const box = $('projList');
  const list = sortProjects(store.list().filter((m) => m.id !== project.id), 'opened').slice(0, 6);
  if (!list.length) {
    box.replaceChildren(Object.assign(document.createElement('div'), { className: 'pop-empty', textContent: '다른 프로젝트가 없습니다' }));
    return;
  }
  box.replaceChildren(...list.map((m) => {
    const row = document.createElement('div');
    row.className = 'pop-item';
    const a = document.createElement('a');
    a.className = 'pop-item-main';
    a.href = `editor.html?p=${encodeURIComponent(m.id)}`;
    a.innerHTML = '<b></b><span></span>';
    a.querySelector('b').textContent = m.name;
    a.querySelector('span').textContent = `${metaLine(m)} · ${relTime(m.updatedAt)}`;
    row.append(a);
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
  if (open) renderRecent();
});
$('pHome').addEventListener('click', () => { location.href = '/'; });
$('pNew').addEventListener('click', () => { location.href = '/?new=1'; });
$('pSave').addEventListener('click', () => { closeProjPop(); saveNow(); });
$('pDup').addEventListener('click', duplicateProject);
$('btnExport').addEventListener('click', exportFile);
$('pVersions').addEventListener('click', () => { closeProjPop(); openVersions(); });

// ── 버전 기록 ─────────────────────────────────────────────
async function openVersions() {
  if (!project.id) return;
  await persist(); // 방금 고친 내용까지 저장된 상태에서 연다
  openVersionPanel({
    versions: store.versions,
    projectId: project.id,
    onSaveNamed: async (label) => {
      await persist();
      try {
        store.versions.add(project.id, currentDoc(), { label, auto: false });
        nextAutoVersionAt = null;
        toast(`"${label}" 버전으로 저장했습니다`);
        return true;
      } catch (e) {
        console.error(e);
        toast('저장 공간이 부족해 버전을 저장하지 못했습니다 · 오래된 버전을 지워 주세요');
        return false;
      }
    },
    onRestore: async (vid, meta) => {
      const doc = store.versions.get(project.id, vid);
      if (!doc) { toast('이 버전을 읽지 못했습니다'); return false; }
      await persist();
      // 복원 직전 상태도 버전으로 남겨 두어, 복원을 취소하고 싶으면 그 버전으로 다시 돌아갈 수 있게 한다
      let before = null;
      try { before = store.versions.add(project.id, currentDoc(), { label: '복원 직전', auto: false }); } catch (e) { console.warn(e); }
      nextAutoVersionAt = null;
      await applyDoc(doc, { project: { ...project } });
      savedSig = null; // 복원한 내용을 곧바로 저장한다
      await persist();
      const when = new Date(meta.ts);
      toast(`${when.getMonth() + 1}월 ${when.getDate()}일 ${fmtClock(meta.ts)} 버전으로 복원했습니다`, before ? {
        actionLabel: '복원 취소', ms: 7000,
        onAction: async () => {
          const prev = store.versions.get(project.id, before.id);
          if (!prev) return;
          await applyDoc(prev, { project: { ...project } });
          savedSig = null;
          await persist();
          toast('복원을 취소했습니다');
        },
      } : {});
      return true;
    },
    onOpenCopy: (vid, meta) => {
      const doc = store.versions.get(project.id, vid);
      if (!doc) { toast('이 버전을 읽지 못했습니다'); return; }
      const when = new Date(meta.ts);
      const label = meta.label || `${when.getMonth() + 1}.${when.getDate()} ${fmtClock(meta.ts)}`;
      try {
        const cover = docPages(doc)[0];
        const copy = store.create({ name: `${project.name || UNTITLED} (${label})`, doc, thumb: thumbnailSvg(cover.shapes, cover.canvas) });
        location.href = `editor.html?p=${encodeURIComponent(copy.id)}`;
      } catch (e) {
        console.error(e);
        toast('저장 공간이 부족해 사본을 만들지 못했습니다');
      }
    },
  });
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.savesbox') && !e.target.closest('.dlg-mask')) closeProjPop();
});
$('projPop').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeProjPop(); $('btnProj').focus(); }
});
// Ctrl+S 지금 저장 · Ctrl+Shift+S 사본 만들기 (브라우저의 "페이지 저장" 대신)
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
  e.preventDefault();
  if (isModalOpen()) return;
  if (e.shiftKey) duplicateProject(); else saveNow();
});

/** 페이지 하나를 캔버스에 연다(프로그램 로드 — 되돌리기 기록은 호출부가 정한다) */
function loadPage(pg) {
  if (pg.template && document.querySelector(`.tpl[data-tpl="${pg.template}"]`)) {
    currentTpl = pg.template;
    highlightTpl(pg.template);
  }
  loadCanvas(pg.shapes, pg.screenName ?? '새 화면', pg.canvas || DEFAULT_BOARD);
  baseBoardSize = pg.baseBoard || pg.canvas || DEFAULT_BOARD;
  if (typeof pg.background === 'string' && pg.background.startsWith('data:image/')) editor.setBoardBackground(pg.background);
  syncBgButtons();
  // "어떤 화면인가요?"(화면 유형)는 아직 비어 있는 화면에서만 의미가 있다 — 이미 그려 둔 화면에는 감춘다
  $('newBlock').hidden = (pg.shapes || []).length > 0;
}

/** 지금 화면을 pages[] 에 반영하고 편집 상태를 보관한다(화면을 옮기기 직전에 호출) */
function stashActive() {
  if (!pages[activePage]) return;
  pages[activePage] = capturePage();
  pageStates.set(pages[activePage].id, editor.exportState());
}

/** i 번째 화면을 연다. 전에 열었던 화면이면 요소·되돌리기 기록을 그대로 되살린다 */
function openPage(i) {
  activePage = i;
  const pg = pages[i];
  loadPage(pg);
  const st = pageStates.get(pg.id);
  if (st) {
    editor.importState(st);
    canvasBaseline = shapesSig();
  } else {
    editor.resetHistory();
  }
  // 되돌리기로 요소가 다시 사라졌을 수도 있으니 화면 유형 패널은 지금 상태로 다시 판단한다
  $('newBlock').hidden = editor.count() > 0;
  renderPageBar();
  scheduleAutosave();
}

function switchPage(i) {
  if (i === activePage || !pages[i]) return;
  stashActive();
  openPage(i);
}

function addPage() {
  if (pages.length >= MAX_PAGES) { toast(`화면은 ${MAX_PAGES}개까지 만들 수 있습니다`); return; }
  stashActive();
  const size = boardSizeFor('blank');
  pages.splice(activePage + 1, 0, normalizePage({
    screenName: `화면 ${pages.length + 1}`, template: 'blank', canvas: size, baseBoard: size, shapes: [],
  }));
  openPage(activePage + 1);
  toast('새 화면을 추가했습니다');
}

function duplicatePage(i) {
  if (pages.length >= MAX_PAGES) { toast(`화면은 ${MAX_PAGES}개까지 만들 수 있습니다`); return; }
  stashActive();
  const name = pages[i].screenName || '화면';
  pages.splice(i + 1, 0, clonePage(pages[i]));
  openPage(i + 1);
  toast(`"${name}" 을(를) 복제했습니다`);
}

function deletePage(i) {
  if (pages.length <= 1) { toast('화면이 하나뿐이라 삭제할 수 없습니다'); return; }
  stashActive();
  const [removed] = pages.splice(i, 1);
  const removedState = pageStates.get(removed.id);
  pageStates.delete(removed.id);
  if (i === activePage) openPage(Math.min(i, pages.length - 1));
  else { if (i < activePage) activePage--; renderPageBar(); scheduleAutosave(); }
  toast(`"${removed.screenName || '화면'}" 화면을 삭제했습니다`, {
    actionLabel: '되돌리기', ms: 6000,
    onAction: () => {
      stashActive();
      pages.splice(Math.min(i, pages.length), 0, removed);
      if (removedState) pageStates.set(removed.id, removedState);
      openPage(pages.indexOf(removed));
    },
  });
}

function movePageTo(from, to) {
  if (to < 0 || to >= pages.length || from === to) return;
  stashActive();
  const activeId = pages[activePage].id;
  pages = movePage(pages, from, to);
  activePage = pages.findIndex((pg) => pg.id === activeId);
  renderPageBar();
  scheduleAutosave();
}

/** 화면 띠에서 더블클릭 — 그 화면으로 옮긴 뒤 상단 이름 칸으로 보낸다 */
function renamePage(i) {
  if (i !== activePage) switchPage(i);
  scrNm.focus();
  scrNm.select();
}

pageBar = createPageBar($('pageBar'), {
  maxPages: MAX_PAGES,
  onSelect: switchPage, onAdd: addPage, onDuplicate: duplicatePage, onDelete: deletePage,
  onMove: movePageTo, onRename: renamePage,
  // 하단 도구 모음 버튼에 지금 화면 번호와 열림 상태를 비춘다
  onCollapsedChange: (collapsed, { active, total }) => {
    const b = $('btnPages');
    if (!b) return;
    b.textContent = `▤ ${active + 1}/${total}`;
    b.classList.toggle('on', !collapsed);
    b.setAttribute('aria-pressed', String(!collapsed));
    b.title = collapsed ? '화면 목록 보기' : '화면 목록 숨기기';
  },
});
function renderPageBar() { clearTimeout(pageBarTimer); pageBar?.render(livePages(), activePage); }
function schedulePageBar() { clearTimeout(pageBarTimer); pageBarTimer = setTimeout(renderPageBar, 400); }

// PageUp/PageDown — 이전/다음 화면
document.addEventListener('keydown', (e) => {
  if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
  if (isModalOpen() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
  const j = activePage + (e.key === 'PageDown' ? 1 : -1);
  if (j < 0 || j >= pages.length) return;
  e.preventDefault();
  switchPage(j);
});

/**
 * 저장된 내용(doc)으로 캔버스·시스템을 통째로 바꾼다(프로젝트를 열 때).
 * @param {{ project: {id:string,name:string}, savedTs?: number|null, message?: string|null }} opts
 */
async function applyDoc(doc, { project: p, savedTs = null, message = null, fresh = false }) {
  // v1(화면 하나)·v2(여러 화면) 어느 쪽이든 페이지 배열로 읽는다(doc-model.js)
  pages = docPages(doc);
  pageStates.clear();
  activePage = activeIndex(doc, pages);
  loadPage(pages[activePage]);
  if (fresh) $('newBlock').hidden = false; // 막 만든 프로젝트는 화면 유형을 바꿔 볼 수 있게
  editor.resetHistory(); // 이전 내용으로 Ctrl+Z 가 되돌아가지 않게
  setProject(p.id, p.name);
  renderPageBar();
  if (message) toast(message);

  if (doc.systemId) sysCombo.choose(doc.systemId, true);

  // 시스템 복원까지 끝난 뒤의 상태를 기준으로 삼아야 열자마자 "저장 중" 으로 뜨지 않는다
  markSaved(savedTs);
}

// ── payload / 생성 ────────────────────────────────────────
/** 화면(페이지) 하나 → 생성 payload */
function payloadFor(page) {
  const sys = sysCombo.get();
  const p = {
    systemId: sys?.id,
    systemName: sys?.name,
    // "신규/변경" 구분은 이제 프론트 개념이 아니다 — 백엔드 계약(screen-draft 스키마)은
    // 그대로 mode 필드를 요구하므로 항상 'new' 로 채운다.
    mode: 'new',
    template: page.template || 'blank',
    screenName: page.screenName || '새 화면',
    canvas: page.canvas,
    shapes: page.shapes || [],
  };
  if (page.background) p.background = page.background;
  return p;
}

function build() {
  if (!editor.count()) { toast('먼저 화면 요소를 배치해주세요'); return; }
  if (!sysCombo.get()) { toast('시스템을 선택해주세요'); return; }
  // 프로젝트의 화면을 모두 넘긴다 — 결과 창에서 좌우 화살표로 넘겨 볼 수 있고, PPT 산출물도 한 파일로 나온다.
  // 아직 아무것도 그리지 않은 빈 화면은 뺀다(지금 편집 중인 화면은 위에서 이미 요소가 있는지 확인했다).
  const list = livePages();
  const screens = [];
  let start = 0;
  list.forEach((pg, i) => {
    if (i !== activePage && !(pg.shapes || []).length) return;
    if (i === activePage) start = screens.length;
    screens.push({ title: pg.screenName || '생성 결과', payload: payloadFor(pg) });
  });
  runBuild(screens, start, { projectName: project.name });
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
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || isModalOpen()) return;
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
  const params = new URLSearchParams(location.search);
  const pid = params.get('p');
  const meta = pid ? store.meta(pid) : null;
  const doc = meta ? store.get(pid) : null;
  if (!meta || !doc) {
    // 프로젝트 없이 열렸거나 이미 지워진 프로젝트 — 홈에서 고르게 한다
    location.replace(pid ? '/?missing=1' : '/');
    return;
  }
  // 홈에서 방금 만든 프로젝트로 이동할 때만 붙는 신호(goEditorFresh) — 한 번 읽으면 주소에서 지운다
  const fresh = params.has('fresh');
  if (fresh) history.replaceState(null, '', `editor.html?p=${encodeURIComponent(pid)}`);

  editor.initEditor({
    onChange: () => { if (!canvasDirty && shapesSig() !== canvasBaseline) canvasDirty = true; scheduleAutosave(); },
    isBlocked: isModalOpen,
    onHandTool: (on) => {
      const b = $('btnHand');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    },
  });
  initResultModal();
  initHelp();

  if (meta.trashedAt) store.restore(pid); // 휴지통 항목을 주소로 열면 꺼내서 연다
  store.touchOpened(pid);
  const opened = store.meta(pid) || meta;

  const systems = sysStore.list();
  sysCombo.setItems(systems.map((s) => ({ id: s.id, name: s.name })));

  await applyDoc(doc, { project: { id: pid, name: opened.name }, savedTs: meta.updatedAt, fresh });
  // 이번에 고치기 전의 상태를 버전으로 남겨 둔다(버전이 없거나 마지막 버전이 10분 넘게 지났을 때만)
  try { if (store.versions.dueForAuto(pid)) store.versions.add(pid, doc, { auto: true }); } catch (e) { console.warn(e); }
  // 시스템이 정해지지 않은 프로젝트(파일에서 가져온 것 등)는 기본 시스템을 골라 준다
  if (!doc.systemId && systems.length) {
    sysCombo.choose(systems.find((s) => s.id === 'salesportal') ? 'salesportal' : systems[0].id);
  }
  booted = true;
  refreshStatus();
}

boot();
