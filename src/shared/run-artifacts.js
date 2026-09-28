// runs/ 산출물 공통 로직 — src/server/audit-log.js(A-9, 요청마다) 와 scripts/run-eval.mjs
// (배치 평가) 가 같은 파일 구성(payload.json/screen.xml/preview.html/report.json)을 쓴다.
// 여기엔 "무슨 파일을 어떤 이름·내용으로 쓸지"만 두고, 실제 디스크 쓰기(동기/비동기)는 호출하는
// 쪽이 각자 방식대로 한다 — 감사 로그는 요청 경로라 비동기가 필수지만, 평가 배치는 순차 스크립트라
// 동기 그대로가 더 단순하다.

import crypto from 'node:crypto';

/** 같은 밀리초에 여러 개가 생겨도 겹치지 않도록 랜덤 접미사를 붙인 타임스탬프 슬러그. */
export function timestampSlug(now = new Date()) {
  return `${now.toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(6).toString('hex')}`;
}

// 배경 이미지·첨부 이미지는 data: URL(base64)로 수백 KB~수 MB 에 달할 수 있다. 감사 로그는
// "무엇이 요청됐는지" 기록하는 게 목적이라 원본 픽셀 데이터까지 파일마다 그대로 복제해 둘 필요는
// 없다 — 실제로 payload.json 과 preview.html/screen.xml 세 곳에 같은 데이터가 중복 저장되므로,
// 이 길이를 넘는 data URL 은 요약(원래 길이)으로 축약한다.
const MAX_INLINE_DATA_URL = 20_000;

/** payload(중첩 객체·배열)를 재귀적으로 돌며 너무 긴 data: URL 문자열을 요약으로 축약한다. */
export function redactLargeDataUrls(value) {
  if (typeof value === 'string') {
    return value.startsWith('data:') && value.length > MAX_INLINE_DATA_URL
      ? `[data URL 생략됨, ${value.length}자]`
      : value;
  }
  if (Array.isArray(value)) return value.map(redactLargeDataUrls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactLargeDataUrls(v)]));
  }
  return value;
}

/** HTML/XML 문자열 안에 인라인된 너무 긴 data: URL(따옴표로 둘러싸인 속성값)을 요약으로 축약한다. */
export function redactLargeDataUrlsInMarkup(text) {
  return String(text).replace(
    new RegExp(`data:[^"']{${MAX_INLINE_DATA_URL},}`, 'g'),
    (m) => `[data URL 생략됨, ${m.length}자]`,
  );
}

/**
 * payload 와 /api/generate 결과(성공 status:'ok' 또는 실패 status:'error')로부터
 * runs/<dir>/ 에 쓸 파일 목록을 만든다(대용량 data URL 은 축약 반영).
 * @returns {{name:string, content:string}[]}
 */
export function runArtifactFiles({ payload, result }) {
  const files = [{ name: 'payload.json', content: JSON.stringify(redactLargeDataUrls(payload), null, 2) }];
  if (result.status === 'ok') {
    files.push(
      { name: 'screen.xml', content: redactLargeDataUrlsInMarkup(result.code.websquareXml) },
      { name: 'preview.html', content: redactLargeDataUrlsInMarkup(result.preview.html) },
      { name: 'report.json', content: JSON.stringify(result.report, null, 2) },
    );
  } else {
    files.push({ name: 'report.json', content: JSON.stringify(result.error, null, 2) });
  }
  return files;
}
