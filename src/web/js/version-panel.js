// 버전 기록 창 — 저장된 버전 목록(자동·이름 붙인 버전)을 보고, 미리 본 뒤 복원하거나 사본으로 연다.
// 버전 저장·복원 자체는 main.js 가 콜백으로 처리하고, 이 모듈은 창 그리기와 입력만 맡는다.

import { docPages } from './doc-model.js';
import { pageThumbSvg } from './pagebar.js';
import { svgDataUrl } from './thumbnail.js';
import { relTime } from './home-logic.js';
import { LABEL_MAX } from './versions.js';

const p2 = (n) => String(n).padStart(2, '0');
const fmtFull = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/**
 * @param {{
 *   versions: ReturnType<import('./versions.js').createVersionStore>,
 *   projectId: string,
 *   onSaveNamed: (label:string) => Promise<boolean>,
 *   onRestore: (vid:string, meta:object) => Promise<boolean>,
 *   onOpenCopy: (vid:string, meta:object) => void,
 * }} opts
 */
export function openVersionPanel({ versions, projectId, onSaveNamed, onRestore, onOpenCopy }) {
  if (document.querySelector('.verp')) return;
  const prevFocus = document.activeElement;
  let selected = null;

  const mask = document.createElement('div');
  mask.className = 'dlg-mask';
  const box = document.createElement('div');
  box.className = 'dlg verp';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'verpTitle');
  box.innerHTML =
    '<div class="verp-hd"><b id="verpTitle">버전 기록</b>'
    + '<span class="verp-sub">저장하면 10분마다 자동으로 남고, 이름을 붙인 버전은 따로 오래 보관돼요.</span>'
    + '<button type="button" class="verp-x" aria-label="닫기">✕</button></div>'
    + '<div class="verp-save"><input class="dlg-input" id="verpLabel" maxlength="' + LABEL_MAX + '" placeholder="지금 상태에 이름 붙여 저장 (예: 1차 검토본)" autocomplete="off" aria-label="버전 이름">'
    + '<button type="button" class="btn sm pri" id="verpSave">버전 저장</button></div>'
    + '<div class="verp-bd"><div class="verp-list" role="listbox" aria-label="버전 목록"></div>'
    + '<div class="verp-pv" aria-live="polite"></div></div>';
  mask.append(box);
  document.body.append(mask);

  const listEl = box.querySelector('.verp-list');
  const pvEl = box.querySelector('.verp-pv');
  const labelEl = box.querySelector('#verpLabel');

  function close() {
    document.removeEventListener('keydown', onKey, true);
    mask.remove();
    try { prevFocus?.focus?.(); } catch { /* 무시 */ }
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [...box.querySelectorAll('input,button,[tabindex="0"]')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });
  box.querySelector('.verp-x').addEventListener('click', close);

  const title = (m) => m.label || '자동 저장';

  function renderList() {
    const items = versions.list(projectId);
    if (!items.length) {
      listEl.innerHTML = '<div class="verp-empty">아직 버전이 없어요.<br>편집하면 자동으로 남아요.</div>';
      selected = null;
      renderPreview();
      return;
    }
    if (!selected || !items.some((m) => m.id === selected)) selected = items[0].id;
    listEl.replaceChildren(...items.map((m) => {
      const el = document.createElement('div');
      el.className = 'verp-item' + (m.id === selected ? ' on' : '') + (m.auto ? ' auto' : '');
      el.dataset.id = m.id;
      el.tabIndex = m.id === selected ? 0 : -1;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(m.id === selected));
      const b = document.createElement('b'); b.textContent = title(m);
      const s = document.createElement('span'); s.textContent = `${relTime(m.ts)} · ${fmtFull(m.ts)}`;
      const c = document.createElement('small'); c.textContent = `화면 ${m.pages}개 · 요소 ${m.shapes}개`;
      el.append(b, s, c);
      return el;
    }));
    renderPreview();
  }

  function renderPreview() {
    const m = selected && versions.list(projectId).find((x) => x.id === selected);
    if (!m) { pvEl.innerHTML = ''; return; }
    const doc = versions.get(projectId, m.id);
    const pages = doc ? docPages(doc) : [];
    pvEl.replaceChildren();
    const hd = document.createElement('div');
    hd.className = 'verp-pvhd';
    const nm = document.createElement('input');
    nm.className = 'verp-name';
    nm.value = m.label;
    nm.placeholder = '이름 없는 자동 저장 — 이름을 붙이면 오래 보관돼요';
    nm.maxLength = LABEL_MAX;
    nm.setAttribute('aria-label', '이 버전의 이름');
    nm.addEventListener('change', () => { versions.rename(projectId, m.id, nm.value); renderList(); });
    nm.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); nm.blur(); } });
    const when = document.createElement('span');
    when.textContent = fmtFull(m.ts);
    hd.append(nm, when);

    const grid = document.createElement('div');
    grid.className = 'verp-pages';
    pages.forEach((p, i) => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.alt = '';
      img.src = svgDataUrl(pageThumbSvg(p, () => { if (selected === m.id) renderPreview(); }));
      const cap = document.createElement('figcaption');
      cap.textContent = `${i + 1}. ${p.screenName || '제목 없음'}${p.mode === 'edit' ? ' · 변경' : ''}`;
      fig.append(img, cap);
      grid.append(fig);
    });
    if (!doc) grid.innerHTML = '<div class="verp-empty">이 버전을 읽지 못했어요.</div>';

    const acts = document.createElement('div');
    acts.className = 'verp-acts';
    const del = Object.assign(document.createElement('button'), { type: 'button', className: 'btn sm', textContent: '삭제' });
    const copy = Object.assign(document.createElement('button'), { type: 'button', className: 'btn sm', textContent: '새 프로젝트로 열기' });
    const restore = Object.assign(document.createElement('button'), { type: 'button', className: 'btn sm pri', textContent: '이 버전으로 복원' });
    [copy, restore].forEach((b) => { b.disabled = !doc; });
    del.addEventListener('click', () => {
      if (del.dataset.confirm !== '1') { del.dataset.confirm = '1'; del.textContent = '한 번 더 누르면 삭제'; del.classList.add('dng'); return; }
      versions.remove(projectId, m.id);
      renderList();
    });
    copy.addEventListener('click', () => { close(); onOpenCopy(m.id, m); });
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      const ok = await onRestore(m.id, m);
      if (ok) close(); else { restore.disabled = false; renderList(); }
    });
    acts.append(del, copy, restore);
    pvEl.append(hd, grid, acts);
  }

  listEl.addEventListener('click', (e) => {
    const el = e.target.closest('.verp-item');
    if (!el) return;
    selected = el.dataset.id;
    renderList();
    listEl.querySelector('.verp-item.on')?.focus();
  });
  listEl.addEventListener('keydown', (e) => {
    const els = [...listEl.querySelectorAll('.verp-item')];
    const i = els.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : -1;
    if (j >= 0 && j < els.length) {
      e.preventDefault();
      selected = els[j].dataset.id;
      renderList();
      listEl.querySelector('.verp-item.on')?.focus();
    }
  });

  const save = async () => {
    const label = labelEl.value.trim();
    if (!label) { labelEl.focus(); labelEl.placeholder = '버전 이름을 입력해 주세요'; return; }
    const ok = await onSaveNamed(label);
    if (ok) { labelEl.value = ''; selected = null; renderList(); }
  };
  box.querySelector('#verpSave').addEventListener('click', save);
  labelEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(); } });

  renderList();
  labelEl.focus();
}
