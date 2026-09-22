// 시스템 보관소 — "이 화면이 어느 시스템 것인지" 를 사용자가 직접 관리한다. projects.js 와 같은 패턴
// (저장소를 주입받는 순수 로직, Node 테스트 가능) 이라 홈 화면·에디터가 함께 쓴다.
//
// 예전에는 운영 서버 목업(fixtures/systems.json)을 그대로 보여줬지만, 실제 화면 소스는 폐쇄망에 있어
// 가져올 방법이 없다. 대신 사용자가 시스템을 직접 추가·삭제하고, "신규 화면" 을 그 시스템에 저장해 두면
// "변경 화면" 에서 그 저장물들을 불러와 고치는 방식으로 바뀌었다.
//
//   hds:systems   [{ id, name, createdAt }]  최초 실행 시 아래 SEED 로 한 번 채워진다.

const KEY = 'hds:systems';
export const NAME_MAX = 30;

/** 최초 실행 시 시드값 — 예전 fixtures/systems.json 과 같다. 사용자가 지워도 다시 채워지지 않는다. */
export const SEED_SYSTEMS = [
  { id: 'salesportal', name: '영업포탈' },
  { id: 'portal', name: '하이포탈' },
  { id: 'hicall', name: '하이콜' },
];

export const cleanName = (s) => String(s ?? '').trim().slice(0, NAME_MAX);

/**
 * @param {Pick<Storage,'getItem'|'setItem'|'removeItem'>} storage
 */
export function createSystemStore(storage) {
  const read = () => {
    try {
      const a = JSON.parse(storage.getItem(KEY) || 'null');
      return Array.isArray(a) ? a.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string') : null;
    } catch { return null; }
  };
  const write = (list) => storage.setItem(KEY, JSON.stringify(list));

  const store = {
    /** 저장된 적이 없으면(최초 실행) 시드값을 한 번 채워 넣는다 — list()/앱 시작 시 호출 */
    seedIfEmpty() {
      if (read() != null) return;
      write(SEED_SYSTEMS.map((s) => ({ ...s, createdAt: Date.now() })));
    },
    /** 등록 순(오래된 것부터) */
    list() {
      store.seedIfEmpty();
      return read() || [];
    },
    get(id) {
      return store.list().find((s) => s.id === id) || null;
    },
    isNameTaken(name, exceptId) {
      const n = cleanName(name);
      return store.list().some((s) => s.id !== exceptId && s.name === n);
    },
    newId() {
      return 'sys' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    },
    /** 새 시스템 추가. 이름이 비었거나 이미 있으면 null */
    create(name) {
      const n = cleanName(name);
      if (!n || store.isNameTaken(n)) return null;
      const list = store.list();
      const s = { id: store.newId(), name: n, createdAt: Date.now() };
      write([...list, s]);
      return s;
    },
    /** 이름 바꾸기. 없거나 이름이 비었거나 다른 시스템과 겹치면 null */
    rename(id, name) {
      const n = cleanName(name);
      if (!n) return null;
      const list = store.list();
      if (!list.some((s) => s.id === id)) return null;
      if (store.isNameTaken(n, id)) return null;
      const next = list.map((s) => (s.id === id ? { ...s, name: n } : s));
      write(next);
      return next.find((s) => s.id === id);
    },
    /** 삭제 — 이 시스템을 쓰던 프로젝트는 그대로 남는다(카드에는 마지막 시스템명이 캐시돼 있어 계속 보인다) */
    remove(id) {
      write(store.list().filter((s) => s.id !== id));
    },
  };
  return store;
}
