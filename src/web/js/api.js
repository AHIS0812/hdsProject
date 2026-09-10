// 백엔드(/api/*) 호출 래퍼. 응답이 JSON이 아니면(서버 미기동 / 포트 충돌 등)
// 사람이 읽을 수 있는 오류를 던진다. 개발지시서 §6 계약.

const SERVE_HINT =
  '응답이 JSON이 아닙니다 (HTML 수신).\n' +
  '→ 이 페이지는 `npm run dev` 로 띄운 Express 서버(http://localhost:3000)에서 열어야 합니다.\n' +
  '  file:// 로 직접 열거나 다른 정적 서버로 열면 /api/* 가 동작하지 않습니다.\n' +
  '  포트 충돌 시 .env 의 PORT 를 바꾸고 그 포트로 접속하세요.';

async function apiJson(url, opts) {
  let r;
  try {
    r = await fetch(url, opts);
  } catch (e) {
    throw new Error(`네트워크 실패 (${url}) — 서버가 안 떠 있을 수 있습니다.\n${e}`);
  }
  const text = await r.text();
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`[${r.status}] ${url}\n${SERVE_HINT}\n\n--- 받은 본문 앞부분 ---\n${text.slice(0, 200)}`);
  }
  const body = JSON.parse(text);
  return { status: r.status, ok: r.ok, body };
}

export const health = () => apiJson('/api/health').then((r) => r.body);

export const getSystems = () => apiJson('/api/systems').then((r) => r.body.systems || []);

export const getScreens = (systemId, q) => {
  const qs = new URLSearchParams({ system: systemId });
  if (q) qs.set('q', q);
  return apiJson(`/api/screens?${qs}`).then((r) => r.body.screens || []);
};

export const getScreen = (id) =>
  apiJson(`/api/screens/${encodeURIComponent(id)}`).then((r) => r.body);

const post = (url, data) =>
  apiJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => r.body);

export const generate = (payload) => post('/api/generate', payload);
