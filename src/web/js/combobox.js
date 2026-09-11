// 재사용 검색형 콤보박스 (드롭다운 + 타입어헤드). 개발지시서 U-1b.
// 시스템 선택 / 변경할 화면 선택에 공통 사용.
//
// 마크업: <div class="cbox"><button class="cbin"></button>
//           <div class="cbpop"><input class="cbsearch"><div class="cblist"></div></div></div>

/**
 * @param {HTMLElement} root  .cbox 요소
 * @param {{ placeholder?:string, emptyText?:string, onPick?:(item|null)=>void }} opts
 * @returns {{ setItems, setPlaceholder, choose, get, reset }}
 */
export function makeCombo(root, opts = {}) {
  const btn = root.querySelector('.cbin');
  const pop = root.querySelector('.cbpop');
  const search = root.querySelector('.cbsearch');
  const list = root.querySelector('.cblist');
  let items = [];
  let value = null;
  let hl = -1;
  let filtered = [];

  function place() {
    const r = btn.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.width = r.width + 'px';
    const below = window.innerHeight - r.bottom;
    if (below < 260 && r.top > below) {
      pop.style.top = 'auto';
      pop.style.bottom = window.innerHeight - r.top + 5 + 'px';
    } else {
      pop.style.bottom = 'auto';
      pop.style.top = r.bottom + 5 + 'px';
    }
  }
  function open() {
    root.classList.add('open');
    place();
    search.value = '';
    draw('');
    setTimeout(() => search.focus(), 0);
  }
  function close() {
    root.classList.remove('open');
    hl = -1;
  }
  function matches(it, q) {
    const l = q.toLowerCase();
    return !q || it.name.toLowerCase().includes(l) || (it.sub || '').toLowerCase().includes(l);
  }
  function draw(q) {
    filtered = items.filter((it) => matches(it, q));
    if (filtered.length) {
      list.replaceChildren(
        ...filtered.map((it, i) => {
          const el = document.createElement('div');
          el.className = 'cbitem' + (it.id === value ? ' on' : '') + (i === hl ? ' hl' : '');
          el.dataset.id = it.id;
          el.textContent = it.name;
          if (it.sub) {
            const s = document.createElement('span');
            s.className = 'sub';
            s.textContent = it.sub;
            el.append(s);
          }
          el.onclick = () => pick(it.id);
          return el;
        }),
      );
    } else {
      const e = document.createElement('div');
      e.className = 'cbempty';
      e.textContent = opts.emptyText || '결과가 없습니다';
      list.replaceChildren(e);
    }
  }
  function pick(id) {
    value = id;
    const it = items.find((x) => x.id === id) || null;
    btn.textContent = it ? it.name : opts.placeholder || '선택';
    btn.classList.toggle('empty', !it);
    close();
    opts.onPick?.(it);
  }

  btn.onclick = () => (root.classList.contains('open') ? close() : open());
  search.oninput = () => {
    hl = -1;
    draw(search.value);
  };
  search.onkeydown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      hl = Math.min(filtered.length - 1, hl + 1);
      draw(search.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      hl = Math.max(0, hl - 1);
      draw(search.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[hl]) pick(filtered[hl].id);
    } else if (e.key === 'Escape') {
      close();
    }
  };
  document.addEventListener('mousedown', (e) => {
    if (!root.contains(e.target) && !pop.contains(e.target)) close();
  });
  document.querySelector('.pbd')?.addEventListener('scroll', close);
  window.addEventListener('resize', close);

  return {
    setItems(arr) {
      items = arr || [];
      value = null;
      draw('');
    },
    setPlaceholder(t) {
      if (!value) {
        btn.textContent = t;
        btn.classList.add('empty');
      }
    },
    choose(id, silent) {
      if (silent) {
        value = id;
        const it = items.find((x) => x.id === id) || null;
        btn.textContent = it ? it.name : opts.placeholder || '선택';
        btn.classList.toggle('empty', !it);
        close();
        return;
      }
      pick(id);
    },
    get() {
      return items.find((x) => x.id === value) || null;
    },
    reset() {
      value = null;
      btn.textContent = opts.placeholder || '선택';
      btn.classList.add('empty');
      draw('');
    },
  };
}
