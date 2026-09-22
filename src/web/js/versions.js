// 프로젝트 버전 기록 — 저장할 때마다 일정 간격으로 자동 버전을 남기고, 사용자가 이름 붙인 버전은 따로 오래 보관한다.
// 저장소(storage)를 주입받는 순수 로직(Node 테스트 가능). 프로젝트 보관소(projects.js)가 함께 쓴다.
//
//   hds:ver:<projectId>            { items: [{ id, ts, label, auto, pages, shapes, doc }] } — 최신이 앞
//   hds:asset:<projectId>:<hash>   큰 이미지(data URL) 본체 — 여러 버전이 같은 이미지를 한 번만 저장해 공유
//
// 캡처 배경·이미지 요소는 수백 KB~MB 라 버전마다 그대로 넣으면 localStorage(약 5MB)가 금방 찬다.
// 그래서 버전 본문에서는 "@asset:<hash>" 참조로 바꿔 두고, 참조가 모두 사라진 이미지는 지운다.

import { docPages, docSignature } from './doc-model.js';

const VER_PREFIX = 'hds:ver:';
const ASSET_PREFIX = 'hds:asset:';
const REF = '@asset:';
/** 이 길이를 넘는 data URL 만 에셋으로 뺀다(작은 아이콘까지 빼면 오히려 키만 늘어난다) */
const ASSET_MIN = 2048;
export const AUTO_KEEP = 20;   // 자동 버전 최대 개수
export const NAMED_KEEP = 30;  // 이름 붙인 버전 최대 개수
/** 자동 버전 간격 — 마지막 버전 뒤로 이만큼 지난 다음 저장에서 새 자동 버전을 남긴다 */
export const AUTO_INTERVAL_MS = 10 * 60_000;
export const LABEL_MAX = 40;

/** 짧은 내용 해시(FNV-1a 32bit + 길이) — 같은 이미지를 알아보는 용도 */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return s.length.toString(36) + '_' + (h >>> 0).toString(36);
}

const isBig = (v) => typeof v === 'string' && v.startsWith('data:image/') && v.length > ASSET_MIN;

/** doc 안의 큰 이미지를 참조로 바꾼 사본과, 꺼낸 이미지 목록 */
function externalize(doc) {
  const assets = new Map();
  const out = JSON.parse(JSON.stringify(doc, (k, v) => {
    if ((k === 'background' || k === 'src') && isBig(v)) {
      const h = hashString(v);
      assets.set(h, v);
      return REF + h;
    }
    return v;
  }));
  return { doc: out, assets };
}

function refsOf(doc) {
  const set = new Set();
  JSON.stringify(doc, (k, v) => {
    if (typeof v === 'string' && v.startsWith(REF)) set.add(v.slice(REF.length));
    return v;
  });
  return set;
}

/**
 * @param {Pick<Storage,'getItem'|'setItem'|'removeItem'>} storage
 */
