# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript automation bot that updates a JobKorea resume twice daily using Playwright and sends the result through Telegram.

## Commands

Use the repository-pinned Node.js 24 and pnpm 10.30.3 toolchain.

- `pnpm install --frozen-lockfile` - Install the locked dependencies.
- `pnpm exec playwright install chromium` - Install the Chromium runtime for local execution.
- `pnpm lint` - Run TypeScript type checking without emitting files.
- `pnpm test` - Run the automated tests. They do not require live JobKorea credentials or network access.
- `pnpm test:browser` - Launch and close the real sandboxed Chromium runtime; install Chromium first.
- `pnpm build` - Compile TypeScript into `dist/`.
- `pnpm start` - Rebuild, then run the application from `dist/index.js`.

`dist/` is ignored. The `prestart` lifecycle rebuilds it so `pnpm start` cannot execute stale output.

## Local Development

1. Run `corepack enable`, `pnpm install --frozen-lockfile`, and `pnpm exec playwright install chromium`.
2. Copy `.env.example` to `.env` and fill in the required values below.
3. Run `pnpm lint`, `pnpm test`, and `pnpm build`.
4. Run `pnpm start`.

## Environment Variables

Required values, supplied through `.env` locally or GitHub repository secrets in Actions:

- `JOBKOREA_ID` - JobKorea login ID.
- `JOBKOREA_PWD` - JobKorea login password.
- `TELEGRAM_BOT_TOKEN` - Telegram bot token.
- `TELEGRAM_CHAT_ID` - Telegram destination chat ID.

Supported optional values:

- `NAVIGATION_TIMEOUT_MS` - Navigation timeout from 1 to 120000 ms; defaults to 20000 ms locally and is set to 30000 ms by the workflow.
- `ELEMENT_TIMEOUT_MS` - Element timeout from 1 to 60000 ms; defaults to 15000 ms.
- `POPUP_TIMEOUT_MS` - Popup and dialog timeout from 1 to 60000 ms; defaults to 10000 ms.
- `TELEGRAM_TIMEOUT_MS` - Telegram API request timeout from 1 to 60000 ms; defaults to 10000 ms.
- `TELEGRAM_OVERALL_TIMEOUT_MS` - Total retry budget for one Telegram notification from 1 to 300000 ms; defaults to 60000 ms.
- `MAX_OPERATION_RETRIES` - Maximum attempts from 1 to 10 for an individual operation; defaults to 3.
- `MAX_PROCESS_RETRIES` - Maximum attempts from 1 to 10 for the full process; defaults to 3.
- `MAX_RETRIES` - Backward-compatible 1 to 10 override for both retry limits.
- `RETRY_BASE_DELAY_MS` - Initial retry delay from 1 to 300000 ms; defaults to 2000 ms.
- `RETRY_MAX_DELAY_MS` - Retry delay ceiling from 1 to 300000 ms; defaults to 10000 ms.
- `RETRY_BACKOFF_MULTIPLIER` - Backoff multiplier greater than 0 and at most 10; defaults to 2.
- `BROWSER_HEADLESS` - Enables headless Chromium when `true`; defaults to `true`.
- `LOG_LEVEL` - One of `error`, `warn`, `info`, or `debug`; defaults to `info`.
- `JOBKOREA_LOGIN_URL` and `JOBKOREA_MYPAGE_URL` - HTTPS `jobkorea.co.kr` endpoint overrides.
- `CAPTURE_FAILURE_ARTIFACTS` - Opt-in local diagnostics capture; defaults to `false`.

When `CAPTURE_FAILURE_ARTIFACTS=true`, failure diagnostics are written only under the ignored local `diagnostics/` directory. The GitHub Actions workflow never uploads screenshots or HTML diagnostics as artifacts.

## Architecture

### Core Components

1. `src/index.ts` loads and validates configuration, then calls `updateResume`.
2. `src/updateResume.ts` coordinates the update, browser lifecycle, error handling, and notifications.
3. `src/services/browser.ts` manages Playwright Chromium.
4. `src/services/jobkorea.ts` performs the JobKorea interactions.
5. `src/utils/logger.ts`, `src/utils/retry.ts`, and `src/utils/validation.ts` provide logging, retry, and validation utilities.
6. `src/notify.ts` sends bounded Telegram API requests.

### Retry and Error Handling

- Individual operations make up to 3 attempts with exponential backoff by default.
- The complete browser process makes up to 3 attempts with a browser restart by default.
- Credential submission is the exception: form preparation may retry, but the login button is clicked only once and authentication failures are never retried.
- Application failures and JobKorea probe failures are logged and sent through Telegram when notification credentials are valid.
- Workflow setup failures remain visible in the GitHub Actions run even when the application cannot start.

## GitHub Actions

- The workflow requests runs at 08:50 and 12:50 KST. GitHub scheduled workflows are best effort, so actual starts can be delayed.
- The JobKorea endpoint probe runs before checkout, dependency installation, and browser setup.
- The probe and isolated keepalive jobs receive `actions: write`; the credentialed update job is limited to `contents: read`.
- In the normal retry chain, connection failures and HTTP 4xx/5xx responses can trigger at most 4 total workflow attempts, with approximate 3, 8, and 15 minute delays.
- A run that successfully dispatches its replacement is intentionally marked failed because it did not update the resume. Follow the subsequent `workflow_dispatch` run for the eventual result.
- `Auto Rerun Update Resume` backs up replacement-dispatch failures from both scheduled and `workflow_dispatch` runs. Terminal attempt failures use a separate step and are not rerun.
- The workflow caches pnpm packages and Playwright browser binaries after the probe succeeds.
- The workflow does not upload failure screenshots or HTML artifacts.

## Testing

`pnpm test` runs real automated tests instead of a no-op placeholder. Keep tests deterministic and independent of the live JobKorea account and website. CI should run type checking, tests, and the production build.

## Key Implementation Details

- Uses headless Chromium with the Chromium sandbox explicitly enabled by default.
- Pins browser-running GitHub Actions jobs to Ubuntu 22.04 and smoke-tests the real sandboxed launch in CI.
- Restricts every frame navigation to trusted HTTPS JobKorea hosts and fills credentials only when the ID, password, and submit controls share the same safe POST login form.
- Blocks non-JobKorea HTTP egress while credentials are present, blocks external WebSockets, and disables service workers in the browser context.
- Handles login popups and advertisement modals.
- Failure screenshot and HTML capture is disabled by default and opt-in only for local diagnostics.
- Uses selector fallbacks and verifies the expected success dialog.
- Supports local execution and scheduled GitHub Actions runs.
