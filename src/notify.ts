// src/notify.ts
import { withRetry } from "./utils/retry";
import { configManager } from "./config";
import { Logger } from "./utils/logger";

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

class RetryableError extends Error {
  retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableError";
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | undefined {
  if (!retryAfterHeader) return undefined;

  const seconds = Number(retryAfterHeader);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(retryAfterHeader);
  if (!Number.isNaN(retryAt)) {
    const diffMs = retryAt - Date.now();
    if (diffMs > 0) {
      return diffMs;
    }
  }

  return undefined;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  message: string,
  parseMode: string = "HTML"
) {
  const retryConfig = configManager.getRetryConfig();

  return await withRetry(
    async () => {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: parseMode,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unknown error");
        const errorMessage = `Telegram API error: ${response.status} ${response.statusText} - ${errorBody}`;

        // Telegram 429는 일시적 throttling이므로 재시도 대상이다.
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          Logger.error(`Telegram API 영구적 오류 (재시도 안함): ${errorMessage}`);
          throw new NonRetryableError(errorMessage);
        }

        const retryAfterMs =
          response.status === 429 ? parseRetryAfterMs(response.headers.get("retry-after")) : undefined;
        Logger.warning(`Telegram API 임시적 오류 (재시도 예정): ${errorMessage}`);
        throw new RetryableError(errorMessage, retryAfterMs);
      }

      const result = await response.json();
      Logger.info("Telegram 메시지 전송 성공");
      return result;
    },
    {
      maxRetries: retryConfig.maxOperationRetries,
      baseDelay: retryConfig.baseDelay,
      maxDelay: retryConfig.maxDelay,
      backoffMultiplier: retryConfig.backoffMultiplier,
      operation: "Telegram 메시지 전송",
      shouldRetry: (error) => !(error instanceof NonRetryableError),
    }
  );
}
