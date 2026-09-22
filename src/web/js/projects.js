// 프로젝트 보관소 — 이름 붙인 작업(프로젝트)을 브라우저 localStorage 에 여러 개 보관한다.
// 저장소(storage)를 주입받는 순수 로직이라 Node 테스트에서도 쓸 수 있다. 홈(프로젝트 관리)·에디터가 함께 쓴다.
//
// 키는 예전 "저장본" 슬롯과 같다 — 이미 만들어 둔 저장본이 그대로 프로젝트 목록에 나타난다.
//   hds:saves          목록 메타 [{ id, name, createdAt, updatedAt, lastOpenedAt, favorite, trashedAt,
//                                  screenName, mode, systemId, systemName, hasBg, shapes, pages, canvas }]
//   hds:save:<id>      프로젝트 본문(currentDoc 형식)
//   hds:thumb:<id>     카드용 썸네일(SVG 문자열) — 없어도 프로젝트는 정상 동작
//   hds:ver:<id> …     버전 기록(versions.js)
//
// 본문은 v2(여러 화면, doc-model.js) — 예전 v1(화면 하나) 본문도 그대로 읽힌다.

import { isProjectDoc, docSummary } from './doc-model.js';
import { createVersionStore } from './versions.js';

const INDEX_KEY = 'hds:saves';
const DOC_PREFIX = 'hds:save:';
const THUMB_PREFIX = 'hds:thumb:';
export const NAME_MAX = 40;
export const UNTITLED = '제목 없는 프로젝트';
/** 휴지통에 이 기간(일)이 지나면 영구 삭제 */
export const TRASH_KEEP_DAYS = 30;
/** localStorage 대략 한도(글자 수 기준, 브라우저마다 다름) — 사용량 표시용 */
export const STORAGE_LIMIT_CHARS = 5_000_000;

const DAY = 86_400_000;

/** 앞뒤 공백 제거 + 길이 제한 */
export const cleanName = (s) => String(s ?? '').trim().slice(0, NAME_MAX);

/** 브라우저 localStorage — 막혀 있으면(사생활 보호 모드 등) 이 탭이 열려 있는 동안만 유지되는 메모리 저장소 */
export function browserStorage() {
  try {
    globalThis.localStorage.getItem('hds:probe');
    return globalThis.localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
  }
}

/**
 * @param {Pick<Storage,'getItem'|'setItem'|'removeItem'>} storage
 */
