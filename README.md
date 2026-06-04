# jobkroea-updater

이 프로젝트는 잡코리아 이력서 갱신을 매일 오전, 오후 1번씩 해주는 간단한 스크립트입니다.

GitHub secret으로 아래를 설정해주면 동작하고, [.env](.env)에도 설정하면 로컬에서 테스트해볼 수 있습니다.

```
JOBKOREA_ID=
JOBKOREA_PWD=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

GitHub Actions에서는 JobKorea 접속 지연을 견디기 위해 아래 선택 환경변수를 사용할 수 있습니다.

JobKorea 로그인 페이지 probe가 GitHub Actions runner 네트워크 문제로 실패하면, 첫 실패 알림은 "자동 재시도 예정"으로 전송하고 failed job을 새 runner로 1회 자동 재실행합니다. 재실행에서도 probe가 실패하면 최종 실패 알림을 보냅니다.

```
NAVIGATION_TIMEOUT_MS=
ELEMENT_TIMEOUT_MS=
POPUP_TIMEOUT_MS=
MAX_OPERATION_RETRIES=
MAX_PROCESS_RETRIES=
RETRY_BASE_DELAY_MS=
RETRY_MAX_DELAY_MS=
RETRY_BACKOFF_MULTIPLIER=
```
