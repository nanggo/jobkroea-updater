# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based automation bot that updates a JobKorea resume twice daily using Playwright. The bot logs into JobKorea, updates career information, and sends notifications via Telegram.

## Commands

### Development Commands
- `pnpm tsc` or `npm run build` - Build TypeScript to JavaScript
- `pnpm tsc --noEmit` or `npm run lint` - Type checking without emitting files
- `npm run start` - Run the compiled application
- `npm run test` - Run Playwright tests (though no tests exist currently)

### Local Development
- Install dependencies: `pnpm install` (preferred) or `npm install`
- Install Playwright browsers: `npx playwright install --with-deps`
- Build: `pnpm tsc`
- Run: `node dist/index.js`

## Environment Variables

Required environment variables (set in .env for local development or GitHub secrets for CI):
- `JOBKOREA_ID` - JobKorea login ID
- `JOBKOREA_PWD` - JobKorea login password
- `TELEGRAM_BOT_TOKEN` - Telegram bot token for notifications
- `TELEGRAM_CHAT_ID` - Telegram chat ID for notifications

## Architecture

### Core Components

1. **Main Entry Point** (`src/index.ts`):
   - Loads environment variables
   - Validates required configuration
   - Calls updateResume function

2. **Resume Update Orchestrator** (`src/updateResume.ts`):
   - Coordinates the entire update process
   - Handles error management and notification sending
   - Manages browser lifecycle

3. **Service Layer**:
   - `BrowserService` (`src/services/browser.ts`): Manages Playwright browser instance
   - `JobKoreaService` (`src/services/jobkorea.ts`): Handles JobKorea website interactions

4. **Utilities**:
   - `Logger` (`src/utils/logger.ts`): Timestamped logging utility
   - `notify.ts`: Telegram notification functions

### Error Handling and Retry Logic

The application uses custom error classes:
- `JobKoreaError` - Base error class
- `AuthenticationError` - Login failures
- `NavigationError` - Page navigation issues
- `UpdateError` - Resume update failures

**Retry Mechanism:**
- **Individual operations** (login, navigation, update): 3 attempts with exponential backoff
- **Complete process**: 3 full attempts with browser restart between attempts
- **Retry delays**: Start at 2 seconds, increase exponentially up to 10 seconds max
- **Logging**: Detailed retry attempt logging and failure reasons
- **Notifications**: Include retry count information in Telegram messages

All errors are logged and sent as Telegram notifications with retry information.

### Constants and Configuration

- `URLS`: JobKorea endpoint URLs
- `SELECTORS`: CSS selectors for page elements
- `TIMEOUTS`: Various timeout values for operations
- `RETRY_CONFIG`: Retry mechanism configuration
  - `MAX_OPERATION_RETRIES`: 3 (individual operations)
  - `MAX_PROCESS_RETRIES`: 3 (complete process)
  - `BASE_DELAY`: 2000ms (initial delay)
  - `MAX_DELAY`: 10000ms (maximum delay)
  - `BACKOFF_MULTIPLIER`: 2 (exponential backoff factor)

## GitHub Actions

The project uses GitHub Actions for automated execution:
- Runs twice daily (8:50 AM and 12:50 PM KST)
- Can be triggered manually via workflow_dispatch
- Caches pnpm modules and Playwright browsers for performance
- Uploads screenshot artifacts on failure

## Testing

While the project has Playwright as a dependency and a test script in package.json, no actual tests are currently implemented. The bot relies on the real JobKorea website for operation.

## Key Implementation Details

- Uses headless Chromium browser
- Handles login popups and advertisement modals
- Takes screenshots on failures for debugging
- Implements retry logic for navigation
- Checks for specific success messages in dialog boxes
- Supports both local development and CI/CD execution