export function createProjectStore(storage) {
  const readIndex = () => {
    try {
      const a = JSON.parse(storage.getItem(INDEX_KEY) || '[]');
      return Array.isArray(a) ? a.filter((m) => m && typeof m.id === 'string') : [];
    } catch { return []; }
  };
  const writeIndex = (list) => storage.setItem(INDEX_KEY, JSON.stringify(list));
  /** 목록의 한 항목만 고쳐 쓴다. 없으면 null */
  const patch = (id, fn) => {
    const list = readIndex();
    const prev = list.find((m) => m.id === id);
    if (!prev) return null;
    const next = fn({ ...prev });
    writeIndex(list.map((m) => (m.id === id ? next : m)));
    return next;
  };

  const versions = createVersionStore(storage);
  const store = {
    /** 버전 기록 저장소(versions.js) */
    versions,
    /**
     * @param {{ trashed?: boolean }} [opts] trashed=true 면 휴지통 항목만, 기본은 휴지통 제외
     * 최근 수정 순
     */
    list({ trashed = false } = {}) {
      return readIndex()
        .filter((m) => (trashed ? !!m.trashedAt : !m.trashedAt))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    /** 휴지통 포함 전체(홈에서 개수 집계용) */
    all() {
      return readIndex();
    },
    meta(id) {
      return readIndex().find((m) => m.id === id) || null;
    },
    has(id) {
      return !!id && !!store.meta(id);
    },
    /** 프로젝트 본문. 없거나 깨졌으면 null */
    get(id) {
      try {
        const doc = JSON.parse(storage.getItem(DOC_PREFIX + id) || 'null');
        return isProjectDoc(doc) ? doc : null;
      } catch { return null; }
    },
    thumb(id) {
      try { return storage.getItem(THUMB_PREFIX + id) || null; } catch { return null; }
    },
    /** 썸네일만 따로 저장(예전 프로젝트에 썸네일이 없을 때 홈이 채워 넣는다). 성공 여부 */
    setThumb(id, svg) {
      try { storage.setItem(THUMB_PREFIX + id, svg); return true; } catch { return false; }
    },
    newId() {
      return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    },
    /** 휴지통 밖에서 이름이 겹치는지(휴지통 항목은 제외) */
    isNameTaken(name, exceptId) {
      const n = cleanName(name);
      return readIndex().some((m) => m.id !== exceptId && !m.trashedAt && m.name === n);
    },
    /** 같은 이름이 있으면 "이름 (2)", "이름 (3)" … 으로 비켜 간다 */
    uniqueName(name, exceptId) {
      const base = cleanName(name) || UNTITLED;
      if (!store.isNameTaken(base, exceptId)) return base;
      for (let i = 2; i < 1000; i++) {
        const suffix = ` (${i})`;
        const cand = base.slice(0, NAME_MAX - suffix.length) + suffix;
        if (!store.isNameTaken(cand, exceptId)) return cand;
      }
      return base;
    },
    /**
     * 저장(있으면 덮어쓰기, 없으면 새로 만들기). 저장 공간이 부족하면 예외를 던지고,
     * 이미 있던 프로젝트는 손상되지 않는다. 즐겨찾기·만든 시각·마지막으로 연 시각은 유지하고,
     * 휴지통에 있던 프로젝트를 저장하면 복원된다(작업 중이라는 뜻이므로).
     * thumb 는 선택 — 실패해도 저장 자체는 성공한다.
     * @returns 저장된 메타
     */
    put({ id, name, doc, thumb }) {
      const list = readIndex();
      const prev = list.find((m) => m.id === id) || null;
      const now = Date.now();
      const sum = docSummary(doc);
      const meta = {
        id,
        name: cleanName(name) || UNTITLED,
        createdAt: prev?.createdAt || now,
        updatedAt: now,
        lastOpenedAt: prev?.lastOpenedAt || now,
        favorite: !!prev?.favorite,
        trashedAt: null,
        screenName: sum.screenName || '',
        mode: sum.mode,
        systemId: doc.systemId || null,
        systemName: doc.systemName || prev?.systemName || null,
        hasBg: sum.hasBg,
        shapes: sum.shapes,
        pages: sum.pages,
        canvas: sum.canvas ? { w: sum.canvas.w, h: sum.canvas.h } : null,
      };
      const prevRaw = storage.getItem(DOC_PREFIX + id);
      try {
        storage.setItem(DOC_PREFIX + id, JSON.stringify({ ...doc, projectName: meta.name }));
        writeIndex([meta, ...list.filter((m) => m.id !== id)]);
      } catch (e) {
        // 본문만 쓰이고 목록 갱신이 실패한 경우를 되돌린다
        try {
          if (prevRaw == null) storage.removeItem(DOC_PREFIX + id);
          else storage.setItem(DOC_PREFIX + id, prevRaw);
        } catch { /* 되돌리기 실패는 무시 */ }
        throw e;
      }
      if (thumb != null) {
        try { storage.setItem(THUMB_PREFIX + id, thumb); } catch { /* 썸네일은 없어도 된다 */ }
      }
      return meta;
    },
    /** 새 프로젝트 만들기 — 이름 충돌은 "(2)" 로 비켜 간다 */
    create({ name, doc, thumb }) {
      const id = store.newId();
      return store.put({ id, name: store.uniqueName(name), doc, thumb });
    },
    /** 사본 만들기 — 본문·썸네일을 그대로 복사해 새 프로젝트로. 실패하면 null */
    duplicate(id, name) {
      const src = store.meta(id);
      const doc = store.get(id);
      if (!src || !doc) return null;
      return store.create({ name: name || `${src.name} 사본`, doc, thumb: store.thumb(id) });
    },
    /** 이름만 바꾼다(본문 내용·수정 시각은 그대로). 성공하면 새 메타, 이름 충돌·빈 이름이면 null */
    rename(id, name) {
      const n = cleanName(name);
      if (!n || !store.meta(id) || store.isNameTaken(n, id)) return null;
      const meta = patch(id, (m) => ({ ...m, name: n }));
      const doc = store.get(id);
      if (doc) {
        try { storage.setItem(DOC_PREFIX + id, JSON.stringify({ ...doc, projectName: n })); } catch { /* 이름은 목록에 이미 반영됨 */ }
      }
      return meta;
    },
    /** 목록 메타의 일부 필드만 고친다(수정 시각은 그대로) — 홈이 썸네일을 다시 만들며 hasBg 를 채울 때 쓴다 */
    setMeta(id, partial) {
      return patch(id, (m) => ({ ...m, ...partial }));
    },
    setFavorite(id, on) {
      return patch(id, (m) => ({ ...m, favorite: !!on }));
    },
    /** 프로젝트를 열었다고 기록(정렬·"최근 연" 용). 수정 시각은 건드리지 않는다 */
    touchOpened(id, now = Date.now()) {
      return patch(id, (m) => ({ ...m, lastOpenedAt: now }));
    },
    /** 휴지통으로 — 본문은 그대로 두고 표시만 한다 */
    trash(id, now = Date.now()) {
      return patch(id, (m) => ({ ...m, trashedAt: now }));
    },
    /** 휴지통에서 꺼낸다. 그 사이 같은 이름이 생겼으면 "(2)" 로 비켜 간다 */
    restore(id) {
      const cur = store.meta(id);
      if (!cur) return null;
      const name = store.uniqueName(cur.name, id);
      const meta = patch(id, (m) => ({ ...m, trashedAt: null, name }));
      if (name !== cur.name) {
        const doc = store.get(id);
        if (doc) { try { storage.setItem(DOC_PREFIX + id, JSON.stringify({ ...doc, projectName: name })); } catch { /* 무시 */ } }
      }
      return meta;
    },
    /** 영구 삭제 */
    remove(id) {
      try { storage.removeItem(DOC_PREFIX + id); } catch { /* 무시 */ }
      try { storage.removeItem(THUMB_PREFIX + id); } catch { /* 무시 */ }
      versions.removeAll(id);
      writeIndex(readIndex().filter((m) => m.id !== id));
    },
    emptyTrash() {
      const ids = readIndex().filter((m) => m.trashedAt).map((m) => m.id);
      ids.forEach((id) => store.remove(id));
      return ids.length;
    },
    /** 휴지통에 TRASH_KEEP_DAYS 일 넘게 있던 항목을 영구 삭제. 지운 개수 */
    purgeExpired(now = Date.now(), days = TRASH_KEEP_DAYS) {
      const ids = readIndex().filter((m) => m.trashedAt && now - m.trashedAt > days * DAY).map((m) => m.id);
      ids.forEach((id) => store.remove(id));
      return ids.length;
    },
    /** 저장 공간 사용량(글자 수 기준 추정) — 프로젝트 데이터만 센다 */
    usage() {
      let chars = (storage.getItem(INDEX_KEY) || '').length;
      for (const m of readIndex()) {
        chars += (storage.getItem(DOC_PREFIX + m.id) || '').length;
        chars += (storage.getItem(THUMB_PREFIX + m.id) || '').length;
        chars += versions.usage(m.id);
      }
      return { chars, limit: STORAGE_LIMIT_CHARS, ratio: Math.min(1, chars / STORAGE_LIMIT_CHARS) };
    },
  };
  return store;
}
