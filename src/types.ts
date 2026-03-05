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
    typeof config === "object" &&
    config !== null &&
    typeof (config as Config).jobkoreaId === "string" &&
    typeof (config as Config).jobkoreaPwd === "string" &&
    typeof (config as Config).telegramToken === "string" &&
    typeof (config as Config).telegramChatId === "string" &&
    (config as Config).jobkoreaId.length > 0 &&
    (config as Config).jobkoreaPwd.length > 0 &&
    (config as Config).telegramToken.length > 0 &&
    (config as Config).telegramChatId.length > 0
  );
}

// 로그 레벨 타입
export type LogLevel = "error" | "warn" | "info" | "debug";

// 작업 타입
export type OperationType = "navigation" | "element" | "popup" | "network";

// 에러 코드 상수
export const ERROR_CODES = {
  AUTH_ERROR: "AUTH_ERROR",
  NAVIGATION_ERROR: "NAVIGATION_ERROR",
  UPDATE_ERROR: "UPDATE_ERROR",
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
