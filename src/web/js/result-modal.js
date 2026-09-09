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

export function closeModal() {
  mask().classList.remove('on');
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
      note.textContent = `생성 파일 ${files.length}개: ` + files.map((f) => f.path).join(', ') + ' · [내려받기] 로 zip 저장';
      wrap.append(note);
    }
    b.replaceChildren(wrap);
    return;
  }
  // 'v' — 화면
  if (r.status === 'error') {
    b.replaceChildren(errorBox(r));
    return;
  }
  if (r.status === 'needs_input') {
    b.replaceChildren(needsInputBox(r));
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

/** status=error 안내 박스 (메시지 + 접이식 로그) */
function errorBox(r) {
  const box = document.createElement('div');
  box.className = 'mstate err';
  const h = document.createElement('b');
  h.textContent = '⚠ 화면을 생성하지 못했습니다';
  box.append(h);
  const msg = document.createElement('p');
  msg.textContent = r.error?.message || '알 수 없는 오류입니다. 잠시 후 다시 시도해주세요.';
  box.append(msg);
  if (r.error?.log) {
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = '자세한 로그';
    const pre = document.createElement('pre');
    pre.className = 'err';
    pre.textContent = r.error.log;
    det.append(sum, pre);
    box.append(det);
  }
  const hint = document.createElement('p');
  hint.className = 'mstate-hint';
  hint.textContent = '아래 입력창에 조건을 더 적어 다시 시도하거나, 캔버스를 정리한 뒤 다시 생성해보세요.';
  box.append(hint);
  return box;
}

/** status=needs_input 안내 박스 (질문은 footer 에 렌더된다) */
function needsInputBox(r) {
  const box = document.createElement('div');
  box.className = 'mstate';
  const h = document.createElement('b');
  h.textContent = '몇 가지만 확인하면 됩니다';
  box.append(h);
  const p = document.createElement('p');
  const n = (r.questions || []).length;
  p.textContent = `아래 질문 ${n}개에 답하면 반영해서 다시 생성합니다. (건너뛰고 수정 요청만 적어도 됩니다)`;
  box.append(p);
  return box;
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
  [...$('mSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.v === viewMode));
}

function setTab(p) {
  currentTab = p;
  document.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('on', x.dataset.p === p));
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
  const label = { ok: '✓ 생성 완료', needs_input: '추가 확인이 필요합니다', error: '⚠ 생성 실패' }[r.status] || r.status;
  const ms = r.report?.elapsedMs;
  const suffix = ms > 0 ? ` · ${Math.round(ms / 100) / 10}초` : r.report?.mock ? ' · mock' : '';
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
/** preview iframe → PNG Blob */
async function renderScreenBlob() {
  const frame = mbody().querySelector('iframe');
  const doc = frame?.contentDocument;
  if (!doc?.body || !window.html2canvas) throw new Error('미리보기가 준비되지 않았습니다');
  const root = doc.documentElement;
  const canvas = await window.html2canvas(doc.body, {
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    width: root.scrollWidth,
    height: root.scrollHeight,
    windowWidth: root.scrollWidth,
    windowHeight: root.scrollHeight,
  });
  return await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('이미지 변환 실패'))), 'image/png'),
  );
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
    mbody().replaceChildren(errorBox({ error: { message: e.message } }));
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
  mask().classList.add('on');
  mfoot().hidden = true;
  $('mView').hidden = true;
  $('mCopy').hidden = true;
  $('mDownload').hidden = true;
  document.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('on', x.dataset.p === 'v'));
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
    mbody().replaceChildren(errorBox({ error: { message: e.message } }));
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
