// 화면 스케치 스튜디오 — 에디터 조립. 담당 2.
// 예시 프로토타입(samples/화면스케치스튜디오_예시_v1.html)을 src/web 모듈 구조로 이전.

import { COMPS, DEFAULT_BOARD, boardSizeFor } from './constants.js';
import * as api from './api.js';
import * as editor from './editor.js';
import { makeCombo } from './combobox.js';
import { templateShapes } from './templates.js';
import { initResultModal, runBuild } from './result-modal.js';
import { toast } from './toast.js';

const $ = (id) => document.getElementById(id);
const scrNm = $('scrNm');
const noteEl = $('prompt');
const abL = $('abL');

let workMode = 'new';
let currentTpl = 'list';
let attachments = [];
let loadedScreenId = null;   // 변경 모드에서 현재 캔버스에 로드된 화면 id
// 사용자가 캔버스를 직접 수정했는지. 템플릿/화면/샘플을 "프로그램으로" 로드한 직후엔 false.
// true 일 때만 다른 템플릿·화면으로 전환 시 확인을 묻는다.
let canvasDirty = false;

const STORE_KEY = 'aiScreenDraft:v1';

/**
 * 캔버스를 새 shapes 로 교체 (프로그램 로드 — dirty 아님)
 * @param {object} [size] { w, h } — 지정 시 보드 크기도 변경
 */
function loadCanvas(shapes, name, size) {
  if (size && (size.w || size.h)) editor.setBoardSize(size.w || DEFAULT_BOARD.w, size.h || DEFAULT_BOARD.h);
  editor.setShapes(shapes || []);
  if (name != null) scrNm.value = name;
  syncAbL();
  canvasDirty = false;
  autosave();
}

/**
 * 캔버스를 교체하기 직전에 호출. 사용자가 직접 편집한 내용이 있으면
 * "되돌리기로 복구 가능" 안내만 띄운다. (confirm 대신 — undo 히스토리가 복구를 보장)
 */
function noteReplace() {
  if (canvasDirty && editor.count() > 0) {
    toast('이전 캔버스는 되돌리기(Ctrl+Z)로 복구할 수 있어요');
  }
}


// ── 상단 바 ───────────────────────────────────────────────
function syncAbL() {
  const { w, h } = editor.getBoardSize();
  abL.textContent = (scrNm.value || '제목 없음') + '  ';
  const span = document.createElement('span');
  span.textContent = `${w} × ${h}`;
  abL.append(span);
}
scrNm.addEventListener('input', () => { syncAbL(); autosave(); });

$('btnClear').addEventListener('click', () => {
  if (!editor.count()) return;
  editor.clearShapes();
  toast('캔버스를 비웠습니다 · 되돌리기(Ctrl+Z)로 복구');
});
$('btnBuild').addEventListener('click', build);

