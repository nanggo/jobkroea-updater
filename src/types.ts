// 기본 설정 타입
export interface Config {
  readonly jobkoreaId: string;
  readonly jobkoreaPwd: string;
  readonly telegramToken: string;
  readonly telegramChatId: string;
}

// 런타임 타입 가드
export function isValidConfig(config: unknown): config is Config {
  return (
    typeof config === 'object' &&
    config !== null &&
    typeof (config as Config).jobkoreaId === 'string' &&
    typeof (config as Config).jobkoreaPwd === 'string' &&
    typeof (config as Config).telegramToken === 'string' &&
    typeof (config as Config).telegramChatId === 'string' &&
    (config as Config).jobkoreaId.length > 0 &&
    (config as Config).jobkoreaPwd.length > 0 &&
    (config as Config).telegramToken.length > 0 &&
    (config as Config).telegramChatId.length > 0
  );
}

// 로그 레벨 타입
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// 작업 타입
export type OperationType = 'navigation' | 'element' | 'popup' | 'network';

// 브라우저 상태 타입
export type BrowserState = 'initialized' | 'closed' | 'error';

// 프로세스 상태 타입
export type ProcessStatus = 'pending' | 'running' | 'completed' | 'failed';

// 재시도 결과 타입
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  attempts: number;
  totalTime: number;
  lastError?: Error;
}

// 측정 결과 타입
export interface MeasurementResult {
  operation: OperationType;
  duration: number;
  success: boolean;
  timestamp: number;
}

// 에러 코드 상수
export const ERROR_CODES = {
  AUTH_ERROR: 'AUTH_ERROR',
  NAVIGATION_ERROR: 'NAVIGATION_ERROR',
  UPDATE_ERROR: 'UPDATE_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// 강화된 에러 클래스
export class JobKoreaError extends Error {
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string, 
    public readonly code: ErrorCode,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "JobKoreaError";
    this.timestamp = Date.now();
    this.context = context;
    
    // 스택 트레이스 정리
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JobKoreaError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

export class AuthenticationError extends JobKoreaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, ERROR_CODES.AUTH_ERROR, context);
    this.name = "AuthenticationError";
  }
}

export class NavigationError extends JobKoreaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, ERROR_CODES.NAVIGATION_ERROR, context);
    this.name = "NavigationError";
  }
}

export class UpdateError extends JobKoreaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, ERROR_CODES.UPDATE_ERROR, context);
    this.name = "UpdateError";
  }
}

export class TimeoutError extends JobKoreaError {
  constructor(message: string, timeout: number, operation: OperationType) {
    super(message, ERROR_CODES.TIMEOUT_ERROR, { timeout, operation });
    this.name = "TimeoutError";
  }
}

export class NetworkError extends JobKoreaError {
  constructor(message: string, statusCode?: number, url?: string) {
    super(message, ERROR_CODES.NETWORK_ERROR, { statusCode, url });
    this.name = "NetworkError";
  }
}

export class ValidationError extends JobKoreaError {
  constructor(message: string, field?: string, value?: unknown) {
    super(message, ERROR_CODES.VALIDATION_ERROR, { field, value });
    this.name = "ValidationError";
  }
}

// 유틸리티 타입 가드
export function isJobKoreaError(error: unknown): error is JobKoreaError {
  return error instanceof JobKoreaError;
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isNavigationError(error: unknown): error is NavigationError {
  return error instanceof NavigationError;
}

export function isUpdateError(error: unknown): error is UpdateError {
  return error instanceof UpdateError;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
