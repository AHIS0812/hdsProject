// 프로젝트 보관소 — 이름 붙인 작업(프로젝트)을 브라우저 localStorage 에 여러 개 보관한다.
// 저장소(storage)를 주입받는 순수 로직이라 Node 테스트에서도 쓸 수 있다.
//
// 키는 예전 "저장본" 슬롯과 같다 — 이미 만들어 둔 저장본이 그대로 프로젝트 목록에 나타난다.
//   hds:saves        목록 메타 [{ id, name, updatedAt, createdAt?, screenName, mode, shapes }]
//   hds:save:<id>    프로젝트 본문(currentDoc 형식)

const INDEX_KEY = 'hds:saves';
const DOC_PREFIX = 'hds:save:';
export const NAME_MAX = 40;

/** 앞뒤 공백 제거 + 길이 제한 */
export const cleanName = (s) => String(s ?? '').trim().slice(0, NAME_MAX);

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

  const store = {
    /** 최근 저장 순 */
    list() {
      return readIndex().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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
        return doc && Array.isArray(doc.shapes) ? doc : null;
      } catch { return null; }
    },
    newId() {
      return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    },
    isNameTaken(name, exceptId) {
      const n = cleanName(name);
      return readIndex().some((m) => m.id !== exceptId && m.name === n);
    },
    /** 같은 이름이 있으면 "이름 (2)", "이름 (3)" … 으로 비켜 간다 */
    uniqueName(name, exceptId) {
      const base = cleanName(name) || '제목 없는 프로젝트';
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
     * 이미 있던 프로젝트는 손상되지 않는다.
     * @returns 저장된 메타
     */
    put({ id, name, doc }) {
      const list = readIndex();
      const prev = list.find((m) => m.id === id) || null;
      const meta = {
        id,
        name: cleanName(name) || '제목 없는 프로젝트',
        createdAt: prev?.createdAt || Date.now(),
        updatedAt: Date.now(),
        screenName: doc.screenName || '',
        mode: doc.mode === 'edit' ? 'edit' : 'new',
        shapes: doc.shapes.length,
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
      return meta;
    },
    /** 이름만 바꾼다(본문 내용은 그대로). 성공하면 새 메타, 이름 충돌이면 null */
    rename(id, name) {
      const n = cleanName(name);
      const list = readIndex();
      const prev = list.find((m) => m.id === id);
      if (!prev || !n || store.isNameTaken(n, id)) return null;
      const meta = { ...prev, name: n };
      writeIndex(list.map((m) => (m.id === id ? meta : m)));
      const doc = store.get(id);
      if (doc) {
        try { storage.setItem(DOC_PREFIX + id, JSON.stringify({ ...doc, projectName: n })); } catch { /* 이름은 목록에 이미 반영됨 */ }
      }
      return meta;
    },
    remove(id) {
      try { storage.removeItem(DOC_PREFIX + id); } catch { /* 무시 */ }
      writeIndex(readIndex().filter((m) => m.id !== id));
    },
  };
  return store;
}