// ── 요소 팔레트 ───────────────────────────────────────────
const clist = $('clist');
clist.replaceChildren(
  ...COMPS.map((c) => {
    const el = document.createElement('div');
    el.className = 'ci';
    el.innerHTML = `${c.g}<div class="t">${c.n}</div>`;
    el.addEventListener('click', () => editor.addComponent(c.t));
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
  autosave();
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
document.querySelectorAll('#modeSeg div').forEach((el) => {
  el.addEventListener('click', () => {
    document.querySelectorAll('#modeSeg div').forEach((x) => x.classList.remove('on'));
    el.classList.add('on');
    workMode = el.dataset.mode;
    applyMode();
    autosave();
  });
});

// ── 화면 유형 (신규 모드) ─────────────────────────────────
function highlightTpl(key) {
  document.querySelectorAll('.tpl').forEach((x) => x.classList.toggle('on', x.dataset.tpl === key));
}
document.querySelectorAll('.tpl').forEach((el) => {
  el.addEventListener('click', () => {
    if (workMode !== 'new') return;
    const key = el.dataset.tpl;
    if (key === currentTpl && !canvasDirty) { highlightTpl(key); return; }
    noteReplace();
    currentTpl = key;
    highlightTpl(key);
    // 방금까지 기존 화면을 보고 있었다면 이름을 새 화면 기본값으로
    loadCanvas(templateShapes(key), loadedScreenId ? '새 화면' : undefined, boardSizeFor(key));
    loadedScreenId = null;
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
    if (!sys) return;
    try {
      const screens = await api.getScreens(sys.id);
      scrCombo.setItems(screens.map((s) => ({ id: s.id, name: s.name, sub: s.template })));
      scrCombo.setPlaceholder(screens.length ? '화면 선택' : '등록된 화면이 없습니다');
    } catch (e) {
      toast('화면 목록을 불러오지 못했습니다');
      console.error(e);
    }
    autosave();
  },
});

const scrCombo = makeCombo($('scrBox'), {
  placeholder: '화면 선택',
  emptyText: '해당 시스템에 등록된 화면이 없습니다',
  // 변경 모드에서 화면을 고르는 건 "그 화면을 보여줘" 라는 뜻이므로 확인 없이 바로 로드한다.
  onPick: async (scr) => {
    if (!scr || scr.id === loadedScreenId) return;
    try {
      const def = await api.getScreen(scr.id);
      loadCanvas(def.shapes || [], def.name || scr.name, def.canvas || DEFAULT_BOARD);
      loadedScreenId = scr.id;
    } catch (e) {
      toast('화면을 불러오지 못했습니다');
      console.error(e);
    }
  },
});

// ── 참고 파일 업로드 (U-11) ───────────────────────────────
const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls,.csv,.ppt,.pptx,.pdf';
const MAX_BYTES = 20 * 1024 * 1024;
const drop = $('drop');
const DROP_LABEL = '＋ 참고 파일 (Excel · PPT · 이미지 · PDF, 20MB 이하)';
drop.textContent = DROP_LABEL;

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.multiple = true;
fileInput.accept = ACCEPT;
fileInput.hidden = true;
document.body.append(fileInput);

const fmtSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');

async function uploadFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  const big = files.filter((f) => f.size > MAX_BYTES);
  if (big.length) toast(`20MB 초과로 제외: ${big.map((f) => f.name).join(', ')}`);
  const ok = files.filter((f) => f.size <= MAX_BYTES);
  if (!ok.length) return;

  const form = new FormData();
  ok.forEach((f) => form.append('files', f));
  drop.textContent = `업로드 중… (${ok.length}개)`;
  drop.style.pointerEvents = 'none';
  try {
    const r = await fetch('/api/attachments', { method: 'POST', body: form });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `업로드 실패 (${r.status})`);
    attachments.push(...(body.attachments || []));
    drawFiles();
    autosave();
  } catch (e) {
    toast(e.message);
  } finally {
    drop.textContent = DROP_LABEL;
    drop.style.pointerEvents = '';
  }
}

drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  uploadFiles(fileInput.files);
  fileInput.value = '';
});
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }),
);
['dragleave', 'dragend'].forEach((ev) =>
  drop.addEventListener(ev, () => drop.classList.remove('drag')),
);
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('drag');
  uploadFiles(e.dataTransfer.files);
});

async function removeAttachment(i) {
  const a = attachments[i];
  attachments.splice(i, 1);
  drawFiles();
  autosave();
  if (a?.id) fetch(`/api/attachments/${encodeURIComponent(a.id)}`, { method: 'DELETE' }).catch(() => {});
}

function drawFiles() {
  $('files').replaceChildren(
    ...attachments.map((a, i) => {
      const row = document.createElement('div');
      row.className = 'file';
      row.textContent = `▤ ${a.name}` + (a.size ? `  ·  ${fmtSize(a.size)}` : '');
      const x = document.createElement('b');
      x.textContent = '✕';
      x.title = '삭제';
      x.addEventListener('click', () => removeAttachment(i));
      row.append(x);
      return row;
    }),
  );
}

// ── 내보내기 / 불러오기 (.hds.json) ──────────────────────
function currentDoc() {
  return {
    app: 'hds',
    version: 1,
    savedAt: new Date().toISOString(),
    screenName: scrNm.value,
    systemId: sysCombo.get()?.id || null,
    mode: workMode,
    template: currentTpl,
    note: noteEl.value,
    canvas: editor.getBoardSize(),
    attachments,
    shapes: editor.toPayloadShapes(),
  };
}

