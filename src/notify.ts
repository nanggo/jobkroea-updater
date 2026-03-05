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

        if (response.status >= 400 && response.status < 500) {
          Logger.error(`Telegram API 영구적 오류 (재시도 안함): ${errorMessage}`);
          throw new NonRetryableError(errorMessage);
        }

        Logger.warning(`Telegram API 임시적 오류 (재시도 예정): ${errorMessage}`);
        throw new Error(errorMessage);
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
