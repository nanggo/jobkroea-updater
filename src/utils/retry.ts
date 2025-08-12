import { Logger } from "./logger";
import { RETRY_CONFIG } from "../constants";

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  operation?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = RETRY_CONFIG.MAX_OPERATION_RETRIES,
    baseDelay = RETRY_CONFIG.BASE_DELAY,
    maxDelay = RETRY_CONFIG.MAX_DELAY,
    backoffMultiplier = RETRY_CONFIG.BACKOFF_MULTIPLIER,
    operation = "작업",
  } = options;

  let lastError: Error = new Error("No attempts made");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      Logger.info(`${operation} 시도 중... (${attempt}/${maxRetries})`);
      const result = await fn();
      
      if (attempt > 1) {
        Logger.success(`${operation} 성공! (${attempt}번째 시도에서 성공)`);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        Logger.error(`${operation} 최종 실패 (${maxRetries}번 시도 후)`, lastError);
        throw lastError;
      }
      
      const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);
      Logger.warning(
        `${operation} 실패 (${attempt}/${maxRetries}). ${delay}ms 후 재시도... 오류: ${lastError.message}`
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function withBrowserRestart<T>(
  fn: () => Promise<T>,
  browserRestartFn: () => Promise<void>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = RETRY_CONFIG.MAX_PROCESS_RETRIES,
    operation = "전체 프로세스",
  } = options;

  let lastError: Error = new Error("No attempts made");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      Logger.info(`${operation} 시도 중... (${attempt}/${maxRetries})`);
      const result = await fn();
      
      if (attempt > 1) {
        Logger.success(`${operation} 성공! (${attempt}번째 시도에서 성공)`);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        Logger.error(`${operation} 최종 실패 (${maxRetries}번 시도 후)`, lastError);
        throw lastError;
      }
      
      Logger.warning(
        `${operation} 실패 (${attempt}/${maxRetries}). 브라우저 재시작 후 재시도... 오류: ${lastError.message}`
      );
      
      try {
        await browserRestartFn();
      } catch (restartError) {
        Logger.error("브라우저 재시작 실패", restartError as Error);
      }
      
      await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.BASE_DELAY));
    }
  }
  
  throw lastError;
}