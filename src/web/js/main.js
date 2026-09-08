// 화면 스케치 스튜디오 — 에디터 조립. 담당 2.
// 예시 프로토타입(samples/화면스케치스튜디오_예시_v1.html)을 src/web 모듈 구조로 이전.

import { COMPS } from './constants.js';
import * as api from './api.js';
import * as editor from './editor.js';
import { makeCombo } from './combobox.js';
import { templateShapes, sampleShapes } from './templates.js';
import { initResultModal, runBuild } from './result-modal.js';

const $ = (id) => document.getElementById(id);
const scrNm = $('scrNm');
const noteEl = $('prompt');
const abL = $('abL');

let workMode = 'new';
let currentTpl = 'list';
let attachments = [];

const STORE_KEY = 'aiScreenDraft:v1';
const CANVAS = { w: 960, h: 600 };

// ── 토스트 ────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

// ── 상단 바 ───────────────────────────────────────────────
function syncAbL() {
  abL.textContent = (scrNm.value || '제목 없음') + '  ';
  const span = document.createElement('span');
  span.textContent = `${CANVAS.w} × ${CANVAS.h}`;
  abL.append(span);
}
scrNm.addEventListener('input', () => { syncAbL(); autosave(); });

$('btnSample').addEventListener('click', () => {
  if (editor.count() && !confirm('샘플을 불러오면 지금 그린 내용이 사라집니다. 계속할까요?')) return;
  editor.setShapes(sampleShapes());
  scrNm.value = '지정대리인 등록';
  syncAbL();
  autosave();
});

$('btnSave').addEventListener('click', () => { autosave(true); toast('임시저장되었습니다'); });
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

// ── 하단 툴바 ─────────────────────────────────────────────
const TOOL = {
  undo: editor.undo, redo: editor.redo,
  zoomIn: () => editor.zoomBy(10), zoomOut: () => editor.zoomBy(-10), zoomReset: editor.zoomReset,
  clear: () => {
    if (editor.count() && !confirm('캔버스를 전부 비울까요?')) return;
    editor.clearShapes();
  },
};
document.querySelector('.tools').addEventListener('click', (e) => {
  const act = e.target.closest('button')?.dataset.act;
  TOOL[act]?.();
  autosave();
});

// ── 작업 구분 (신규 / 변경) ───────────────────────────────
document.querySelectorAll('#modeSeg div').forEach((el) => {
  el.addEventListener('click', () => {
    document.querySelectorAll('#modeSeg div').forEach((x) => x.classList.remove('on'));
    el.classList.add('on');
    workMode = el.dataset.mode;
    $('newBlock').classList.toggle('hidden', workMode !== 'new');
    $('editBlock').classList.toggle('hidden', workMode !== 'edit');
    autosave();
  });
});

// ── 화면 유형 템플릿 (신규 모드) ──────────────────────────
document.querySelectorAll('.tpl').forEach((el) => {
  el.addEventListener('click', () => {
    if (editor.count() && !confirm('화면 종류를 바꾸면 지금 그린 내용이 사라집니다. 계속할까요?')) return;
    document.querySelectorAll('.tpl').forEach((x) => x.classList.remove('on'));
    el.classList.add('on');
    currentTpl = el.dataset.tpl;
    editor.setShapes(templateShapes(currentTpl));
    autosave();
  });
});

// ── 시스템 / 변경화면 콤보박스 ────────────────────────────
const sysCombo = makeCombo($('sysBox'), {
  placeholder: '시스템 선택',
  emptyText: '시스템이 없습니다',
  onPick: async (sys) => {
    scrCombo.setItems([]);
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
  onPick: async (scr) => {
    if (!scr) return;
    if (editor.count() && !confirm('선택한 화면을 불러오면 지금 그린 내용이 사라집니다. 계속할까요?')) return;
    try {
      const def = await api.getScreen(scr.id);
      editor.setShapes(def.shapes || []);
      scrNm.value = def.name || scr.name;
      syncAbL();
      autosave();
    } catch (e) {
      toast('화면을 불러오지 못했습니다');
      console.error(e);
    }
  },
});

// ── 참고 파일 (이름만 수집, 업로드는 U-11) ────────────────
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.multiple = true;
fileInput.hidden = true;
document.body.append(fileInput);
$('drop').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  for (const f of fileInput.files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const kind = ['xlsx', 'xls', 'csv'].includes(ext) ? 'excel'
      : ['ppt', 'pptx'].includes(ext) ? 'ppt'
      : ['png', 'jpg', 'jpeg', 'gif'].includes(ext) ? 'image' : 'other';
    attachments.push({ id: 'att-' + (attachments.length + 1), name: f.name, kind });
  }
  fileInput.value = '';
  drawFiles();
  autosave();
});
function drawFiles() {
  $('files').replaceChildren(
    ...attachments.map((a, i) => {
      const row = document.createElement('div');
      row.className = 'file';
      row.textContent = '▤ ' + a.name;
      const x = document.createElement('b');
      x.textContent = '✕';
      x.addEventListener('click', () => { attachments.splice(i, 1); drawFiles(); autosave(); });
      row.append(x);
      return row;
    }),
  );
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
    canvas: { ...CANVAS },
    shapes: editor.toPayloadShapes(),
  };
  if (workMode === 'new') p.template = currentTpl;
  if (workMode === 'edit' && scr) p.baseScreen = { id: scr.id, name: scr.name };
  const note = noteEl.value.trim();
  if (note) p.note = note;
  if (attachments.length) p.attachments = attachments;
  return p;
}

function build() {
  if (!editor.count()) { toast('먼저 화면 요소를 배치해주세요'); return; }
  if (!sysCombo.get()) { toast('시스템을 선택해주세요'); return; }
  if (workMode === 'edit' && !scrCombo.get()) { toast('변경할 화면을 선택해주세요'); return; }
  runBuild(payload(), scrNm.value || '생성 결과');
}

// ── 임시저장 (localStorage) ───────────────────────────────
let saveTimer;
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
        shapes: editor.toPayloadShapes(),
      }));
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

  if (saved.mode === 'edit') document.querySelector('#modeSeg [data-mode="edit"]').click();
  if (saved.template) {
    const tile = document.querySelector(`.tpl[data-tpl="${saved.template}"]`);
    if (tile) {
      document.querySelectorAll('.tpl').forEach((x) => x.classList.remove('on'));
      tile.classList.add('on');
      currentTpl = saved.template;
    }
  }
  if (Array.isArray(saved.shapes) && saved.shapes.length) editor.setShapes(saved.shapes);
  return { systemId: saved.systemId };
}

// ── 부팅 ─────────────────────────────────────────────────
async function boot() {
  editor.initEditor({ onChange: () => autosave() });
  initResultModal();

  const restored = restore();
  syncAbL();

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
