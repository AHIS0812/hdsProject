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

- **캔버스 에디터** (`/`) — 요소 16종 배치/이동/8방향 리사이즈/undo·redo(60)/줌(25~200%, 화면 배율 프리셋
  PC·PC스크롤·모바일 + 폭 직접 입력)/컨텍스트 툴바/단축키,
  스냅 가이드(다른 요소와의 정렬이 캔버스 중앙보다 우선, 리사이즈 시 다른 요소와 크기 일치 스냅),
  다중 선택(Shift+클릭·Ctrl/⌘+클릭·드래그 — 드래그는 범위 안에 **완전히 들어온 요소만**) +
  정렬(1개 선택 시 페이지 기준, 2개+ 선택 시 서로 기준)·균등 분배·폭/높이 맞추기 + 그룹화(Ctrl+G) + 우클릭 메뉴,
  단축키 도움말(?)·첫 방문 온보딩, 반응형(좁으면 패널 상단 스택)·접근성(랜드마크·ARIA·키보드·포커스 트랩·`prefers-reduced-motion`),
  신규·변경 모드(레이아웃 전환 시 즉시 적용 + "되돌리기" 토스트, blocking 확인창 없음),
  시스템·화면 검색 콤보박스, 유형별 캔버스 크기(팝업만 560×420, 나머지 960×600),
  **컴포넌트 타입별로 다른 컨텍스트 툴바**(문구·글자 크기는 텍스트 표시 타입만, 항목은 select/radio/list/tab만,
  필수 토글은 실제 필수 표시가 반영되는 타입만) + **설명**(모든 타입, 생성 결과에서 클릭 시 안내 문구로 표시) +
  **연결 화살표**(여러 요소로 연결 가능, 설명 팝오버가 열려 있을 때만 캔버스에 표시 — 예: 조회 버튼 → 결과 그리드),
  변경화면 캡처 이미지를 캔버스 배경으로 깔아 트레이싱(소스 연동 안 되는 화면용, 생성 결과에도 배경으로 반영),
  "화면 생성" → 결과 모달 2탭 (화면 = 결과/동시 보기(내 스케치↔결과)·이미지 복사/저장(실제 화면 영역만,
  켜 둔 설명 말풍선·화살표·하이라이트까지 그대로) / WebSquare XML = 구문 강조·복사),
  코드 내려받기(파일 2개↑ zip, `fflate`),
  이미지 추가(드래그·선택·붙여넣기 → 캔버스 image 요소, data URL, 리사이즈),
  **프로젝트 자동 저장**(localStorage) — 에디터는 항상 프로젝트 하나를 열고 고칠 때마다 자동 저장(저장 중… → 저장됨,
  `Ctrl+S` 지금 저장 · `Ctrl+Shift+S` 사본 만들기, 다른 탭과 충돌하면 덮어쓰기/사본 선택), 새로고침해도 이어짐
- **버전 기록** (프로젝트 ▾ → 버전 기록) — 저장할 때 10분 간격으로 자동 버전(최대 20개)·프로젝트를 열 때의 상태,
  이름 붙인 버전(최대 30개), 미리보기·복원(복원 직전 상태 자동 보관 + "복원 취소")·새 프로젝트로 열기.
  큰 이미지(캡처 배경 등)는 버전끼리 공유 저장해 공간을 아낀다(`src/web/js/versions.js`)
- **여러 화면(페이지)** — 한 프로젝트에 화면 최대 50개. 캔버스 아래 화면 띠에서 추가·전환·복제·삭제(되돌리기 토스트)·
  끌어서 순서 바꾸기, PgUp/PgDn 이전·다음 화면. 화면마다 유형·캔버스 크기·배경 이미지·되돌리기 기록이 따로 유지되고,
  "화면 생성"은 지금 열린 화면 기준. 저장 형식 v2(`src/web/js/doc-model.js`) — 예전 v1(화면 하나) 저장본·파일도 그대로 열린다
- **확대·이동** — Ctrl+휠(커서 기준, 10~400%) · Space 누른 채 드래그 / 가운데 버튼 드래그로 캔버스 이동 ·
  Ctrl+0 화면 맞춤 · Ctrl+1 실제 크기 · Ctrl +/−
- **항목정의서** (프로젝트 ▾ → 항목정의서 내보내기) — 모든 화면의 요소를 화면설계서 항목 표
  (화면·No·영역·항목명·유형·필수·선택 항목·설명·연결)로 만들어 엑셀에서 열리는 CSV 로 저장.
  같은 표가 "산출물 추출" PPT 에도 슬라이드로 들어간다(`src/web/js/item-spec.js`)
- **프로젝트 홈**(`/` — 캔바·미리캔버스의 "내 작업") — 프로젝트 카드(썸네일)·검색·필터(신규/변경·시스템별)·정렬·
  카드/목록 보기·즐겨찾기·다중 선택(일괄 내보내기 zip/삭제)·휴지통(30일)·새 프로젝트 마법사·빠른 시작 타일·
  `.hds.json`/zip 가져오기(끌어놓기)·저장 공간 표시
- **규칙 기반 변환기** (`src/pipeline/deterministic.js`) — payload 를 읽기순으로 정렬 →
  `catalog/websquare/mapping.json` 기반 WebSquare XML(select/radio/list/tab 항목 펼침, `area` 자식 중첩,
  필수(＊) 라벨 → 인접 필드 전파) + 좌표 그대로의 Preview HTML(버튼 클릭·선택·체크 상호작용,
  설명·연결 있는 요소는 클릭하면 안내 문구·화살표 표시, **"설명 붙은 요소 보기" 토글**로 전체 훑어보기,
  변경화면 캡처 배경 반영).
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
  web/       프로젝트 홈(index.html) · 캔버스 에디터(editor.html) · common.css/home.css/styles.css · js/*
schemas/     screen-draft(입력) / generation-result(출력) — 프론트↔백엔드 계약
fixtures/    systems, screens, payloads (데이터 소스)
catalog/     사내 UI 표준 (websquare 매핑 — 실사용. components/tokens/layout-guide 는 §9 T-4 참고용 초안)
config/      settings.json, policy.json(버튼 색 역할 힌트 — 변환기가 사용)
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
- `versions.test.js` / `doc-model.test.js` — 버전 기록(에셋 공유·개수 제한·공간 부족 처리)·문서 읽기 도우미
- `item-spec.test.js` — 항목정의서 표 생성(영역 묶기·번호·연결 이름·CSV 이스케이프)
- `regressions.test.js` — 전체 점검(2026-09-22)에서 고친 버그 회귀 방지(연결 id 재매핑·읽기 순서·XML 주석)

브라우저 상호작용(드래그·스냅·모달)은 수동 검증.
