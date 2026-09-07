# jobkroea-updater

잡코리아 이력서를 Playwright로 갱신하고 결과를 Telegram으로 알려주는 TypeScript 자동화 스크립트입니다.

## 실행 일정과 재시도

GitHub Actions cron은 매일 08:50, 12:50 KST 실행을 요청합니다. GitHub의 scheduled workflow는 best-effort 방식이므로 실제 시작 시각은 runner 상황에 따라 늦어질 수 있습니다.

예약 실행에서는 checkout과 의존성 설치 전에 JobKorea 로그인 endpoint를 probe합니다. 연결 오류나 HTTP 4xx/5xx가 발생하거나 실제 이력서 업데이트 단계가 재시도 가능한 navigation 오류로 실패하면 새 workflow run을 생성합니다. 1~3차의 해당 실패는 Telegram에 일시 실패와 다음 시도 예정으로 알리고, 4차에서만 최종 실패로 알립니다. 인증, 보안 경계, 업데이트 오류는 계정 잠금이나 중복 변경을 피하기 위해 workflow 단위로 재시도하지 않습니다. 정상 retry chain은 최초 시도를 포함해 총 4번까지 시도하며, 재시도 전에 순서대로 약 3분, 8분, 15분 대기합니다.

다음 시도를 정상적으로 예약한 미완료 run은 성공으로 오인되지 않도록 실패로 표시됩니다. 이런 run의 최종 결과는 이어서 생성된 `workflow_dispatch` run에서 확인해야 합니다. 각 `workflow_dispatch` 호출은 일시적인 GitHub API 오류에 대비해 최대 3번까지 시도하되, 다음 요청 전에 최초 실행 ID(`chain_id`)와 다음 attempt가 같은 run이 있는지 완료된 실행까지 확인합니다. 조회는 최초 실행 시각 이후의 모든 API 페이지를 확인하므로 다른 날 실행이나 다른 retry chain과 혼동하지 않습니다. 확인 자체가 실패하면 중복 실행보다 안전한 중단을 선택합니다. 수동으로 새 실행을 시작할 때는 `chain_id`를 비워 둡니다. 보조 workflow가 실패한 실행 제목에서 원래 chain을 확인할 수 없는 경우(이전 형식의 실행 포함)에는 추측해서 재시도하지 않습니다. 최상위 예약 실행이나 사용자가 시작한 `workflow_dispatch`에서 다음 run 생성 자체가 최종적으로 실패하면 `Auto Rerun Update Resume` workflow가 실패한 updater job을 재실행하지 않고 누락된 다음 `workflow_dispatch`를 직접 생성합니다. 최종 4차 실패는 별도 단계로 표시해 보조 dispatch 대상에서 제외합니다.

Probe와 update retry job은 후속 workflow dispatch를 위해, 격리된 keepalive job은 예약 실행 유지를 위해 각각 `actions: write` 권한을 사용합니다. Keepalive는 best-effort 보조 작업이라 외부 GitHub API 장애가 전체 업데이트 결과를 실패로 바꾸지 않습니다. 자격증명이 주입되는 실제 이력서 업데이트 job은 `contents: read` 권한만 가지며, 인증 정보 제출은 계정 잠금을 막기 위해 한 번만 수행합니다. 브라우저의 모든 frame 이동은 HTTPS JobKorea 도메인으로 제한하고, 아이디·비밀번호·제출 버튼이 실제로 같은 POST 로그인 폼에 속하며 action과 target이 안전할 때만 자격증명을 입력합니다. 자격증명이 DOM에 있는 동안에는 JobKorea 외부 HTTP 요청을 차단하며 외부 WebSocket과 service worker도 사용하지 않습니다.

Chromium은 sandbox를 명시적으로 활성화합니다. 브라우저를 실행하는 Actions job은 Chromium의 unprivileged user-namespace sandbox와 호환되는 `ubuntu-22.04`에 고정하며, CI가 실제 sandbox launch를 smoke test합니다.

## 로컬 실행

Node.js 24와 pnpm 10.30.3을 사용합니다.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

