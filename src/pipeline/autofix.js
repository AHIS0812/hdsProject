// [담당 1] 자동 검증 루프 — 개발지시서 §4.2, §8 A-6
//
// XML well-formedness + (가능 시) WebSquare 스키마 검증 + HTML 렌더 sanity.
// 실패 시 검사 결과를 모델에 재입력해 수정, 최대 AUTOFIX_MAX_RETRIES 회.

const MAX = Number(process.env.AUTOFIX_MAX_RETRIES) || 3;

/**
 * @param {{ websquareXml: string, previewHtml: string }} output
 * @param {object} ctx { providers, ir }
 * @returns {Promise<{ output: object, retries: number, ok: boolean, log: string }>}
 */
export async function autofix(output, ctx) {
  // TODO(A-6): 검사 → 실패 시 재수정 루프.
  return { output, retries: 0, ok: true, log: `autofix 미구현 (max=${MAX})` };
}
