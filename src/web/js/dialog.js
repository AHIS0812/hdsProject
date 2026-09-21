// 앱 안에서 뜨는 작은 확인/입력 대화상자 (window.confirm/prompt 대체).
// 저장 안 한 변경 확인, 프로젝트 이름 입력, 삭제 확인에 쓴다. DOM 은 열 때만 만든다.

/**
 * @param {{
 *   title: string,
 *   message?: string,
 *   input?: { value?: string, placeholder?: string, maxLength?: number, label?: string },
 *   buttons: { label: string, action: string, kind?: 'primary'|'danger'|'default' }[],
 * }} opts  buttons 의 kind==='primary' 가 Enter 기본 동작, Esc/바깥 클릭은 취소(null).
 * @returns {Promise<{ action: string, value: string } | null>}
 */
export function showDialog({ title, message, input, buttons }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const mask = document.createElement('div');
    mask.className = 'dlg-mask';
    const box = document.createElement('div');
    box.className = 'dlg';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const titleId = 'dlgTitle' + Date.now();
    box.setAttribute('aria-labelledby', titleId);

    const h = document.createElement('b');
    h.className = 'dlg-title';
    h.id = titleId;
    h.textContent = title;
    box.append(h);

    if (message) {
      const p = document.createElement('p');
      p.className = 'dlg-msg';
      p.textContent = message;
      box.append(p);
    }

    let field = null;
    if (input) {
      if (input.label) {
        const l = document.createElement('label');
        l.className = 'dlg-label';
        l.textContent = input.label;
        box.append(l);
        field = document.createElement('input');
        l.append(field);
      } else {
        field = document.createElement('input');
        box.append(field);
      }
      field.className = 'dlg-input';
      field.value = input.value ?? '';
      field.placeholder = input.placeholder ?? '';
      field.maxLength = input.maxLength ?? 40;
      field.autocomplete = 'off';
    }

    const foot = document.createElement('div');
    foot.className = 'dlg-foot';
    const btnEls = buttons.map((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn sm' + (b.kind === 'primary' ? ' pri' : b.kind === 'danger' ? ' dng' : '');
      el.textContent = b.label;
      el.addEventListener('click', () => close({ action: b.action, value: field ? field.value : '' }));
      foot.append(el);
      return el;
    });
    box.append(foot);
    mask.append(box);

    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      mask.remove();
      try { prevFocus?.focus?.(); } catch { /* 포커스 복원 실패는 무시 */ }
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); return; }
      if (e.key === 'Enter' && (field ? e.target === field : true)) {
        const i = buttons.findIndex((b) => b.kind === 'primary');
        // 입력창이 아닌 버튼에 포커스가 있을 땐 그 버튼의 기본 동작(클릭)에 맡긴다
        if (i >= 0 && (!e.target.closest?.('button'))) { e.preventDefault(); btnEls[i].click(); }
        return;
      }
      if (e.key === 'Tab') {
        const f = [...box.querySelectorAll('input,button')];
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(null); });

    document.body.append(mask);
    if (field) { field.focus(); field.select(); }
    else (btnEls[buttons.findIndex((b) => b.kind === 'primary')] || btnEls[btnEls.length - 1])?.focus();
  });
}
