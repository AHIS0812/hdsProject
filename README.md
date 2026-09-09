# 하이스케치 (AI Screen Draft)

[![CI](https://github.com/AHIS0812/hdsProject/actions/workflows/ci.yml/badge.svg)](https://github.com/AHIS0812/hdsProject/actions/workflows/ci.yml)

2026-09-08

캔버스에 화면을 러프하게 그리면 AI가 사내 UI 표준으로 정리한 화면 초안과 코드(WebSquare XML)를
만들어 주는 도구. 1개월 PoC, 2인 진행. 앱 이름은 **하이스케치**.

- 개발 기준: [`docs/01_개발지시서.md`](docs/01_개발지시서.md) — **이 문서가 스펙의 정본**
- 평가 계획·체크리스트: [`docs/03_평가결과.md`](docs/03_평가결과.md) — T-6 에서 실행·기록
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
- **캔버스 에디터** (`/`) — 요소 16종 배치/이동/리사이즈/스냅/undo·redo/줌/컨텍스트 툴바/단축키,
  다중 선택(Shift+클릭·마퀴 드래그) + 정렬·균등 분배, 단축키 도움말(?)·첫 방문 온보딩,
  신규·변경 모드, 시스템·화면 콤보박스, 유형별 캔버스 크기, "화면 생성" → 결과 모달 3탭
  (화면 / 전달 데이터 / WebSquare XML — 화면은 결과/동시 보기(내 스케치+결과) 전환·이미지 복사, 나머지는 텍스트 복사),
  생성 완료 시 상태·소요시간 표시, 질문 응답 + 자연어 수정 요청 → 재생성(`/api/refine`),
  참고 파일 업로드(클릭/드래그, `/api/attachments` → `uploads/`),
  **이름 붙인 저장본**(localStorage 슬롯 — 저장/덮어쓰기/불러오기/삭제) · `.hds.json` 파일 내보내기·불러오기,
  localStorage 자동 저장.
- API 스모크 페이지 (`/smoke.html`) — `/api/*` 를 백엔드 없이 확인
- **개발용 트리거**: 보충 설명에 "질문" 을 넣고 생성하면 mock 서버가 `needs_input`(질문 3개)을 반환
- 메타 API: `GET /api/systems`, `GET /api/screens?system=&q=`, `GET /api/screens/:id` — `fixtures/` mock
- 생성 API: `POST /api/generate`, `POST /api/refine` — **스키마 검증은 실제**, 결과는 `fixtures/results` mock
- 첨부 API: `POST /api/attachments` (multipart, multer), `DELETE /api/attachments/:id` — **실제 저장**(`uploads/`, gitignore, PNG/JPG/GIF·XLSX/XLS/CSV·PPT/PPTX·PDF, ≤20MB)

미구현 (다음 작업):
- `src/pipeline/*` (Stage A/B, autofix, 결정론적 변환기) — 담당 1
- `src/llm/*` (Claude/OpenAI provider) — 담당 1
- `catalog/` 실제 값 (§7 WebSquare 매핑) — 담당 1
- T-5 통합(mock 제거) → T-6 평가 (`docs/03_평가결과.md` 케이스 실행)
- 에디터 U-1~U-12 + 단위 테스트 완료. 반응형·접근성 세부 다듬기 정도만 남음

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
| `npm test` | `node --test` — `test/` 아래 단위 테스트 (31개) |

push/PR 시 GitHub Actions(`.github/workflows/ci.yml`)가 Node 20·22 에서 `npm test` + 서버 스모크(부팅·메타/생성 API)를 실행한다.

### 테스트 커버리지 (`test/`)

- `constants.test.js` — 요소 타입/DEF/NAME/BOARD_SIZES 정합성
- `templates.test.js` — 6개 템플릿 프리셋이 유효하고 각 보드(960×600 / 1280×720 / 560×420) 안에 들어감, 서로 다른 레이아웃
- `schemas.test.js` — 템플릿·픽스처에서 만든 payload 가 `schemas/` 를 통과, 잘못된 payload 는 실패, screen 픽스처 shapes 가 canvas 안에 들어감
- `modules.test.js` — 웹 모듈이 Node 에서 부작용 없이 import 됨

브라우저 상호작용(드래그·스냅·모달)은 수동 검증. jsdom 도입은 추후.
