// "화면 생성" 결과 모달 — [화면] Preview / [전달 데이터] payload / [WebSquare XML]
// + 질문 응답 / 자연어 수정 요청 → /api/refine.
// 개발지시서 U-7, U-8, U-9. 결과는 POST /api/generate|refine 응답에서 온다.

import * as api from './api.js';

const $ = (id) => document.getElementById(id);

const STEPS = ['배치된 요소 해석', '보충 설명 · 첨부 파일 반영', '사내 표준 컴포넌트 치환', 'WebSquare XML 변환 및 검증'];

// last.payload = 최초 생성 payload, last.result = 가장 최근 결과 (generate/refine 공통)
let last = { payload: null, result: null };
let currentTab = 'v';

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
    const pre = document.createElement('pre');
    pre.textContent = r.code?.websquareXml || '(WebSquare XML 없음)';
    b.replaceChildren(pre);
    return;
  }
  if (p === 'r') {
    b.replaceChildren(renderReport(r));
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
  if (!html) {
    b.innerHTML = '<pre>(preview HTML 없음)</pre>';
    return;
  }
  const frame = document.createElement('iframe');
  frame.srcdoc = html;
  b.replaceChildren(frame);
}

function setTab(p) {
  currentTab = p;
  document.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('on', x.dataset.p === p));
  renderTab(p);
  $('mCopy').hidden = !textForTab(p);
}

// ── 처리 리포트 (report 시각화) ───────────────────────────
function renderReport(r) {
  const wrap = document.createElement('div');
  wrap.className = 'report';
  const rep = r.report || {};
  const labelOf = (id) => {
    const s = (last.payload?.shapes || []).find((x) => x.id === id);
    return s ? `${s.label || s.type}` : id;
  };

  const stat = document.createElement('div');
  stat.className = 'rep-stats';
  stat.append(
    repStat('상태', r.status || '-'),
    repStat('재시도', (rep.retries ?? 0) + '회'),
    repStat('소요', rep.elapsedMs != null ? Math.round(rep.elapsedMs / 100) / 10 + '초' : '-'),
    repStat('AI', rep.usedDeterministicFallback ? '미사용(폴백)' : rep.mock ? 'mock' : '사용'),
  );
  wrap.append(stat);

  wrap.append(repSection('표준 대체 (fallback)',
    (rep.fallbacksApplied || []).map((f) =>
      `${labelOf(f.targetId)} : ${f.from ?? '?'} → ${f.to ?? '?'}${f.reason ? `  (${f.reason})` : ''}`),
    '표준에 없는 요소를 대체한 내역이 없습니다'));

  wrap.append(repSection('미확정 항목',
    (rep.unresolved || []).map(labelOf),
    '미확정으로 남은 요소가 없습니다'));

  if (rep.note) {
    const n = document.createElement('p');
    n.className = 'rep-note';
    n.textContent = rep.note;
    wrap.append(n);
  }
  return wrap;
}
function repStat(k, v) {
  const d = document.createElement('div');
  d.className = 'rep-stat';
  d.innerHTML = `<b></b><span></span>`;
  d.querySelector('b').textContent = v;
  d.querySelector('span').textContent = k;
  return d;
}
function repSection(title, lines, emptyText) {
  const sec = document.createElement('div');
  sec.className = 'rep-sec';
  const h = document.createElement('h4');
  h.textContent = title;
  sec.append(h);
  if (lines.length) {
    const ul = document.createElement('ul');
    lines.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      ul.append(li);
    });
    sec.append(ul);
  } else {
    const p = document.createElement('p');
    p.className = 'rep-empty';
    p.textContent = emptyText;
    sec.append(p);
  }
  return sec;
}

// ── 복사 ─────────────────────────────────────────────────
function textForTab(p) {
  const r = last.result || {};
  if (p === 'j') return last.payload ? JSON.stringify(last.payload, null, 2) : '';
  if (p === 'x') return r.code?.websquareXml || '';
  if (p === 'v') return r.preview?.html || '';
  if (p === 'r') return r.report ? JSON.stringify(r.report, null, 2) : '';
  return '';
}
async function copyCurrent() {
  const text = textForTab(currentTab);
  if (!text) return;
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
  const btn = $('mCopy');
  btn.textContent = '✓ 복사됨';
  clearTimeout(copyCurrent._t);
  copyCurrent._t = setTimeout(() => { btn.textContent = '복사'; }, 1200);
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
  try {
    const result = await api.refine(req);
    last = { payload: last.payload, result };
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
function download() {
  const xml = last.result?.code?.websquareXml;
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
  $('mInstruction').value = '';
  mask().classList.add('on');
  mfoot().hidden = true;
  document.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('on', x.dataset.p === 'v'));
  const stop = showProgress();
  try {
    const result = await api.generate(payload);
    last = { payload, result };
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
  }
}

export function initResultModal() {
  $('mClose').addEventListener('click', closeModal);
  $('mDownload').addEventListener('click', download);
  $('mCopy').addEventListener('click', copyCurrent);
  $('mRefine').addEventListener('click', doRefine);
  $('mInstruction').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRefine(); });
  document.querySelectorAll('.mtab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.p)));
  mask().addEventListener('mousedown', (e) => { if (e.target === mask()) closeModal(); });
}
