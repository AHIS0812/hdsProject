// 화면 하단 토스트 알림.

let timer;

export function toast(msg, ms = 2400) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), ms);
}
