// src/notify.ts
import { withRetry } from "./utils/retry";
import { RETRY_CONFIG } from "./constants";
import { Logger } from "./utils/logger";

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  message: string,
  parseMode: string = "HTML"
) {
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
        const error = new Error(`Telegram API error: ${response.status} ${response.statusText} - ${errorBody}`);
        
        // 4xx 에러는 영구적 오류로 간주하여 재시도하지 않음
        if (response.status >= 400 && response.status < 500) {
          Logger.error(`Telegram API 영구적 오류 (재시도 안함): ${error.message}`);
          throw error;
        }
        
        // 5xx 에러나 네트워크 오류는 임시적 오류로 간주하여 재시도
        Logger.warning(`Telegram API 임시적 오류 (재시도 예정): ${error.message}`);
        throw error;
      }

      const result = await response.json();
      Logger.info("Telegram 메시지 전송 성공");
      return result;
    },
    {
      maxRetries: RETRY_CONFIG.MAX_OPERATION_RETRIES,
      baseDelay: RETRY_CONFIG.BASE_DELAY,
      maxDelay: RETRY_CONFIG.MAX_DELAY,
      backoffMultiplier: RETRY_CONFIG.BACKOFF_MULTIPLIER,
      operation: "Telegram 메시지 전송",
    }
  );
}
