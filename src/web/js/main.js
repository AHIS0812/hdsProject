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
function applyMode() {
  $('editBlock').classList.toggle('hidden', workMode !== 'edit');
  $('tplH').textContent = workMode === 'edit' ? '화면 유형' : '어떤 화면인가요?';
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

// ── 화면 유형 ─────────────────────────────────────────────
function highlightTpl(key) {
  document.querySelectorAll('.tpl').forEach((x) => x.classList.toggle('on', x.dataset.tpl === key));
}
document.querySelectorAll('.tpl').forEach((el) => {
  el.addEventListener('click', () => {
    const key = el.dataset.tpl;
    if (workMode === 'new') {
      // 신규: 유형 선택 = 프리셋 로드
      if (editor.count() && !confirm('화면 종류를 바꾸면 지금 그린 내용이 사라집니다. 계속할까요?')) return;
      currentTpl = key;
      highlightTpl(key);
      editor.setShapes(templateShapes(key));
    } else {
      // 변경: 유형 재분류만 (캔버스 유지)
      currentTpl = key;
      highlightTpl(key);
      toast(`화면 유형을 "${el.querySelector('.nm').textContent.trim()}" 로 지정했습니다`);
    }
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
      // 화면 유형도 선택한 화면에 맞춰 자동 반영
      if (def.template) {
        currentTpl = def.template;
        highlightTpl(def.template);
      }
      syncAbL();
      autosave();
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
  if (currentTpl) p.template = currentTpl;
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

  if (saved.mode === 'edit') {
    workMode = 'edit';
    document.querySelectorAll('#modeSeg div').forEach((x) => x.classList.toggle('on', x.dataset.mode === 'edit'));
    applyMode();
  }
  if (saved.template) {
    currentTpl = saved.template;
    highlightTpl(saved.template);
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
