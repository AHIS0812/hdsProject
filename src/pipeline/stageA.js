// [담당 1] Stage A — 정규화/해석: payload → 정규화 IR
// 개발지시서 §4.2, §8 A-4
//
// 책임:
//  - 러프한 좌표를 정렬된 행/섹션/그리드로 정리
//  - 요소를 사내 표준 componentKey / tokenKey 로 매핑
//  - 화면 유형별 패턴(조회영역/결과영역 등) 적용
//  - 불명확·누락 요소를 confidence / questions 로 표기
//  - mode=edit 시 baseScreen 대비 변경분으로 해석

/**
 * @param {object} payload  화면정의 payload (screen-draft.schema.json)
 * @param {object} ctx      { providers, catalog, attachments, baseScreen }
 * @returns {Promise<object>} 정규화 IR (ir.schema.json)
 */
export async function runStageA(payload, ctx) {
  throw new Error('Stage A 미구현 — 담당 1(A-4). 스캐폴딩 단계에서는 mock 결과가 반환됩니다.');
}
