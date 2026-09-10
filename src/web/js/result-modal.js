// "화면 생성" 결과 모달 — [화면] Preview / [전달 데이터] payload / [WebSquare XML]
// + 질문 응답 / 자연어 수정 요청 → /api/refine.
// 개발지시서 U-7, U-8, U-9. 결과는 POST /api/generate|refine 응답에서 온다.

import * as api from './api.js';
import { toast } from './toast.js';
import { highlightXml } from './highlight.js';

const $ = (id) => document.getElementById(id);

const STEPS = ['배치된 요소 해석', '보충 설명 · 첨부 파일 반영', '사내 표준 컴포넌트 치환', 'WebSquare XML 변환 및 검증'];

// last.payload = 최초 생성 payload, last.result = 가장 최근 결과 (generate/refine 공통)
// last.sketch = 생성 요청 시점의 캔버스 스냅샷 { html, w, h } — "내 스케치" 비교용
let last = { payload: null, result: null, sketch: null };
let currentTab = 'v';
let viewMode = 'after';   // 화면 탭 보기: after(결과) | split(동시 보기 — 내 스케치 + 결과)

const mask = () => $('mask');
const mbody = () => $('mbody');
const mfoot = () => $('mfoot');

let lastFocus = null; // 모달 열기 전 포커스 (닫을 때 복원)

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusablesIn(el) {
  return [...el.querySelectorAll(FOCUSABLE)].filter(
    (n) => !n.hidden && n.offsetParent !== null && !n.closest('[hidden]'),
  );
}

// Tab 이 모달 밖으로 못 나가게 가둔다
function trapTab(e) {
  if (e.key !== 'Tab') return;
  const modal = mask().querySelector('.modal');
  const items = focusablesIn(modal);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function onModalKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
  trapTab(e);
}

export function openModal() {
  lastFocus = document.activeElement;
  mask().classList.add('on');
  document.addEventListener('keydown', onModalKeydown, true);
}

export function closeModal() {
  mask().classList.remove('on');
  document.removeEventListener('keydown', onModalKeydown, true);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  lastFocus = null;
}

