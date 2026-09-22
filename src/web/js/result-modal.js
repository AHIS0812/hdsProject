// "화면 생성" 결과 모달 — [화면] Preview / [WebSquare XML].
// 결과는 POST /api/generate 응답(규칙 기반 변환기)에서 온다. 개발지시서 U-7, U-8.

import { generate } from './api.js';
import { toast } from './toast.js';
import { highlightXml } from './highlight.js';
import { NAME } from './constants.js';
import { readingOrder } from './reading-order.js';

const $ = (id) => document.getElementById(id);

const STEPS = ['배치된 요소 읽기', '읽기 순서로 정렬', '사내 표준 컴포넌트로 치환', 'WebSquare XML · 미리보기 생성'];

// last.payload = 생성 payload, last.result = /api/generate 결과
// last.sketch = 생성 요청 시점의 캔버스 스냅샷 { html, w, h } — "내 스케치" 비교용
let last = { payload: null, result: null, sketch: null };
// 생성 요청 번호 — 결과를 기다리는 중에 창을 닫고 다시 "화면 생성"을 누르면, 늦게 도착한 이전 응답이
// 새 결과를 덮어쓰거나 닫힌 창에 그려지던 문제를 막는다(가장 최근 요청의 응답만 반영).
let buildSeq = 0;
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
  previewObservers.forEach((o) => o.disconnect());
  previewObservers.length = 0;
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
  previewObservers.forEach((o) => o.disconnect()); // 이전 탭/보기의 미리보기 크기 감시는 정리
  previewObservers.length = 0;
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
    pre.textContent = '변환 실패\n\n' + (r.error?.message || '') + '\n\n' + (r.error?.log || '');
    b.replaceChildren(pre);
    return;
  }
  const html = r.preview?.html;

  if (viewMode === 'split' && last.sketch) {
    maxModalSize(); // 두 화면을 나란히 놓으려면 넓게
    b.replaceChildren(buildCompare(html));
    return;
  }
  if (!html) {
    b.innerHTML = '<pre>(preview HTML 없음)</pre>';
    return;
  }
  b.replaceChildren();
  mountPreviewFrame(b, html, { snug: true }); // 결과 화면 크기에 창을 딱 맞춘다
}

/**
 * 생성 결과 미리보기 iframe 을 host 안에 붙인다. iframe 은 화면 원본 크기 그대로 두고 host 크기에 맞춰
 * 축소(확대는 안 함)해서, 창이 작아도 스크롤바 없이 화면 전체가 한눈에 보이게 한다.
 * 세로로 아주 긴 화면(PC·스크롤 고려 등)은 글자가 읽히도록 60% 밑으로는 줄이지 않고 스크롤에 맡긴다.
 */
const MIN_FIT = 0.6;
const previewObservers = [];
const modalEl = () => document.querySelector('#mask .modal');

/** 결과 창 크기를 CSS 기본값(작은 로딩 화면용)으로 되돌린다 */
function resetModalSize() {
  const m = modalEl();
  if (m) { m.style.width = ''; m.style.height = ''; }
}
/** 동시 보기처럼 넓게 써야 하는 경우 — 뷰포트가 허용하는 최대 크기 */
function maxModalSize() {
  const m = modalEl();
  if (m) { m.style.width = 'min(1680px,100%)'; m.style.height = 'min(1040px,100%)'; }
}
/**
 * 결과 창을 미리보기 크기에 딱 맞춘다 — 창 프레임(머리글·보기줄·하단바) + 본문 여백 + 화면 크기.
 * 뷰포트보다 크면 뷰포트까지만 커지고, 그땐 미리보기가 창에 맞춰 축소된다.
 */