예제 파일을 복사해 프로젝트 루트의 `.env`를 만들고 필수 값을 설정합니다.

```sh
cp .env.example .env
```

```dotenv
JOBKOREA_ID=
JOBKOREA_PWD=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

검증, 빌드, 실행 순서는 다음과 같습니다. `pnpm start`도 실행 전에 자동으로 다시 빌드하므로 오래된 `dist/`를 실행하지 않습니다.

```sh
pnpm lint
pnpm test
pnpm build
pnpm test:browser
pnpm start
```

`pnpm test`는 실제 JobKorea 계정이나 외부 네트워크 없이 실행되는 자동화 테스트입니다. `pnpm test:browser`는 Chromium 설치 후 실제 sandbox launch와 정리, 로컬 HTML에서의 이력서 팝업·성공/실패 다이얼로그·로그인 팝업 처리를 확인합니다. 모든 페이지 응답을 로컬 fixture로 대체하며 실제 계정이나 외부 네트워크를 사용하지 않습니다.

## 환경변수

GitHub Actions에서는 다음 필수 값을 repository secret으로 설정합니다.

| 이름 | 설명 |
| --- | --- |
| `JOBKOREA_ID` | JobKorea 로그인 ID |
| `JOBKOREA_PWD` | JobKorea 로그인 비밀번호 |
| `TELEGRAM_BOT_TOKEN` | 결과 알림을 보낼 Telegram bot token |
| `TELEGRAM_CHAT_ID` | 결과 알림을 받을 Telegram chat ID |

다음 값은 선택 사항입니다.

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `NAVIGATION_TIMEOUT_MS` | `20000` | 페이지 이동 timeout (1~120000ms). Actions에서는 `30000`으로 설정 |
| `ELEMENT_TIMEOUT_MS` | `15000` | element 탐색·조작 timeout (1~60000ms) |
| `POPUP_TIMEOUT_MS` | `10000` | popup·dialog 대기 timeout (1~60000ms) |
| `TELEGRAM_TIMEOUT_MS` | `10000` | Telegram API 요청 timeout (1~60000ms) |
| `TELEGRAM_OVERALL_TIMEOUT_MS` | `60000` | Telegram 알림 1건의 전체 retry 예산 (1~300000ms) |
| `MAX_OPERATION_RETRIES` | `3` | 개별 operation의 최대 시도 횟수 (1~10) |
| `MAX_PROCESS_RETRIES` | `3` | browser 재시작을 포함한 전체 process의 최대 시도 횟수 (1~10) |
| `MAX_RETRIES` | - | 두 retry 값을 한번에 설정하는 하위 호환 옵션 (1~10) |
| `RETRY_BASE_DELAY_MS` | `2000` | 최초 retry 대기 시간 (1~300000ms) |
| `RETRY_MAX_DELAY_MS` | `10000` | retry 대기 시간 상한 (1~300000ms) |
| `RETRY_BACKOFF_MULTIPLIER` | `2` | retry backoff 배수 (0 초과~10) |
| `BROWSER_HEADLESS` | `true` | `true`일 때 headless Chromium 사용 |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` 중 하나 |
| `JOBKOREA_LOGIN_URL` | JobKorea 로그인 URL | HTTPS `jobkorea.co.kr` 로그인 endpoint override |
| `JOBKOREA_MYPAGE_URL` | JobKorea 마이페이지 URL | HTTPS `jobkorea.co.kr` 마이페이지 endpoint override |
| `CAPTURE_FAILURE_ARTIFACTS` | `false` | `true`일 때만 로컬 `diagnostics/`에 실패 진단 파일 저장 |

`CAPTURE_FAILURE_ARTIFACTS` 기본값은 `false`입니다. 이 값을 켜도 생성된 파일은 로컬 또는 일회성 runner에만 남으며, workflow는 스크린샷이나 HTML 같은 민감한 진단 파일을 GitHub Actions artifact로 업로드하지 않습니다. `diagnostics/`와 기존 `error-*.png`, `error-*.html` 파일은 Git에서도 제외됩니다.
