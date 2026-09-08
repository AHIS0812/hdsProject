# 하이스케치 (AI Screen Draft)

2026-09-08

캔버스에 화면을 러프하게 그리면 AI가 사내 UI 표준으로 정리한 화면 초안과 코드(WebSquare XML)를
만들어 주는 도구. 1개월 PoC, 2인 진행. 앱 이름은 **하이스케치**.

- 개발 기준: [`docs/01_개발지시서.md`](docs/01_개발지시서.md) — **이 문서가 스펙의 정본**
- 참고 프로토타입: [`samples/화면스케치스튜디오_예시_v1.html`](samples/화면스케치스튜디오_예시_v1.html)

## 빠른 시작

```bash
npm install
cp .env.example .env   # 값 채우기 (없어도 스캐폴딩은 동작)
npm run dev
```

→ http://localhost:3000  (스캐폴딩 스모크 테스트 페이지)

`npm run dev` 는 `node --watch` 로 서버를 띄우고 파일 변경 시 자동 재시작한다.

## 현재 상태

동작:
- Express 서버 + 정적 서빙
- **캔버스 에디터** (`/`) — 배치/이동/리사이즈/스냅/undo·redo/줌/컨텍스트 툴바/단축키,
  신규·변경 모드(유형 자동 반영), 시스템·화면 콤보박스, "화면 생성" → 결과 모달 3탭,
  **질문 응답 + 자연어 수정 요청 → 재생성**(`/api/refine`). localStorage 임시저장.
- API 스모크 페이지 (`/smoke.html`) — `/api/*` 를 백엔드 없이 확인
- **개발용 트리거**: 보충 설명에 "질문" 을 넣고 생성하면 mock 서버가 `needs_input`(질문 3개)을 반환
- 메타 API: `GET /api/systems`, `GET /api/screens?system=&q=`, `GET /api/screens/:id` — `fixtures/` mock
- 생성 API: `POST /api/generate`, `POST /api/refine` — **스키마 검증은 실제**, 결과는 `fixtures/results` mock

미구현 (다음 작업):
- `src/pipeline/*` (Stage A/B, autofix, 결정론적 변환기) — 담당 1
- `src/llm/*` (Claude/OpenAI provider) — 담당 1
- 에디터 잔여 항목: 첨부 실제 업로드(U-11), 유형별 보드 크기(U-12)

## 구조

```
src/
  server/    Express, 라우트 (담당 1)
  pipeline/  Stage A/B, autofix, deterministic (담당 1) — 현재 stub
  llm/       provider 추상화 (담당 1) — 현재 stub
  shared/    스키마 검증, 상수, 경로 유틸 (공통)
  web/       캔버스 에디터 (담당 2)
    index.html, styles.css
    js/ main.js · editor.js · combobox.js · templates.js · result-modal.js · api.js · constants.js
    smoke.html  API 스모크 테스트
schemas/     화면정의 payload / 생성결과 / 수정요청 / IR  (공통 계약)
fixtures/    mock 데이터 (systems, screens, payloads, results)
catalog/     사내 UI 표준 (components, tokens, layout-guide, websquare 매핑)
prompts/     Stage A/B 프롬프트
config/      settings.json, policy.json
runs/        세션 로그 (gitignore)
```

## 역할 분담

| 담당 1 — AI 통신/백엔드 | 담당 2 — UI/캔버스 에디터 |
|---|---|
| `/api/generate`·`/api/refine`, Stage A/B, WebSquare 매핑, autofix | `src/web/` 캔버스 에디터 전체 (예시 UI 계승) |

두 사람의 경계 = `schemas/` 의 데이터 계약. 변경 시 PR + 상호 리뷰. 상세는 개발지시서 §5~§6.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (자동 재시작) |
| `npm start` | 서버 1회 실행 |
| `npm test` | `node --test` |