export function createVersionStore(storage) {
  const key = (pid) => VER_PREFIX + pid;
  const assetKey = (pid, h) => `${ASSET_PREFIX}${pid}:${h}`;
  const read = (pid) => {
    try {
      const r = JSON.parse(storage.getItem(key(pid)) || 'null');
      return r && Array.isArray(r.items) ? r : { items: [] };
    } catch { return { items: [] }; }
  };
  const allRefs = (items) => {
    const set = new Set();
    items.forEach((it) => refsOf(it.doc).forEach((h) => set.add(h)));
    return set;
  };
  /** 참조가 끊긴 에셋 정리 — 이전 목록에는 있었는데 새 목록에는 없는 해시만 지운다 */
  const gc = (pid, before, after) => {
    const live = allRefs(after);
    allRefs(before).forEach((h) => { if (!live.has(h)) { try { storage.removeItem(assetKey(pid, h)); } catch { /* 무시 */ } } });
  };
  const meta = ({ doc, ...m }) => m;

  /** 오래된 것부터 개수 제한을 넘는 버전을 걷어낸다(자동·이름 붙인 버전 따로 센다) */
  const prune = (items) => {
    let auto = 0; let named = 0;
    return items.filter((it) => (it.auto ? ++auto <= AUTO_KEEP : ++named <= NAMED_KEEP));
  };

  const vs = {
    /** 버전 목록(본문 제외), 최신이 앞 */
    list(pid) {
      return read(pid).items.map(meta);
    },
    latest(pid) {
      const it = read(pid).items[0];
      return it ? meta(it) : null;
    },
    /** 버전 본문(이미지 참조를 실제 data URL 로 되돌려서). 없으면 null */
    get(pid, vid) {
      const it = read(pid).items.find((x) => x.id === vid);
      if (!it) return null;
      return JSON.parse(JSON.stringify(it.doc), (k, v) => {
        if (typeof v === 'string' && v.startsWith(REF)) {
          const data = storage.getItem(assetKey(pid, v.slice(REF.length)));
          return data || undefined; // 이미지가 사라졌으면 그 필드만 비운다(나머지는 복원)
        }
        return v;
      });
    },
    /**
     * 버전을 남긴다. 바로 앞 버전과 내용이 같으면 새로 만들지 않고 null(이름을 주면 그 버전에 이름을 붙인다).
     * 저장 공간이 모자라면 오래된 자동 버전부터 지우며 다시 시도하고, 그래도 안 되면 예외를 던진다.
     * @param {{ label?: string, auto?: boolean, now?: number }} [opts]
     */
    add(pid, doc, { label = '', auto = true, now = Date.now() } = {}) {
      const rec = read(pid);
      const before = rec.items;
      const clean = String(label || '').trim().slice(0, LABEL_MAX);
      const { doc: slim, assets } = externalize(doc);
      const sig = docSignature(slim);
      const head = before[0];
      if (head && docSignature(head.doc) === sig) {
        if (!clean) return null;
        // 같은 내용의 버전이 이미 있으면 새로 만들지 않는다. 이름 없는 자동 버전이면 그 버전에 이름을 붙이고,
        // 사용자가 이미 이름 붙여 둔 버전이면 그 이름을 덮어쓰지 않고 그대로 돌려준다(예: "복원 직전" 이
        // "1차 검토본" 을 지워 버리던 문제).
        return head.label ? meta(head) : vs.rename(pid, head.id, clean);
      }
      let prev = before;
      const pages = docPages(doc);
      const item = {
        id: 'v' + now.toString(36) + Math.random().toString(36).slice(2, 5),
        ts: now,
        label: clean,
        auto: !clean && auto,
        pages: pages.length,
        shapes: pages.reduce((n, p) => n + p.shapes.length, 0),
        doc: slim,
      };
      // 이미지 먼저(이미 있는 건 건너뜀), 그다음 목록. 목록을 쓰다 실패해도 남는 건 참조 없는 이미지뿐이다.
      const written = new Set();
      const dropWritten = (keepRefs) => written.forEach((h) => {
        if (!keepRefs.has(h)) { try { storage.removeItem(assetKey(pid, h)); } catch { /* 무시 */ } }
      });
      for (;;) {
        const items = prune([item, ...prev]);
        try {
          for (const [h, data] of assets) {
            if (storage.getItem(assetKey(pid, h)) == null) { storage.setItem(assetKey(pid, h), data); written.add(h); }
          }
          storage.setItem(key(pid), JSON.stringify({ items }));
          gc(pid, prev, items);
          return meta(item);
        } catch (e) {
          // 공간 부족 — 가장 오래된 자동 버전 하나를 "먼저 목록에서 확정해 지운 뒤" 그 이미지를 치우고 다시 시도한다
          // (목록에 아직 남아 있는 버전의 이미지를 먼저 지우면, 여기서 실패했을 때 그 버전이 깨진다)
          const idx = prev.map((x, i) => (x.auto ? i : -1)).filter((i) => i >= 0).pop();
          if (idx == null) { dropWritten(allRefs(prev)); throw e; }
          const smaller = prev.filter((_, i) => i !== idx);
          try { storage.setItem(key(pid), JSON.stringify({ items: smaller })); } catch { dropWritten(allRefs(prev)); throw e; }
          gc(pid, prev, smaller);
          prev = smaller;
        }
      }
    },
    /** 버전에 이름을 붙이거나 바꾼다 — 이름이 붙으면 자동 정리 대상에서 빠진다. 빈 이름이면 다시 자동 버전 */
    rename(pid, vid, label) {
      const rec = read(pid);
      const it = rec.items.find((x) => x.id === vid);
      if (!it) return null;
      it.label = String(label || '').trim().slice(0, LABEL_MAX);
      it.auto = !it.label;
      const items = prune(rec.items);
      storage.setItem(key(pid), JSON.stringify({ items }));
      gc(pid, rec.items, items);
      return meta(it);
    },
    remove(pid, vid) {
      const rec = read(pid);
      const items = rec.items.filter((x) => x.id !== vid);
      if (items.length === rec.items.length) return false;
      storage.setItem(key(pid), JSON.stringify({ items }));
      gc(pid, rec.items, items);
      return true;
    },
    /** 프로젝트를 영구 삭제할 때 — 버전·이미지 전부 */
    removeAll(pid) {
      const rec = read(pid);
      allRefs(rec.items).forEach((h) => { try { storage.removeItem(assetKey(pid, h)); } catch { /* 무시 */ } });
      try { storage.removeItem(key(pid)); } catch { /* 무시 */ }
    },
    /** 이 프로젝트 버전 기록이 차지하는 글자 수(추정) */
    usage(pid) {
      const raw = storage.getItem(key(pid)) || '';
      let chars = raw.length;
      allRefs(read(pid).items).forEach((h) => { chars += (storage.getItem(assetKey(pid, h)) || '').length; });
      return chars;
    },
    /** 지금 자동 버전을 남길 때가 됐는지(마지막 버전 이후 AUTO_INTERVAL_MS 경과, 또는 버전이 없음) */
    dueForAuto(pid, now = Date.now(), interval = AUTO_INTERVAL_MS) {
      const last = read(pid).items[0];
      return !last || now - last.ts >= interval;
    },
  };
  return vs;
}