// 파일로 내보내기
$('btnExport').addEventListener('click', () => {
  const name = (scrNm.value || 'screen').replace(/[\\/:*?"<>|]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(currentDoc(), null, 2)], { type: 'application/json' }));
  a.download = `${name}.hds.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('파일로 내보냈습니다');
  closeSavesPop();
});

// 파일에서 불러오기
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
  applyDoc(doc);
  closeSavesPop();
});

// ── 이름 붙인 저장본 (localStorage 슬롯) ──────────────────
const SLOT_INDEX = 'hds:saves';
const slotKey = (id) => 'hds:save:' + id;

function listSlots() {
  try { return JSON.parse(localStorage.getItem(SLOT_INDEX) || '[]'); } catch { return []; }
}
function writeIndex(list) {
  try { localStorage.setItem(SLOT_INDEX, JSON.stringify(list)); } catch { /* 용량 초과 */ }
}
function saveSlot() {
  const name = $('saveName').value.trim();
  if (!name) { toast('저장본 이름을 입력하세요'); $('saveName').focus(); return; }
  const list = listSlots();
  const existing = list.find((s) => s.name === name);
  const id = existing?.id || 's' + Date.now().toString(36);
  try {
    localStorage.setItem(slotKey(id), JSON.stringify(currentDoc()));
  } catch {
    toast('브라우저 저장 공간이 부족합니다');
    return;
  }
  const meta = {
    id, name, updatedAt: Date.now(),
    screenName: scrNm.value, mode: workMode, shapes: editor.count(),
  };
  writeIndex([meta, ...list.filter((s) => s.id !== id)]);
  $('saveName').value = '';
  renderSlots();
  toast(existing ? `"${name}" 갱신됨` : `"${name}" 저장됨`);
}
function loadSlot(id) {
  let doc;
  try { doc = JSON.parse(localStorage.getItem(slotKey(id)) || 'null'); } catch { doc = null; }
  if (!doc) { toast('저장본을 찾지 못했습니다'); return; }
  applyDoc(doc);
  closeSavesPop();
}
function deleteSlot(id) {
  try { localStorage.removeItem(slotKey(id)); } catch { /* 무시 */ }
  writeIndex(listSlots().filter((s) => s.id !== id));
  renderSlots();
}
function fmtWhen(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function renderSlots() {
  const box = $('saveList');
  const list = listSlots();
  if (!list.length) {
    box.replaceChildren(Object.assign(document.createElement('div'), { className: 'pop-empty', textContent: '저장한 항목이 없습니다' }));
    return;
  }
  box.replaceChildren(...list.map((s) => {
    const row = document.createElement('div');
    row.className = 'pop-item';
    const main = document.createElement('button');
    main.className = 'pop-item-main';
    main.innerHTML = `<b></b><span></span>`;
    main.querySelector('b').textContent = s.name;
    main.querySelector('span').textContent =
      `${s.screenName || '제목 없음'} · ${s.mode === 'edit' ? '변경' : '신규'} · 요소 ${s.shapes ?? 0} · ${fmtWhen(s.updatedAt)}`;
    main.addEventListener('click', () => loadSlot(s.id));
    const del = document.createElement('button');
    del.className = 'pop-item-del';
    del.textContent = '✕';
    del.title = '삭제';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteSlot(s.id); });
    row.append(main, del);
    return row;
  }));
}

function closeSavesPop() {
  $('savesPop').hidden = true;
  $('btnSaves').classList.remove('on');
}
$('btnSaves').addEventListener('click', () => {
  const pop = $('savesPop');
  const open = pop.hidden;
  pop.hidden = !open;
  $('btnSaves').classList.toggle('on', open);
  if (open) { renderSlots(); $('saveName').focus(); }
});
$('saveNow').addEventListener('click', saveSlot);
$('saveName').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSlot(); });
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.savesbox')) closeSavesPop();
});

function applyDoc(doc) {
  if (!doc || !Array.isArray(doc.shapes)) {
    toast('형식이 맞지 않는 파일입니다');
    return;
  }
  noteEl.value = doc.note || '';
  attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
  drawFiles();

  workMode = doc.mode === 'edit' ? 'edit' : 'new';
  document.querySelectorAll('#modeSeg div').forEach((x) => x.classList.toggle('on', x.dataset.mode === workMode));
  applyMode();

  if (doc.template && document.querySelector(`.tpl[data-tpl="${doc.template}"]`)) {
    currentTpl = doc.template;
    highlightTpl(doc.template);
  }

  loadCanvas(doc.shapes, doc.screenName || '새 화면', doc.canvas || DEFAULT_BOARD);
  loadedScreenId = null;
  if (doc.systemId) sysCombo.choose(doc.systemId);

  const hasFileRefs = attachments.some((a) => a.url);
  toast(hasFileRefs ? '불러왔습니다 · 첨부 파일 실물은 포함되지 않습니다' : '불러왔습니다');
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
  const note = noteEl.value.trim();
  if (note) p.note = note;
  if (attachments.length) p.attachments = attachments;
  return p;
}

/** 생성 요청 직전 캔버스 모습 스냅샷 (결과 모달의 "내 스케치" 비교용) */
function snapshotSketch() {
  const { w, h } = editor.getBoardSize();
  const clone = $('board').cloneNode(true);
  clone.querySelectorAll('.hh,.gd,.marq,#hint,.coach').forEach((e) => e.remove());
  clone.querySelectorAll('.sh.sel').forEach((e) => e.classList.remove('sel'));
  return { html: clone.innerHTML, w, h };
}

function build() {
  if (!editor.count()) { toast('먼저 화면 요소를 배치해주세요'); return; }
  if (!sysCombo.get()) { toast('시스템을 선택해주세요'); return; }
  if (workMode === 'edit' && !scrCombo.get()) { toast('변경할 화면을 선택해주세요'); return; }
  runBuild(payload(), scrNm.value || '생성 결과', snapshotSketch());
}

// ── 임시저장 (localStorage) ───────────────────────────────
let saveTimer;
let savedFlashTimer;
function flashSaved() {
  const el = $('autosaveHint');
  if (!el) return;
  el.textContent = '저장됨';
  el.classList.add('on');
  clearTimeout(savedFlashTimer);
  savedFlashTimer = setTimeout(() => { el.textContent = '자동 저장'; el.classList.remove('on'); }, 1200);
}
function autosave(immediate) {
  clearTimeout(saveTimer);
  const doSave = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        screenName: scrNm.value,
        systemId: sysCombo.get()?.id || null,
        mode: workMode,
        template: currentTpl,
        note: noteEl.value,
        attachments,
        canvas: editor.getBoardSize(),
        shapes: editor.toPayloadShapes(),
      }));
      flashSaved();
    } catch { /* 프라이빗 모드 등 — 무시 */ }
  };
  if (immediate) doSave();
  else saveTimer = setTimeout(doSave, 600);
}

function restore() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch { saved = null; }
  if (!saved) return false;

  if (saved.screenName) scrNm.value = saved.screenName;
  if (saved.note) noteEl.value = saved.note;
  attachments = Array.isArray(saved.attachments) ? saved.attachments : [];
  drawFiles();

  if (saved.mode === 'edit') {
    workMode = 'edit';
    document.querySelectorAll('#modeSeg div').forEach((x) => x.classList.toggle('on', x.dataset.mode === 'edit'));
    applyMode();
  }
  if (saved.template && document.querySelector(`.tpl[data-tpl="${saved.template}"]`)) {
    currentTpl = saved.template;
    highlightTpl(saved.template);
  }
  if (saved.canvas?.w && saved.canvas?.h) editor.setBoardSize(saved.canvas.w, saved.canvas.h);
  if (Array.isArray(saved.shapes) && saved.shapes.length) editor.setShapes(saved.shapes);
  return { systemId: saved.systemId };
}

// ── 온보딩 코치 / 단축키 도움말 ──────────────────────────
function initHelp() {
  const helpPop = $('helpPop');
  const toggleHelp = () => { helpPop.hidden = !helpPop.hidden; };
  $('btnHelp').addEventListener('click', toggleHelp);
  $('helpClose').addEventListener('click', () => { helpPop.hidden = true; });
  document.addEventListener('mousedown', (e) => {
    if (!helpPop.hidden && !helpPop.contains(e.target) && e.target.id !== 'btnHelp') helpPop.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    if (e.key === '?') { e.preventDefault(); toggleHelp(); }
    else if (e.key === 'Escape' && !helpPop.hidden) helpPop.hidden = true;
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
  editor.initEditor({ onChange: () => { canvasDirty = true; autosave(); } });
  initResultModal();
  initHelp();

  const restored = restore();
  applyMode();
  if (!restored) {
    // 최초 실행: 선택된 유형(목록조회)의 프리셋을 올려 타일 ↔ 캔버스 상태를 맞춘다
    loadCanvas(templateShapes(currentTpl), '새 화면', boardSizeFor(currentTpl));
  }
  syncAbL();
  canvasDirty = false; // 부팅 시점의 로드는 사용자 수정이 아님

  try {
    const systems = await api.getSystems();
    sysCombo.setItems(systems.map((s) => ({ id: s.id, name: s.name, sub: s.sub })));
    const want = restored?.systemId || (systems.find((s) => s.id === 'portal') ? 'portal' : systems[0]?.id);
    if (want) sysCombo.choose(want);
  } catch (e) {
    toast('API 서버에 연결하지 못했습니다 — npm run dev 로 실행했는지 확인하세요');
    console.error(e);
  }
}

boot();
