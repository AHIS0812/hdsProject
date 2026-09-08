// "화면 생성" 결과 모달 — [화면] Preview / [전달 데이터] payload / [WebSquare XML].
// 개발지시서 U-7, U-8. 결과는 POST /api/generate 응답에서 온다 (mock 서버는 fixtures 반환).

import * as api from './api.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STEPS = ['배치된 요소 해석', '보충 설명 · 첨부 파일 반영', '사내 표준 컴포넌트 치환', 'WebSquare XML 변환 및 검증'];

let last = { payload: null, result: null };

function mask() { return $('mask'); }
function mbody() { return $('mbody'); }

export function closeModal() {
  mask().classList.remove('on');
}

function showProgress() {
  const wrap = document.createElement('div');
  wrap.className = 'load';
  wrap.innerHTML = '<div class="spin"></div>';
  const stp = document.createElement('div');
  stp.className = 'stp';
  STEPS.forEach((t) => {
    const d = document.createElement('div');
    d.textContent = t;
    stp.append(d);
  });
  wrap.append(stp);
  mbody().replaceChildren(wrap);
  let i = 0;
  const timer = setInterval(() => {
    const ds = stp.children;
    if (i > 0) ds[i - 1].className = 'done';
    if (i < ds.length) { ds[i].className = 'now'; i++; }
    else clearInterval(timer);
  }, 500);
  return () => clearInterval(timer);
}

function renderTab(p) {
  const b = mbody();
  const r = last.result || {};
  if (p === 'j') {
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(last.payload, null, 2);
    b.replaceChildren(pre);
    return;
  }
  if (p === 'x') {
    const pre = document.createElement('pre');
    pre.textContent = r.code?.websquareXml || '(WebSquare XML 없음)';
    b.replaceChildren(pre);
    return;
  }
  // 'v' — 화면
  if (r.status === 'error') {
    const pre = document.createElement('pre');
    pre.className = 'err';
    pre.textContent = '생성 실패\n\n' + (r.error?.message || '') + '\n\n' + (r.error?.log || '');
    b.replaceChildren(pre);
    return;
  }
  if (r.status === 'needs_input') {
    const pre = document.createElement('pre');
    pre.textContent = '추가 확인이 필요합니다:\n\n' +
      (r.questions || []).map((q) => `• ${q.question}` + (q.options ? `  [${q.options.join(' / ')}]` : '')).join('\n');
    b.replaceChildren(pre);
    return;
  }
  const html = r.preview?.html;
  if (!html) {
    b.innerHTML = '<pre>(preview HTML 없음)</pre>';
    return;
  }
  const frame = document.createElement('iframe');
  frame.srcdoc = html;
  b.replaceChildren(frame);
}

function setTab(p) {
  document.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('on', x.dataset.p === p));
  renderTab(p);
}

function download() {
  const r = last.result || {};
  const xml = r.code?.websquareXml;
  if (!xml) return;
  const name = (last.payload?.screenName || 'screen').replace(/[\\/:*?"<>|]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  a.download = `${name}.xml`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * @param {object} payload  화면정의 payload
 * @param {string} title    모달 제목
 */
export async function runBuild(payload, title) {
  $('mTitle').textContent = title;
  mask().classList.add('on');
  document.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('on', x.dataset.p === 'v'));
  const stopProgress = showProgress();
  try {
    const result = await api.generate(payload);
    last = { payload, result };
    stopProgress();
    setTab('v');
  } catch (e) {
    stopProgress();
    const pre = document.createElement('pre');
    pre.className = 'err';
    pre.textContent = e.message;
    mbody().replaceChildren(pre);
  }
}

export function initResultModal() {
  $('mClose').addEventListener('click', closeModal);
  $('mDownload').addEventListener('click', download);
  document.querySelectorAll('.mtab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.p)));
  mask().addEventListener('mousedown', (e) => { if (e.target === mask()) closeModal(); });
}
