// 프로젝트 카드용 썸네일 — 캔버스의 요소들을 아주 작은 SVG 와이어프레임으로 그린다.
// 에디터 DOM 없이 도형 데이터만으로 만들 수 있어(순수 함수) 저장할 때 함께 만들어 두고,
// 홈 화면은 이 문자열을 이미지로만 붙인다(프로젝트 본문을 열어 볼 필요가 없다).
// 도형 형식은 에디터 내부({ t, cols, fs })와 payload({ type, items, fontSize }) 둘 다 받는다.

const INK = '#334155';
const MUTE = '#94A3B8';
const LINE = '#C7CFDA';
const NAVY = '#0F3B7C';
const ORANGE = '#F5821F';
const MAX_SHAPES = 400;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

/** 조회·검색·저장처럼 "주 동작" 버튼은 주황으로 — 실제 화면 미리보기의 관례를 따른다 */
const isPrimary = (label) => /조회|검색|저장|등록|확인|생성/.test(label || '');

function textEl(x, y, size, fill, str, weight = 400, anchor = 'start') {
  if (!str) return '';
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" font-family="sans-serif">${esc(str)}</text>`;
}

/** 한 요소 → SVG 조각. 알 수 없는 타입은 옅은 점선 박스 */
function shapeSvg(s) {
  const type = s.type || s.t;
  const x = num(s.x); const y = num(s.y);
  const w = Math.max(1, num(s.w, 40)); const h = Math.max(1, num(s.h, 20));
  const label = s.label != null ? String(s.label) : '';
  const items = String(s.items ?? s.cols ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  const fs = Math.max(9, Math.min(48, num(s.fontSize ?? s.fs, 12)));
  const mid = y + h / 2 + fs * 0.35;
  const box = (fill, stroke, extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" ${extra}/>`;

  switch (type) {
    case 'title':
      return textEl(x, mid, Math.max(fs, 14), '#0F172A', clip(label, 40), 700);
    case 'label':
      return textEl(x, mid, fs, INK, clip(label, 40));
    case 'text':
      return box('#fff', LINE, 'rx="2"') + textEl(x + 6, y + fs + 4, fs, MUTE, clip(label, 30));
    case 'input':
    case 'date':
      return box('#fff', LINE, 'rx="2"') + textEl(x + 6, mid, fs, MUTE, clip(label, 24));
    case 'select':
      return box('#fff', LINE, 'rx="2"')
        + `<path d="M${x + w - 16} ${y + h / 2 - 2} l5 5 l5 -5 z" fill="${MUTE}"/>`
        + textEl(x + 6, mid, fs, MUTE, clip(items[0] || label, 20));
    case 'radio': {
      const opts = items.length ? items : ['선택'];
      const step = w / opts.length;
      return opts.slice(0, 6).map((o, i) => {
        const cx = x + i * step + 7;
        return `<circle cx="${cx}" cy="${y + h / 2}" r="5" fill="#fff" stroke="${MUTE}" stroke-width="1.2"/>`
          + (i === 0 ? `<circle cx="${cx}" cy="${y + h / 2}" r="2.6" fill="${NAVY}"/>` : '')
          + textEl(cx + 10, mid, fs, INK, clip(o, 10));
      }).join('');
    }
    case 'check':
      return `<rect x="${x}" y="${y + h / 2 - 6}" width="12" height="12" rx="2" fill="#fff" stroke="${MUTE}" stroke-width="1.2"/>`
        + textEl(x + 18, mid, fs, INK, clip(label, 24));
    case 'file':
      return box('#fff', LINE, 'rx="2"') + textEl(x + 6, mid, fs, MUTE, '파일 선택');
    case 'list': {
      const cols = items.length ? items : ['', '', ''];
      const cw = w / cols.length;
      const rowH = Math.max(14, Math.min(24, h / 5));
      const head = `<rect x="${x}" y="${y}" width="${w}" height="${rowH}" fill="#E8EEF7"/>`
        + cols.slice(0, 10).map((c, i) => textEl(x + i * cw + cw / 2, y + rowH * 0.7, Math.min(fs, rowH * 0.6), NAVY, clip(c, 8), 700, 'middle')).join('');
      const rows = [];
      for (let ry = y + rowH; ry < y + h - 1; ry += rowH) rows.push(`<line x1="${x}" y1="${ry}" x2="${x + w}" y2="${ry}" stroke="#E5EAF1" stroke-width="1"/>`);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${LINE}" stroke-width="1.2"/>` + head + rows.join('');
    }
    case 'pager': {
      const n = Math.max(3, Math.min(6, Math.floor(w / 22)));
      const gap = w / n;
      return Array.from({ length: n }, (_, i) =>
        `<rect x="${x + i * gap + 2}" y="${y + 2}" width="${Math.min(18, gap - 4)}" height="${Math.max(6, h - 4)}" rx="2" fill="${i === 1 ? NAVY : '#fff'}" stroke="${LINE}" stroke-width="1"/>`).join('');
    }
    case 'tab': {
      const tabs = items.length ? items : ['탭1', '탭2'];
      const tw = w / tabs.length;
      return tabs.slice(0, 8).map((t, i) =>
        `<rect x="${x + i * tw}" y="${y}" width="${tw - 2}" height="${h}" rx="3" fill="${i === 0 ? NAVY : '#F1F5F9'}" stroke="${LINE}" stroke-width="1"/>`
        + textEl(x + i * tw + tw / 2 - 1, mid, Math.min(fs, h * 0.6), i === 0 ? '#fff' : INK, clip(t, 8), 600, 'middle')).join('');
    }
    case 'image':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F1F5F9" stroke="${LINE}" stroke-width="1.2"/>`
        + `<path d="M${x} ${y} L${x + w} ${y + h} M${x + w} ${y} L${x} ${y + h}" stroke="#D5DCE6" stroke-width="1"/>`;
    case 'button': {
      const fill = isPrimary(label) ? ORANGE : NAVY;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}"/>`
        + textEl(x + w / 2, mid, Math.min(fs, h * 0.7), '#fff', clip(label, 14), 700, 'middle');
    }
    case 'divider':
      return `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${LINE}" stroke-width="2"/>`;
    case 'area':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.2" stroke-dasharray="5 4"/>`
        + textEl(x + 8, y + 15, 11, MUTE, clip(label, 20), 600);
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F8FAFC" stroke="#CBD5E1" stroke-dasharray="4 3"/>`;
  }
}

/**
 * @param {object[]} shapes 에디터 내부 또는 payload 형식 요소 목록
 * @param {{ w:number, h:number }} [canvas] 캔버스 크기(기본 960×600)
 * @param {{ background?: string|null }} [opts] background — 변경 화면의 캡처 배경(이미지 data URL).
 *   용량 때문에 makeBgThumb() 으로 줄인 것을 넘긴다. 에디터처럼 캔버스 전체에 늘려 깔고 그 위에 요소를 그린다.
 * @returns {string} 완결된 <svg> 문자열(폭·높이는 부모에 맞춰 늘어나는 viewBox 형식)
 */
export function thumbnailSvg(shapes, canvas, opts = {}) {
  const W = Math.max(1, num(canvas?.w, 960));
  const H = Math.max(1, num(canvas?.h, 600));
  const body = (Array.isArray(shapes) ? shapes : []).slice(0, MAX_SHAPES).map(shapeSvg).join('');
  const bg = typeof opts.background === 'string' && opts.background.startsWith('data:image/')
    ? `<image xlink:href="${esc(opts.background)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`
    + `<rect width="${W}" height="${H}" fill="#fff"/>${bg}${body}</svg>`;
}

/**
 * 캡처 배경 이미지를 썸네일용으로 줄인다(브라우저 전용, 캔버스 사용). 원본은 수백 KB~수 MB 라 그대로 썸네일에
 * 넣으면 저장 공간을 잡아먹는다 — 가로 maxW px 의 JPEG 로 줄이면 수십 KB. 투명한 PNG 는 흰 바탕에 합성한다.
 * @returns {Promise<string|null>} data URL, 실패하거나 브라우저가 아니면 null
 */
export function makeBgThumb(src, maxW = 360) {
  if (typeof src !== 'string' || !src.startsWith('data:image/') || typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, maxW / (img.naturalWidth || maxW));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((img.naturalWidth || maxW) * k));
        c.height = Math.max(1, Math.round((img.naturalHeight || maxW * 0.625) * k));
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** <img src> 로 쓸 수 있는 data URL — 스크립트가 실행되지 않는 이미지로만 다룬다 */
export const svgDataUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

// ── 캡처 배경 썸네일 캐시 — 원본(수백 KB~MB)을 줄인 이미지를 한 번만 만든다(버전 기록 미리보기 등)
const bgCache = new Map(); // key → url | null(만드는 중)
/**
 * 줄인 배경 이미지를 돌려준다. 아직 없으면 만들기 시작하고 null — 다 만들어지면 onReady(url) 을 부른다.
 * @returns {string|null}
 */
export function cachedBgThumb(src, onReady) {
  if (typeof src !== 'string' || !src.startsWith('data:image/')) return null;
  const k = `${src.length}:${src.slice(-48)}`;
  if (bgCache.has(k)) return bgCache.get(k);
  bgCache.set(k, null);
  makeBgThumb(src).then((url) => {
    bgCache.set(k, url);
    if (url) onReady?.(url);
  });
  return null;
}

/** 화면 하나({ shapes, canvas, background })의 썸네일 SVG — 배경이 준비 안 됐으면 요소만 */
export function pageThumbSvg(page, onBgReady) {
  return thumbnailSvg(page.shapes, page.canvas, { background: cachedBgThumb(page.background, onBgReady) });
}