function showProgress(label) {
  const wrap = document.createElement('div');
  wrap.className = 'load';
  wrap.innerHTML = '<div class="spin"></div>';
  const stp = document.createElement('div');
  stp.className = 'stp';
  (label ? [label] : STEPS).forEach((t) => {
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

// ── 탭 본문 ───────────────────────────────────────────────
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
    const xml = r.code?.websquareXml;
    const pre = document.createElement('pre');
    pre.className = 'xml';
    if (xml) pre.innerHTML = highlightXml(xml);
    else pre.textContent = '(WebSquare XML 없음)';
    const wrap = document.createElement('div');
    wrap.className = 'xmlwrap';
    wrap.append(pre);
    const files = r.code?.files || [];
    if (files.length) {
      const note = document.createElement('div');
      note.className = 'xmlfiles';
      const how = files.length > 1 ? '[내려받기] 로 zip 저장' : '[내려받기] 로 파일 저장';
      note.textContent = `생성 파일 ${files.length}개: ` + files.map((f) => f.path).join(', ') + ` · ${how}`;
      wrap.append(note);
    }
    b.replaceChildren(wrap);
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
    pre.textContent = '아래 질문에 답하면 반영해서 다시 생성합니다.';
    b.replaceChildren(pre);
    return;
  }
  const html = r.preview?.html;

  if (viewMode === 'split' && last.sketch) {
    b.replaceChildren(buildCompare(html));
    return;
  }
  if (!html) {
    b.innerHTML = '<pre>(preview HTML 없음)</pre>';
    return;
  }
  const frame = document.createElement('iframe');
  frame.srcdoc = html;
  b.replaceChildren(frame);
}

/** 스케치 스냅샷을 컨테이너 폭에 맞춰 축소해 붙인다 */
function mountSketch(host) {
  const { html, w, h } = last.sketch;
  const wrap = document.createElement('div');
  wrap.className = 'sketchwrap';
  const inner = document.createElement('div');
  inner.className = 'sketchscale';
  inner.style.cssText = `width:${w}px;height:${h}px;background:#fff`;
  inner.innerHTML = html;
  wrap.append(inner);
  host.append(wrap);
  requestAnimationFrame(() => {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = Math.min((r.width - 4) / w, (r.height - 4) / h, 1);
    inner.style.transform = `scale(${k})`;
  });
}

/** 내 스케치 ↔ 생성 결과 나란히 */
function buildCompare(html) {
  const box = document.createElement('div');
  box.className = 'mcompare';
  const mk = (caption, fill) => {
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = caption;
    const pane = document.createElement('div');
    pane.className = 'pane-box';
    fill(pane);
    fig.append(cap, pane);
    return fig;
  };
  box.append(
    mk('내 스케치', (pane) => mountSketch(pane)),
    mk('생성 결과', (pane) => {
      if (html) {
        const fr = document.createElement('iframe');
        fr.srcdoc = html;
        pane.append(fr);
      } else {
        pane.innerHTML = '<pre>(preview HTML 없음)</pre>';
      }
    }),
  );
  return box;
}

function updateViewBar(p = currentTab) {
  $('mView').hidden = !(p === 'v' && !!last.sketch);
  [...$('mSeg').children].forEach((b) => {
    const on = b.dataset.v === viewMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function setActiveTab(p) {
  document.querySelectorAll('.mtab').forEach((x) => {
    const on = x.dataset.p === p;
    x.classList.toggle('on', on);
    x.setAttribute('aria-selected', String(on));
  });
}

function setTab(p) {
  currentTab = p;
  setActiveTab(p);
  updateViewBar(p);
  renderTab(p);
  const hasPreview = !!last.result?.preview?.html;
  const canCopy = p === 'v' ? hasPreview : !!textForTab(p);
  $('mCopy').hidden = !canCopy;
  $('mCopy').textContent = p === 'v' ? '이미지 복사' : '복사';
  const code = last.result?.code;
  $('mDownload').hidden = !(code?.websquareXml || code?.files?.length);
}

// ── footer 상태줄 (상태 + 소요시간) ──────────────────────
function renderStatus() {
  const st = $('mStatus');
  const r = last.result;
  if (!r?.status) { st.hidden = true; return; }
  const fallback = r.report?.usedDeterministicFallback;
  const label = fallback
    ? '✓ 생성 완료 (결정론적 변환 · AI 정리 없음)'
    : { ok: '✓ 생성 완료', needs_input: '추가 확인이 필요합니다', error: '⚠ 생성 실패' }[r.status] || r.status;
  const ms = r.report?.elapsedMs;
  const suffix = ms > 0 ? ` · ${Math.round(ms / 100) / 10}초` : r.report?.mock && !fallback ? ' · mock' : '';
  st.textContent = label + suffix;
  st.className = 'mstatus' + (r.status === 'ok' ? ' ok' : r.status === 'error' ? ' err' : '');
  st.hidden = false;
}

// ── 복사 ─────────────────────────────────────────────────
function textForTab(p) {
  const r = last.result || {};
  if (p === 'j') return last.payload ? JSON.stringify(last.payload, null, 2) : '';
  if (p === 'x') return r.code?.websquareXml || '';
  return '';
}
function flashCopied(text = '✓ 복사됨') {
  const btn = $('mCopy');
  const restore = currentTab === 'v' ? '이미지 복사' : '복사';
  btn.textContent = text;
  clearTimeout(flashCopied._t);
  flashCopied._t = setTimeout(() => { btn.textContent = restore; }, 1400);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* 무시 */ }
    ta.remove();
  }
  flashCopied();
}
/**
 * 생성 결과 preview HTML → PNG Blob.
 * 화면에 보이는 iframe 은 모달 크기에 맞춰 잘려 있고(동시 보기에서는 준비 전일 수도 있음),
 * 전용 iframe 에 preview HTML 을 다시 렌더해 콘텐츠 전체 크기로 캡처한다(잘림 방지).
 */
async function renderScreenBlob() {
  const html = last.result?.preview?.html;
  if (!html || !window.html2canvas) throw new Error('미리보기가 준비되지 않았습니다');

  const cap = document.createElement('iframe');
  cap.setAttribute('aria-hidden', 'true');
  cap.style.cssText =
    'position:fixed;left:0;top:0;width:1280px;height:800px;border:0;background:#fff;' +
    'opacity:0;pointer-events:none;z-index:-1';
  document.body.append(cap);

  try {
    await new Promise((res, rej) => {
      cap.addEventListener('load', () => res(), { once: true });
      setTimeout(() => rej(new Error('미리보기 렌더 시간 초과')), 8000);
      cap.srcdoc = html;
    });
    await new Promise((r) => setTimeout(r, 80));

    const doc = cap.contentDocument;
    const el = doc?.documentElement;
    const body = doc?.body;
    if (!body) throw new Error('미리보기 렌더 실패');

    const fullW = Math.max(el.scrollWidth, body.scrollWidth, el.offsetWidth, body.offsetWidth, 320);
    const fullH = Math.max(el.scrollHeight, body.scrollHeight, el.offsetHeight, body.offsetHeight, 240);
    cap.style.width = fullW + 'px';
    cap.style.height = fullH + 'px';
    await new Promise((r) => setTimeout(r, 80));

    const render = window.html2canvas(body, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      width: fullW,
      height: fullH,
      windowWidth: fullW,
      windowHeight: fullH,
      scrollX: 0,
      scrollY: 0,
    });
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('이미지 생성이 지연됩니다. 창을 활성 상태로 두고 다시 시도해주세요.')), 20000),
    );
    const canvas = await Promise.race([render, timeout]);
    return await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('이미지 변환 실패'))), 'image/png'),
    );
  } finally {
    cap.remove();
  }
}

