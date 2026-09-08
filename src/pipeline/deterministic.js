// [담당 1] 결정론적 폴백 변환기 — 개발지시서 §4.2, D-7, §8 A-3
//
// AI 없이 payload → { websquareXml, previewHtml } 를 만드는 기준 변환기.
// - AI 장애 / 오프라인 시 동작
// - AI 산출물 회귀 판단의 기준선
//
// 예시 프로토타입 samples/화면스케치스튜디오_예시_v1.html 의 compile() / el() / x1() 을
// 옮겨와 발전시킬 것. 지금은 최소 stub.

/**
 * @param {object} payload 화면정의 payload
 * @returns {{ websquareXml: string, previewHtml: string }}
 */
export function compileDeterministic(payload) {
  const title = payload.screenName || payload.baseScreen?.name || '무제 화면';
  const previewHtml =
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title></head>` +
    `<body><h1>${title}</h1><p>결정론적 변환기 미구현 (A-3). shapes ${payload.shapes.length}개.</p></body></html>`;
  const websquareXml = `<!-- ${title}: 결정론적 변환기 미구현 (A-3) -->`;
  return { websquareXml, previewHtml };
}
