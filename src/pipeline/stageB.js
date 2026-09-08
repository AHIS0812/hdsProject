// [담당 1] Stage B — 코드 생성: 정규화 IR → WebSquare XML + Preview HTML + report
// 개발지시서 §4.2, §8 A-5
//
// 책임:
//  - 표준 컴포넌트(componentKey) 우선, 토큰 스타일 적용
//  - 더미 데이터 / 핸들러 stub, 실제 API 연동 없음
//  - 미사용 표준은 report.fallbacksApplied 에 기록

/**
 * @param {object} ir   정규화 IR (ir.schema.json)
 * @param {object} ctx  { providers, catalog, systemId }
 * @returns {Promise<{ websquareXml: string, previewHtml: string, report: object }>}
 */
export async function runStageB(ir, ctx) {
  throw new Error('Stage B 미구현 — 담당 1(A-5). 스캐폴딩 단계에서는 mock 결과가 반환됩니다.');
}
