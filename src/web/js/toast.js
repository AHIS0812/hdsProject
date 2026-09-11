// 화면 하단 토스트 알림. 문구만 보여주거나, "되돌리기" 같은 실행 취소 버튼을 곁들일 수 있다.

let timer;

/**
 * @param {string} msg
 * @param {{ ms?:number, actionLabel?:string, onAction?:()=>void }} [opts]
 */
export function toast(msg, opts = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  const { ms = 2400, actionLabel, onAction } = opts;
  el.replaceChildren(document.createTextNode(msg));
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-act';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(timer);
      el.classList.remove('on');
      onAction();
    });
    el.append(btn);
  }
  el.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), ms);
}
