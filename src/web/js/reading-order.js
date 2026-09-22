// 읽기 순서(위→아래, 같은 줄이면 왼→오른쪽) — 변환기(src/pipeline/deterministic.js)와 결과 모달의
// 산출물 번호가 같은 규칙을 쓰도록 한 곳에 둔다(브라우저·Node 양쪽에서 import 한다).

/** y 차이가 이 값 이하이면 같은 줄로 본다(러프 스케치라 한 줄의 요소들 높이가 조금씩 어긋난다) */
export const ROW_TOLERANCE = 18;

/**
 * 러프 좌표를 읽기 순서로 정렬한다(원본 배열은 건드리지 않는다).
 * 예전엔 "y 차이가 18 넘으면 y 로, 아니면 x 로" 비교하는 정렬 함수를 썼는데, 이 비교는 추이적이지 않아서
 * (A~B 같은 줄, B~C 같은 줄인데 A·C 는 다른 줄) 요소 배치에 따라 순서가 뒤죽박죽되거나 엔진마다 달라졌다.
 * 이제 위에서부터 줄을 묶은 다음(줄의 첫 요소 기준 허용 오차 안이면 같은 줄) 줄 안에서 x 로 정렬한다.
 */
export function readingOrder(shapes, tol = ROW_TOLERANCE) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const byY = [...(shapes || [])].sort((a, b) => num(a.y) - num(b.y) || num(a.x) - num(b.x));
  const rows = [];
  for (const s of byY) {
    const row = rows.at(-1);
    if (row && num(s.y) - row.y0 <= tol) row.items.push(s);
    else rows.push({ y0: num(s.y), items: [s] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => num(a.x) - num(b.x) || num(a.y) - num(b.y)));
}
