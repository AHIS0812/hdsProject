// 시스템 보관소 — "이 화면이 어느 시스템 것인지" 를 사용자가 직접 관리한다. projects.js 와 같은 패턴
// (저장소를 주입받는 순수 로직, Node 테스트 가능) 이라 홈 화면·에디터가 함께 쓴다.
//
// 영업포탈·하이포탈·대표홈페이지 3개는 고정 시스템이라 이름 변경·삭제가 안 된다(순서 변경은 된다).
// 그 외 시스템은 홈 화면 "시스템 관리"에서 사용자가 자유롭게 추가·이름변경·삭제·순서 변경한다.
//
//   hds:systems   [{ id, name, createdAt }]  최초 실행 시 아래 LOCKED_SYSTEMS 로 한 번 채워진다.

const KEY = 'hds:systems';
export const NAME_MAX = 30;

/** 고정 시스템 — 삭제·이름변경 불가. 목록 저장 순서의 기본값이기도 하다 */
export const LOCKED_SYSTEMS = [
  { id: 'salesportal', name: '영업포탈' },
  { id: 'portal', name: '하이포탈' },
  { id: 'homepage', name: '대표홈페이지' },
];
const LOCKED_IDS = new Set(LOCKED_SYSTEMS.map((s) => s.id));

export const isLocked = (id) => LOCKED_IDS.has(id);
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
  // 저장 공간이 가득 찼거나(quota) 접근이 막힌 환경에서도 throw 없이 false 를 돌려준다 —
  // list() 는 화면을 그릴 때마다 seedIfEmpty() 를 통해 조용히 쓰기를 시도하므로, 여기서 막지
  // 않으면 홈/에디터 부팅이 그 예외 하나로 통째로 멈춘다.
  const write = (list) => {
    try { storage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
  };

  const store = {
    /**
     * 저장된 적이 없으면(최초 실행) 고정 시스템으로 한 번 채워 넣는다.
     * 이미 저장된 목록이 있어도, 나중에 새로 추가된 고정 시스템(예: 대표홈페이지)이 빠져 있으면
     * 사용자가 추가·정리해 둔 목록은 그대로 두고 그 항목만 뒤에 보충한다 — list()/앱 시작 시 호출
     */
    seedIfEmpty() {
      const cur = read();
      if (cur == null) {
        write(LOCKED_SYSTEMS.map((s) => ({ ...s, createdAt: Date.now() })));
        return;
      }
      const missing = LOCKED_SYSTEMS.filter((s) => !cur.some((x) => x.id === s.id));
      if (missing.length) write([...cur, ...missing.map((s) => ({ ...s, createdAt: Date.now() }))]);
    },
    /** 저장 순서(= 사용자가 정한 노출 순서) */
    list() {
      store.seedIfEmpty();
      const cur = read();
      // 정상 상황이면 seedIfEmpty() 가 이미 써 둔 값이 그대로 읽힌다. 저장 공간이 가득 차는 등
      // 쓰기 자체가 실패했을 때도, 화면엔 최소한 고정 시스템 3개는 보여야 해서 메모리로만 돌려준다
      // (다음 list() 호출 때 다시 쓰기를 시도한다 — 새로고침해도 저장이 안 된 것뿐 앱이 죽진 않는다).
      return cur ?? LOCKED_SYSTEMS.map((s) => ({ ...s, createdAt: Date.now() }));
    },
    get(id) {
      return store.list().find((s) => s.id === id) || null;
    },
    isLocked,
    isNameTaken(name, exceptId) {
      const n = cleanName(name);
      return store.list().some((s) => s.id !== exceptId && s.name === n);
    },
    newId() {
      return 'sys' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    },
    /** 새 시스템 추가(맨 뒤). 이름이 비었거나 이미 있거나 저장에 실패하면 null */
    create(name) {
      const n = cleanName(name);
      if (!n || store.isNameTaken(n)) return null;
      const list = store.list();
      const s = { id: store.newId(), name: n, createdAt: Date.now() };
      if (!write([...list, s])) return null;
      return s;
    },
    /** 이름 바꾸기 — 고정 시스템이거나, 없거나, 이름이 비었거나, 다른 시스템과 겹치거나, 저장에 실패하면 null */
    rename(id, name) {
      if (isLocked(id)) return null;
      const n = cleanName(name);
      if (!n) return null;
      const list = store.list();
      if (!list.some((s) => s.id === id)) return null;
      if (store.isNameTaken(n, id)) return null;
      const next = list.map((s) => (s.id === id ? { ...s, name: n } : s));
      if (!write(next)) return null;
      return next.find((s) => s.id === id);
    },
    /** 삭제 — 고정 시스템이거나 저장에 실패하면 false. 이 시스템을 쓰던 프로젝트는 그대로 남는다(카드에는 마지막 시스템명이 캐시돼 있어 계속 보인다) */
    remove(id) {
      if (isLocked(id)) return false;
      const list = store.list();
      if (!list.some((s) => s.id === id)) return false;
      return write(list.filter((s) => s.id !== id));
    },
    /** id 를 목록에서 dir(-1=위로/1=아래로) 만큼 옮긴다. 고정 시스템도 순서는 옮길 수 있다. 저장 실패 시 false */
    move(id, dir) {
      const list = store.list();
      const i = list.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return false;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return write(next);
    },
  };
  return store;
}
