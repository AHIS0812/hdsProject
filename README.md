# 하이스케치 (HiSketch)

[![CI](https://github.com/AHIS0812/hdsProject/actions/workflows/ci.yml/badge.svg)](https://github.com/AHIS0812/hdsProject/actions/workflows/ci.yml)

캔버스에 화면을 러프하게 그리면 **규칙 기반 변환기**가 사내 UI 표준으로 정리한 화면 초안과
코드(WebSquare XML)를 만들어 주는 도구. 1개월 PoC.

> **2026-09-10 방침 변경**: 외부 LLM(상용 AI API) 사용 불가 요구사항 반영.
> 화면 생성은 `src/pipeline/deterministic.js` **규칙 기반 변환기**가 전담한다. AI 파이프라인 관련
> 코드(`src/llm/`, Stage A/B, autofix)·문서·스키마(IR, refine)는 전면 제거됨.

- 개발 기준: [`docs/01_개발지시서.md`](docs/01_개발지시서.md) — **스펙 정본**
- 백엔드 인수인계: [`docs/04_백엔드_인수인계.md`](docs/04_백엔드_인수인계.md) — 변환기·카탈로그·메타 API
- 시연: [`docs/05_시연_시나리오.md`](docs/05_시연_시나리오.md) — 데모 순서·Q&A. 실행은 `데모실행.bat`
- 평가: [`docs/03_평가결과.md`](docs/03_평가결과.md) — 재현 `node scripts/run-eval.mjs`
- 참고 프로토타입: [`samples/화면스케치스튜디오_예시_v1.html`](samples/화면스케치스튜디오_예시_v1.html)

## 빠른 시작

```bash
npm install
npm run dev
```

→ http://localhost:3000 · Windows 는 `데모실행.bat` 더블클릭으로도 실행.
(`.env` 는 `PORT` 만 쓰며 없어도 동작.)

## 동작

- **캔버스 에디터** (`/`) — 요소 16종 배치/이동/8방향 리사이즈/스냅/undo·redo(60)/줌/컨텍스트 툴바/단축키,
  다중 선택(Shift+클릭·마퀴) + 정렬·균등 분배 + 그룹화(Ctrl+G) + 우클릭 메뉴, 단축키 도움말(?)·첫 방문 온보딩,
  반응형(좁으면 패널 상단 스택)·접근성(랜드마크·ARIA·키보드·포커스 트랩·`prefers-reduced-motion`),
  신규·변경 모드, 시스템·화면 검색 콤보박스, 유형별 캔버스 크기,
  "화면 생성" → 결과 모달 2탭 (화면 = 결과/동시 보기(내 스케치↔결과)·이미지 복사 / WebSquare XML = 구문 강조·복사),
  코드 내려받기(파일 2개↑ zip, `fflate`),
  이미지 추가(드래그·선택·붙여넣기 → 캔버스 image 요소, data URL, 리사이즈),
  **이름 붙인 저장본**(localStorage 슬롯) · `.hds.json` 파일 내보내기·불러오기, localStorage 자동 저장.
- **규칙 기반 변환기** (`src/pipeline/deterministic.js`) — payload 를 읽기순으로 정렬 →
  `catalog/websquare/mapping.json` 기반 WebSquare XML(select/radio/list/tab 항목 펼침, `area` 자식 중첩,
  필수(＊) 라벨 → 인접 필드 전파) + 좌표 그대로의 Preview HTML.
- 메타 API: `GET /api/systems`, `GET /api/screens?system=&q=`, `GET /api/screens/:id` — `fixtures/` 데이터
- 생성 API: `POST /api/generate` — 스키마 검증 + 규칙 기반 변환
- 이미지 첨부: 서버 없음. 클라이언트가 축소 → data URL → 캔버스 `image` shape (`src`)
- API 스모크 페이지 (`/smoke.html`)

## 구조

```
src/
  server/    Express, 라우트 (/generate, /systems·/screens, /health)
  pipeline/  deterministic.js — 규칙 기반 변환기
  shared/    스키마 검증, 상수, 경로 유틸
  web/       캔버스 에디터 (index.html, styles.css, js/*)
schemas/     screen-draft(입력) / generation-result(출력) — 프론트↔백엔드 계약
fixtures/    systems, screens, payloads (데이터 소스)
catalog/     사내 UI 표준 (components, tokens, layout-guide, websquare 매핑)
config/      settings.json
runs/        평가 실행 산출물 (gitignore)
```

## 역할 분담

| 백엔드 — 서버·변환기·카탈로그 | 프론트엔드 — 캔버스 에디터 |
|---|---|
| `/api/*`, `src/pipeline/deterministic.js`, `catalog/*`, 메타 데이터 소스 | `src/web/` 전체 (예시 UI 계승) |

경계 = `schemas/` 데이터 계약. 변경 시 PR + 상호 리뷰. 상세는 개발지시서 §5~§6.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (`node --watch`, 자동 재시작) |
| `npm start` | 서버 1회 실행 |
| `npm test` | `node --test` — `test/` 아래 단위 테스트 |

push/PR 시 GitHub Actions(`.github/workflows/ci.yml`)가 Node 20·22 에서 `npm test` + 서버 스모크(부팅·메타 API·규칙 기반 변환)를 실행한다.

### 테스트 (`test/`)

- `constants.test.js` — 요소 타입/DEF/NAME/BOARD_SIZES 정합성
- `templates.test.js` — 6개 템플릿 프리셋이 유효하고 각 보드 안에 들어감
- `schemas.test.js` — payload/변환 결과가 `schemas/` 를 통과
- `deterministic.test.js` — 변환기(읽기순·매핑·필수 전파·area 중첩)
- `editor-align.test.js` — 정렬/분배 계산
- `highlight.test.js` — XML 구문 강조
- `modules.test.js` — 웹 모듈이 Node 에서 부작용 없이 import 됨

브라우저 상호작용(드래그·스냅·모달)은 수동 검증.