function sizeModalToContent(host, natW, natH) {
  const m = modalEl();
  if (!m) return;
  const cs = getComputedStyle(host);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const chromeH = m.offsetHeight - host.clientHeight; // 본문 밖(머리글·보기줄·하단바) 높이
  // 뷰포트가 허용하는 최대 창 크기(마스크 안쪽 여백 제외, CSS 상한 포함)
  const mask = m.parentElement;
  const mcs = getComputedStyle(mask);
  const maxW = Math.min(1680, mask.clientWidth - parseFloat(mcs.paddingLeft) - parseFloat(mcs.paddingRight));
  const maxH = Math.min(1040, mask.clientHeight - parseFloat(mcs.paddingTop) - parseFloat(mcs.paddingBottom));
  // 화면이 창보다 크면 mountPreviewFrame 이 줄여서 넣으므로, 그 축소된 크기에 맞춰 창도 함께 줄인다
  const k = Math.min(1, (maxW - padX - 2) / natW, Math.max((maxH - chromeH - padY - 2) / natH, MIN_FIT));
  m.style.width = `${Math.min(maxW, Math.ceil(natW * k + padX + 2))}px`;
  m.style.height = `${Math.min(maxH, Math.ceil(natH * k + chromeH + padY + 2))}px`;
}

function mountPreviewFrame(host, html, { snug = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'pvwrap';
  const frame = document.createElement('iframe');
  frame.srcdoc = html;
  wrap.append(frame);
  host.append(wrap);

  const fit = () => {
    const cv = frame.contentDocument?.querySelector('.d-cv');
    if (!cv) return;
    // 화면 크기에 딱 맞춰 넣으므로 iframe 안쪽 스크롤바는 필요 없다(하단 여백을 살짝 잘라내도 스크롤이 안 생기게)
    frame.contentDocument.documentElement.style.overflow = 'hidden';
    const natW = cv.offsetWidth + 24;                     // 캔버스 + 좌우 여백
    const natH = cv.offsetTop + cv.offsetHeight + 6;      // 상단 안내 문구 + 캔버스 + 하단 여백
    if (snug) sizeModalToContent(host, natW, natH);
    const cs = getComputedStyle(host);
    const availW = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
    const availH = host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
    if (availW <= 0 || availH <= 0) return;
    const k = Math.min(1, availW / natW, Math.max(availH / natH, MIN_FIT));
    frame.style.width = natW + 'px';
    frame.style.height = natH + 'px';
    frame.style.transform = `scale(${k})`;
    wrap.style.width = Math.ceil(natW * k) + 'px';
    wrap.style.height = Math.ceil(natH * k) + 'px';
  };
  frame.addEventListener('load', fit);
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  previewObservers.push(ro);
}

/** 스케치 스냅샷을 컨테이너 폭에 맞춰 축소해 붙인다 */
function mountSketch(host) {
  const { html, w, h, background } = last.sketch;
  const wrap = document.createElement('div');
  wrap.className = 'sketchwrap';
  const inner = document.createElement('div');
  inner.className = 'sketchscale';
  inner.style.cssText = `width:${w}px;height:${h}px;background:#fff`;
  // 변경화면 캡처 배경 — 에디터에선 #board 의 배경이라 스냅샷 HTML 에 안 들어 있다
  if (typeof background === 'string' && background.startsWith('data:image/')) {
    inner.style.backgroundImage = `url("${background}")`;
    inner.style.backgroundSize = '100% 100%';
  }
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
        mountPreviewFrame(pane, html);
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
  $('mSaveImg').hidden = !(p === 'v' && hasPreview);
  $('mExportDoc').hidden = !(p === 'v' && hasPreview);
  const code = last.result?.code;
  // 내려받기(코드 파일)는 [WebSquare XML] 탭에서만 의미가 있다 — [화면] 탭은 이미지 복사·저장·
  // 산출물 추출로 이미 충분하고, 코드 파일 내려받기가 같이 있으면 혼동을 준다.
  $('mDownload').hidden = !(p === 'x' && (code?.websquareXml || code?.files?.length));
  // 실제로 자주 쓰는 동작을 색으로 강조한다 — [화면] 탭에선 이미지 복사·저장.
  $('mCopy').classList.toggle('nv', p === 'v');
  $('mSaveImg').classList.toggle('nv', p === 'v');
  $('mDownload').classList.toggle('nv', p === 'x');
}

// ── footer 상태줄 (상태 + 소요시간) ──────────────────────
function renderStatus() {
  const st = $('mStatus');
  const r = last.result;
  if (!r?.status) { st.hidden = true; return; }
  const ok = r.status === 'ok';
  const ms = r.report?.elapsedMs || 0;
  const time = ms >= 50 ? ` · ${(ms / 1000).toFixed(1)}초` : ' · 즉시';
  const prop = r.report?.propagatedRequired
    ? ` · 필수 표시 ${r.report.propagatedRequired}건 자동 반영`
    : '';
  st.textContent = ok ? `✓ 변환 완료 (규칙 기반)${time}${prop}` : '⚠ 변환 실패';
  st.className = 'mstatus' + (ok ? ' ok' : ' err');
  st.hidden = false;
}

function refreshFoot() {
  renderStatus();
  mfoot().hidden = !last.result;
}

// ── 복사 ─────────────────────────────────────────────────
function textForTab(p) {
  const r = last.result || {};
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
 * 생성 결과 preview HTML 을 전용 iframe 에 다시 렌더해 실제 화면 영역(.d-cv)만 캔버스로 찍는다
 * (화면에 보이는 iframe 은 모달 크기에 맞춰 잘려 있고, 동시 보기에서는 준비 전일 수도 있어
 * 콘텐츠 전체 크기로 새로 렌더한다). "설명 붙은 요소 보기" 토글 버튼·안내 문구 같은 미리보기
 * 전용 UI는 .d-cv 밖이라 자동으로 빠진다.
 * @param {(doc: Document, cap: HTMLIFrameElement) => void|Promise<void>} [applyState]
 *   캡처 직전에 iframe 문서에 재현해 둘 상태(말풍선·화살표 등) — 이미지 복사/저장에서만 쓴다.
 * @returns {Promise<HTMLCanvasElement>}
 */
async function captureScreenCanvas(applyState) {
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
    const cv = doc?.querySelector('.d-cv');
    if (!body || !cv) throw new Error('미리보기 렌더 실패');

    const fullW = Math.max(el.scrollWidth, body.scrollWidth, el.offsetWidth, body.offsetWidth, 320);
    const fullH = Math.max(el.scrollHeight, body.scrollHeight, el.offsetHeight, body.offsetHeight, 240);
    cap.style.width = fullW + 'px';
    cap.style.height = fullH + 'px';
    await new Promise((r) => setTimeout(r, 80));

    if (applyState) await applyState(doc, cap);

    const cvRect = cv.getBoundingClientRect();
    const render = window.html2canvas(cv, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      width: Math.ceil(cvRect.width),
      height: Math.ceil(cvRect.height),
      windowWidth: fullW,
      windowHeight: fullH,
      scrollX: 0,
      scrollY: 0,
    });
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('이미지 생성이 지연됩니다. 창을 활성 상태로 두고 다시 시도해주세요.')), 20000),
    );
    return await Promise.race([render, timeout]);
  } finally {
    cap.remove();
  }
}