async function copyScreenImage() {
  const btn = $('mCopy');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '이미지 만드는 중…';

  // clipboard.write 는 사용자 제스처 직후에 호출해야 하므로 Blob 을 Promise 로 전달한다.
  const blobPromise = renderScreenBlob();

  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard image unsupported');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
    flashCopied('✓ 이미지 복사됨');
  } catch {
    // 클립보드 이미지 복사 불가(브라우저 미지원·권한 등) → PNG 파일로 저장
    try {
      const blob = await blobPromise;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(last.payload?.screenName || 'screen').replace(/[\\/:*?"<>|]/g, '_')}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('클립보드 대신 이미지 파일(.png)로 저장했습니다');
      flashCopied('↓ 저장됨');
    } catch (e) {
      toast('이미지를 만들지 못했습니다: ' + e.message);
      btn.textContent = '이미지 복사';
    }
  } finally {
    btn.disabled = false;
  }
}
function copyCurrent() {
  if (currentTab === 'v') return copyScreenImage();
  const text = textForTab(currentTab);
  if (text) copyText(text);
}

// ── 질문 / 수정 요청 footer ───────────────────────────────
function renderQuestions(questions) {
  const box = $('mQuestions');
  box.replaceChildren(
    ...(questions || []).map((q) => {
      const wrap = document.createElement('div');
      wrap.className = 'mq';
      wrap.dataset.qid = q.id;

      const qq = document.createElement('div');
      qq.className = 'mq-q';
      qq.textContent = q.question;
      wrap.append(qq);

      if (q.options?.length) {
        const opts = document.createElement('div');
        opts.className = 'mq-opts';
        q.options.forEach((o) => {
          const label = document.createElement('label');
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'mq_' + q.id;
          radio.value = o;
          label.append(radio, document.createTextNode(' ' + o));
          opts.append(label);
        });
        wrap.append(opts);
      } else {
        const inp = document.createElement('input');
        inp.className = 'mq-input';
        inp.placeholder = '답변 입력';
        wrap.append(inp);
      }
      return wrap;
    }),
  );
}

function collectAnswers() {
  return [...$('mQuestions').querySelectorAll('.mq')]
    .map((w) => {
      const radio = w.querySelector('input[type=radio]:checked');
      const text = w.querySelector('.mq-input');
      const value = radio ? radio.value : text ? text.value.trim() : '';
      return value ? { questionId: w.dataset.qid, value } : null;
    })
    .filter(Boolean);
}

function refreshFoot() {
  const r = last.result || {};
  renderStatus();
  renderQuestions(r.status === 'needs_input' ? r.questions : []);
  mfoot().hidden = !last.result;
  $('mInstruction').placeholder =
    r.status === 'needs_input'
      ? '추가로 하고 싶은 말 (선택)'
      : '자연어로 수정 요청 (예: 조회 버튼을 오른쪽 정렬)';
}

async function doRefine() {
  const answers = collectAnswers();
  const instruction = $('mInstruction').value.trim();
  const needs = last.result?.status === 'needs_input';

  if (needs && answers.length === 0 && !instruction) {
    alert('질문에 답하거나 수정 요청을 입력해주세요.');
    return;
  }
  if (!needs && !instruction) {
    alert('수정 요청을 입력해주세요.');
    return;
  }

  const req = { basePayload: last.payload };
  if (last.result?.ir) req.baseIr = last.result.ir;
  if (answers.length) req.answers = answers;
  if (instruction) req.instruction = instruction;

  const stop = showProgress('수정 내용 반영');
  mfoot().hidden = true;
  $('mView').hidden = true;
  try {
    const result = await api.refine(req);
    last = { payload: last.payload, result, sketch: last.sketch };
    $('mInstruction').value = '';
    stop();
    refreshFoot();
    setTab('v');
  } catch (e) {
    stop();
    const pre = document.createElement('pre');
    pre.className = 'err';
    pre.textContent = e.message;
    mbody().replaceChildren(pre);
    $('mCopy').hidden = true;
    mfoot().hidden = false;
  }
}

// ── 다운로드 ──────────────────────────────────────────────
function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * 생성 결과 내려받기.
 * - code.files 가 2개 이상: zip
 * - 1개: 그 파일
 * - files 없고 websquareXml 만: `<화면>.xml`
 */
function download() {
  const code = last.result?.code;
  if (!code) { toast('내려받을 코드가 없습니다'); return; }
  const base = (last.payload?.screenName || 'screen').replace(/[\\/:*?"<>|]/g, '_');
  const files = (code.files || []).filter((f) => f && f.path);
  const xml = code.websquareXml;

  if (files.length >= 2 && window.fflate) {
    const entries = {};
    files.forEach((f) => { entries[f.path] = window.fflate.strToU8(f.content ?? ''); });
    if (xml && !files.some((f) => f.path.toLowerCase().endsWith('.xml'))) {
      entries[`${base}.xml`] = window.fflate.strToU8(xml);
    }
    try {
      const zipped = window.fflate.zipSync(entries, { level: 6 });
      saveBlob(new Blob([zipped], { type: 'application/zip' }), `${base}.zip`);
      return;
    } catch (e) {
      toast('zip 생성에 실패해 첫 파일만 저장합니다');
      console.error(e);
    }
  }
  if (files.length === 1) {
    saveBlob(new Blob([files[0].content ?? ''], { type: 'text/plain' }), files[0].path.split('/').pop());
    return;
  }
  if (xml) {
    saveBlob(new Blob([xml], { type: 'application/xml' }), `${base}.xml`);
    return;
  }
  toast('내려받을 코드가 없습니다');
}

/**
 * @param {object} payload  화면정의 payload
 * @param {string} title    모달 제목
 * @param {{html:string,w:number,h:number}} [sketch]  생성 요청 시점 캔버스 스냅샷
 */
export async function runBuild(payload, title, sketch = null) {
  $('mTitle').textContent = title;
  $('mInstruction').value = '';
  viewMode = 'after';
  openModal();
  $('mClose').focus();
  mfoot().hidden = true;
  $('mView').hidden = true;
  $('mCopy').hidden = true;
  $('mDownload').hidden = true;
  setActiveTab('v');
  const stop = showProgress();
  try {
    const result = await api.generate(payload);
    last = { payload, result, sketch };
    stop();
    refreshFoot();
    setTab('v');
  } catch (e) {
    stop();
    last = { payload, result: null, sketch };
    const pre = document.createElement('pre');
    pre.className = 'err';
    pre.textContent = e.message;
    mbody().replaceChildren(pre);
    $('mCopy').hidden = true;
    $('mDownload').hidden = true;
  }
}

export function initResultModal() {
  $('mClose').addEventListener('click', closeModal);
  $('mDownload').addEventListener('click', download);
  $('mCopy').addEventListener('click', copyCurrent);
  $('mRefine').addEventListener('click', doRefine);
  $('mInstruction').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRefine(); });
  document.querySelectorAll('.mtab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.p)));
  $('mSeg').addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.v;
    if (!v || v === viewMode) return;
    viewMode = v;
    setTab('v');
  });
  mask().addEventListener('mousedown', (e) => { if (e.target === mask()) closeModal(); });
}
