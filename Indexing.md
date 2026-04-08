# Indexing System

멀티미디어 파일 인덱싱과 시맨틱 검색의 현재 구현 기준 문서입니다.

## 현재 동작 요약

- 업로드 완료 후 서버가 파일 MIME을 판별해 **자동 인덱싱 태스크를 디스패치**합니다.
- 인덱싱은 Celery 비동기 작업으로 처리됩니다.
- 오디오는 별도 태스크(`index_audio_file_task`)로 분기되며, 현재 코드는 **GPU 전용 큐를 사용하지 않습니다**.
- 5분 주기 beat 작업(`schedule_pending_indexing_task`)이 `pending` 파일을 자동으로 다시 스캔/디스패치합니다.

## 지원 파일 형식 (코드 기준)

`backend/app/services/document/parser_service.py`의 `SUPPORTED_TYPES` 기준:

- 텍스트 계열: `pdf`, `docx`, `txt`, `md`, `csv`, `xml`, `html`, `css`, `javascript`, `json`, `x-www-form-urlencoded`, `x-sh`, `xls`, `xlsx`
- 이미지 계열: `png`, `jpeg`, `gif`, `webp`, `svg`
- 오디오 계열: `mpeg/mp3`, `wav`, `ogg`, `flac`, `m4a`
- 비디오 계열: `mp4`, `avi`, `mkv`, `webm`

`SKIP_TYPES`는 인덱싱 대상에서 제외됩니다:

- 예: 폴더(`application/x-folder`), 압축파일(`zip`, `tar`, `7z` 등), `application/octet-stream`, 일부 바이너리

## 인덱싱 파이프라인

### 1) 디스패치

- 자동: `POST /api/v1/files/upload` 완료 시 내부에서 태스크 디스패치
- 수동:
  - `POST /api/v1/files/{id}/index`
  - `POST /api/v1/files/batch-index`
  - `POST /api/v1/indexing/{id}/retry`
  - `POST /api/v1/indexing/index-all`

### 2) 처리 분기

- 일반 태스크 `index_file_task`:
  - 텍스트: 파싱/청킹
  - 이미지: `ImageParser`로 텍스트 설명 생성 후 청킹
  - 비디오: `VideoParser`로 텍스트 생성 후 청킹
  - 스프레드시트: 시트 단위 청킹 + `section`(시트명) 저장
- 오디오 태스크 `index_audio_file_task`:
  - `AudioParser`로 전사 후 청킹

### 3) 임베딩/저장

- 임베딩 서비스: `EmbeddingService` (기본 Ollama API, 설정값은 DB/환경변수에서 로드)
- 저장소: `document_embeddings` (pgvector)
- 재인덱싱 시 기존 임베딩은 파일 단위로 삭제 후 재생성

## 인덱싱 상태

현재 `IndexStatus` enum:

| 상태 | 설명 |
|------|------|
| `pending` | 대기/큐잉됨 |
| `processing` | 처리 중 (`index_progress` 갱신) |
| `completed` | 완료 |
| `failed` | 실패 (`index_error` 저장) |
| `skipped` | 비인덱싱 대상이라 건너뜀 |

참고:
- `is_indexed`는 레거시 호환 필드이며, 최신 상태 관리는 `index_status` 중심입니다.
- 타임아웃 시 `failed`로 전환되고 `index_error`에 원인이 기록됩니다.

## API 엔드포인트

### 인덱싱 실행/재시도

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/files/{id}/index` | 단일 파일 인덱싱 큐잉 |
| POST | `/api/v1/files/batch-index` | 여러 파일 일괄 큐잉 |
| POST | `/api/v1/indexing/{id}/retry` | 실패 파일 재시도 |
| POST | `/api/v1/indexing/index-all` | 사용자의 `pending` 파일 일괄 디스패치 |

### 인덱싱 조회/검색

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/indexing/stats` | 통계 조회 (`skipped` 포함) |
| GET | `/api/v1/indexing/files` | 상태/타입/검색/카테고리 필터 목록 |
| POST | `/api/v1/indexing/search` | 임베딩 기반 시맨틱 검색 |

### 카테고리 관리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/indexing/categories` | 카테고리 목록 |
| POST | `/api/v1/indexing/categories` | 카테고리 생성 |
| PUT | `/api/v1/indexing/categories/{category_id}` | 카테고리 수정 |
| DELETE | `/api/v1/indexing/categories/{category_id}` | 카테고리 삭제 |
| PUT | `/api/v1/indexing/files/{file_id}/categories` | 파일 카테고리 설정 |
| PUT | `/api/v1/indexing/files/bulk-categories` | 다중 파일 카테고리 일괄 설정 |
| DELETE | `/api/v1/indexing/categories/{category_id}/files/{file_id}` | 카테고리에서 파일 제거 |

### `/api/v1/indexing/files` 주요 쿼리

- `status`: `pending|processing|completed|failed|skipped`
- `type`: `text|image|audio|video`
- `search`: 파일명 검색
- `category_id`: 카테고리 필터
- `page`, `limit`: 페이지네이션

## Celery/스케줄링

- Celery 앱: `backend/app/core/celery_app.py`
- 인덱싱 beat 스케줄:
  - `schedule-pending-indexing` → `app.tasks.indexing.schedule_pending_indexing_task`
  - 주기: 300초(5분)
- 현재 task route에서 인덱싱 전용 GPU 큐 분리는 없습니다.

## 프론트엔드 반영 상태

### 파일 탐색기 (`/files`)

- 업로드 목록에서 `index_status` 뱃지 표시
- `processing` 파일이 있으면 3초 폴링
- 우클릭 메뉴에서 인덱싱/재시도/카테고리 지정 가능
- `skipped` 상태 표시 지원

### 인덱싱 페이지 (`/indexing`)

- 통계 카드 표시(전체/완료/처리중/실패/대기)
- 시맨틱 검색 + 파일명 검색 모드 제공
- 타입 필터(`text|image|audio|video`) 지원
- 카테고리 생성/수정/삭제 및 검색 결과 일괄 카테고리 지정 지원

## 주의사항

- 압축 해제(`POST /files/{id}/decompress`)는 파일을 생성하지만, **해제된 파일을 즉시 자동 인덱싱하지는 않습니다**.
- `index-all`/주기 스케줄러는 지원 MIME와 skip 정책에 따라 자동 분류/디스패치합니다.