/**
 * 생성 결과 preview HTML → PNG Blob. 지금 화면에 떠 있는 iframe(사용자가 클릭해 켜 둔 말풍선·
 * 화살표·"설명 붙은 요소 보기" 상태를 들고 있다)에서 그 상태를 읽어, captureScreenCanvas 가 새로
 * 만드는 캡처용 iframe(별개 문서라 상태를 이어받지 못한다)에 그대로 재현해 함께 찍는다.
 */
async function renderScreenBlob() {
  const liveWin = mbody().querySelector('iframe')?.contentWindow;
  const activeId = liveWin?.hsActiveId || null;
  const hlOn = !!liveWin?.document?.body?.classList.contains('hs-hl');
  // 말풍선을 사용자가 직접 드래그해서 옮겨 뒀으면(hsInitBubbleDrag) 그 위치도 그대로 옮겨 찍는다 —
  // 캡처용 iframe에서 hsActivate 를 다시 태우면 자동 배치 위치로 리셋되므로, 재현 직후 덮어써야 한다.
  const liveBubble = liveWin?.document?.getElementById('hsBubble');
  const movedPos = liveBubble?.dataset.moved === '1'
    ? { left: liveBubble.style.left, top: liveBubble.style.top, tailX: liveBubble.style.getPropertyValue('--tail-x') }
    : null;

  const canvas = await captureScreenCanvas(async (doc, cap) => {
    // 읽어 둔 상태를 캡처용 iframe에 그대로 재현한다 — 실제로 같은 클릭 핸들러(hsToggle,
    // hsFindNotedById→hsActivate)를 타게 해서, 좌표 계산도 이 iframe 의 실제 렌더 크기 기준으로
    // 다시 이뤄지게 한다(라이브 iframe 의 좌표를 그대로 복사하면 크기가 달라 어긋날 수 있다).
    // 말풍선은 opacity 트랜지션(.15s)으로 나타나는데, html2canvas 는 그 순간의 computed style 을
    // 그대로 찍으므로 트랜지션 도중에 캡처하면 흐릿하거나 거의 안 보이게 찍힌다 — 캡처용
    // iframe 에서는 트랜지션을 꺼서 opacity 가 즉시 반영되게 한다.
    if (hlOn || activeId) doc.head.insertAdjacentHTML('beforeend', '<style>#hsBubble{transition:none!important}</style>');
    if (hlOn) cap.contentWindow?.document.getElementById('hsToggle')?.click();
    if (activeId) cap.contentWindow?.hsFindNotedById?.(activeId)?.click();
    if (hlOn || activeId) await new Promise((r) => setTimeout(r, 30));
    if (movedPos) {
      const capBubble = doc.getElementById('hsBubble');
      if (capBubble) {
        capBubble.style.left = movedPos.left;
        capBubble.style.top = movedPos.top;
        if (movedPos.tailX) capBubble.style.setProperty('--tail-x', movedPos.tailX);
      }
    }
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
      saveBlob(await blobPromise, screenImageName());
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
const screenImageName = () => `${(last.payload?.screenName || 'screen').replace(/[\\/:*?"<>|]/g, '_')}.png`;
async function saveScreenImage() {
  const btn = $('mSaveImg');
  if (btn.disabled) return;
  btn.disabled = true;
  const restore = btn.textContent;
  btn.textContent = '이미지 만드는 중…';
  try {
    saveBlob(await renderScreenBlob(), screenImageName());
    btn.textContent = '↓ 저장됨';
    setTimeout(() => { btn.textContent = restore; }, 1400);
  } catch (e) {
    toast('이미지를 만들지 못했습니다: ' + e.message);
    btn.textContent = restore;
  } finally {
    btn.disabled = false;
  }
}
// ── 산출물 추출 (PPT: 화면 이미지 + 요소 설명) ──────────────
/** "설명(desc)" 또는 "연결(linksTo)" 이 달린 요소만 — 결과 화면의 "📍 설명 붙은 요소 보기" 와
 * 같은 기준이다. 이 목록에 번호를 매겨 이미지 위 배지·오른쪽 설명 목록에 그대로 쓴다. */
function annotatedShapes() {
  const shapes = last.payload?.shapes || [];
  return readingOrder(shapes.filter((s) =>
    (s.desc && String(s.desc).trim()) || (Array.isArray(s.linksTo) && s.linksTo.length)));
}

const deliverableFileName = () =>
  `${(last.payload?.screenName || 'screen').replace(/[\\/:*?"<>|]/g, '_')}_화면설명서.pptx`;

/**
 * 화면 산출물(PPT) 슬라이드 1장을 만들어 바로 내려받는다 — 왼쪽엔 생성된 화면 이미지,
 * 오른쪽엔 그 위에 매긴 번호에 대응하는 설명 목록("Description"). 새로 입력할 게 없다 —
 * 캔버스에서 요소에 붙여 둔 "설명"·"연결"이 곧 이 문서의 내용이 된다.
 */
async function buildDeliverablePptx() {
  if (!window.PptxGenJS) throw new Error('PPT 라이브러리를 불러오지 못했습니다');
  const canvas = await captureScreenCanvas(); // 말풍선·하이라이트 없는 깨끗한 화면 — 번호는 직접 매긴다
  const imgData = canvas.toDataURL('image/png');

  const shapes = last.payload?.shapes || [];
  const { w: boardW, h: boardH } = last.payload?.canvas || { w: 960, h: 600 };
  const items = annotatedShapes();
  const findShape = (id) => shapes.find((s) => s.id === id);

  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5in
  const slide = pptx.addSlide();
  const FONT = '맑은 고딕';

  const title = last.payload?.screenName || $('mTitle').textContent || '화면';
  slide.addText(title, { x: 0.4, y: 0.28, w: 12.5, h: 0.5, fontSize: 20, bold: true, color: '1A2942', fontFace: FONT });

  // 왼쪽: 화면 이미지 — 보드 비율을 유지한 채 영역 안에 맞춘다("contain").
  const areaX = 0.4; const areaY = 1.0; const areaW = 8.2; const areaH = 6.1;
  const k = Math.min(areaW / boardW, areaH / boardH);
  const picW = boardW * k; const picH = boardH * k;
  const picX = areaX + (areaW - picW) / 2;
  const picY = areaY + (areaH - picH) / 2;
  slide.addShape('rect', { x: picX, y: picY, w: picW, h: picH, fill: { color: 'FFFFFF' }, line: { color: 'D8DDE5', width: 1 } });
  slide.addImage({ data: imgData, x: picX, y: picY, w: picW, h: picH });

  // 이미지 위 번호 배지 — 그 요소의 좌상단 모서리에 걸치게 놓는다(사내 화면설계서 관례).
  const BADGE = 0.26;
  items.forEach((s, i) => {
    const bx = picX + (s.x / boardW) * picW;
    const by = picY + (s.y / boardH) * picH;
    slide.addText(String(i + 1), {
      x: bx - BADGE / 2, y: by - BADGE / 2, w: BADGE, h: BADGE,
      shape: pptx.ShapeType.ellipse, fill: { color: 'F5821F' }, line: { color: 'FFFFFF', width: 1 },
      color: 'FFFFFF', bold: true, fontSize: 11, align: 'center', valign: 'middle', fontFace: FONT,
    });
  });

  // 오른쪽: 설명 패널
  const panelX = 8.9; const panelY = 1.0; const panelW = 4.03; const panelH = 6.1;
  slide.addShape('rect', { x: panelX, y: panelY, w: panelW, h: panelH, fill: { color: 'FAFBFD' }, line: { color: 'E3E6EC', width: 1 } });
  slide.addText('Description (화면 설명)', {
    x: panelX + 0.15, y: panelY + 0.1, w: panelW - 0.3, h: 0.3,
    fontSize: 12, bold: true, color: '6E7787', fontFace: FONT,
  });

  const paras = [];
  if (!items.length) {
    paras.push({
      text: '설명이 달린 요소가 없습니다.\n캔버스에서 요소를 선택해 "설명"을 추가하면 여기에 자동으로 정리됩니다.',
      options: { fontSize: 11, color: '79828F', italic: true, breakLine: true },
    });
  } else {
    items.forEach((s, i) => {
      const name = s.label || NAME[s.type] || s.type;
      paras.push({ text: `${i + 1}  ${name}`, options: { bold: true, fontSize: 12, color: '1A2942', breakLine: true } });
      const desc = (s.desc && String(s.desc).trim()) || '';
      if (desc) paras.push({ text: desc, options: { fontSize: 11, color: '333333', breakLine: true } });
      const targets = (Array.isArray(s.linksTo) ? s.linksTo : [])
        .map(findShape).filter(Boolean).map((t) => t.label || NAME[t.type] || t.type);
      if (targets.length) {
        paras.push({ text: `→ 연결: ${targets.join(', ')}`, options: { fontSize: 10.5, color: '0F3B7C', breakLine: true } });
      }
      paras.push({ text: ' ', options: { fontSize: 6, breakLine: true } }); // 항목 사이 여백
    });
  }
  slide.addText(paras, {
    x: panelX + 0.15, y: panelY + 0.5, w: panelW - 0.3, h: panelH - 0.65,
    valign: 'top', fontFace: FONT, lineSpacingMultiple: 1.2,
    fit: 'shrink', // 설명 붙은 요소가 많아 목록이 길어지면 패널 밖으로 넘치는 대신 글자를 줄인다
  });

  slide.addText('하이스케치 — 규칙 기반 자동 생성', {
    x: 0.4, y: 7.18, w: 6, h: 0.25, fontSize: 8, color: '9AA3B0', fontFace: FONT,
  });

  await pptx.writeFile({ fileName: deliverableFileName() });
}

async function exportDeliverable() {
  const btn = $('mExportDoc');
  if (btn.disabled) return;
  btn.disabled = true;
  const restore = btn.textContent;
  btn.textContent = '만드는 중…';
  try {
    await buildDeliverablePptx();
    btn.textContent = '✓ 생성됨';
    setTimeout(() => { btn.textContent = restore; }, 1400);
  } catch (e) {
    toast('산출물을 만들지 못했습니다: ' + e.message);
    btn.textContent = restore;
  } finally {
    btn.disabled = false;
  }
}

function copyCurrent() {
  if (currentTab === 'v') return copyScreenImage();
  const text = textForTab(currentTab);
  if (text) copyText(text);
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
  viewMode = 'after';
  resetModalSize(); // 이전 결과 크기에 맞춰졌던 창을 로딩 화면용 기본 크기로
  openModal();
  $('mClose').focus();
  mfoot().hidden = true;
  $('mView').hidden = true;
  $('mCopy').hidden = true;
  $('mSaveImg').hidden = true;
  $('mExportDoc').hidden = true;
  $('mDownload').hidden = true;
  setActiveTab('v');
  currentTab = 'v';
  const seq = ++buildSeq;
  const stop = showProgress();
  try {
    const result = await generate(payload);
    if (seq !== buildSeq || !mask().classList.contains('on')) { stop(); return; }
    last = { payload, result, sketch };
    stop();
    refreshFoot();
    setTab('v');
  } catch (e) {
    stop();
    if (seq !== buildSeq || !mask().classList.contains('on')) return;
    last = { payload, result: null, sketch };
    const pre = document.createElement('pre');
    pre.className = 'err';
    pre.textContent = e.message;
    mbody().replaceChildren(pre);
    $('mCopy').hidden = true;
    $('mSaveImg').hidden = true;
    $('mExportDoc').hidden = true;
    $('mDownload').hidden = true;
  }
}

export function initResultModal() {
  $('mClose').addEventListener('click', closeModal);
  $('mDownload').addEventListener('click', download);
  $('mCopy').addEventListener('click', copyCurrent);
  $('mSaveImg').addEventListener('click', saveScreenImage);
  $('mExportDoc').addEventListener('click', exportDeliverable);
  document.querySelectorAll('.mtab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.p)));
  $('mSeg').addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.v;
    if (!v || v === viewMode) return;
    viewMode = v;
    setTab('v');
  });
  mask().addEventListener('mousedown', (e) => { if (e.target === mask()) closeModal(); });
}
