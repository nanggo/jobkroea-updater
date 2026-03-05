import { LogLevel, JobKoreaError, OperationType } from "../types";
import { configManager } from "../config";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  operation?: OperationType;
  duration?: number;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
}

export class Logger {
  private static readonly SENSITIVE_PATTERNS = [
    { pattern: /(password|pwd|pass|secret)[\s]*[:=][\s]*["']?([^"'\s,}]+)/gi, replacement: "$1: ***" },
    { pattern: /(token|key|auth|bearer)[\s]*[:=][\s]*["']?([^"'\s,}]+)/gi, replacement: "$1: ***" },
    { pattern: /(jobkorea_?id|user_?id|login_?id)[\s]*[:=][\s]*["']?([^"'\s,}]+)/gi, replacement: "$1: ***" },
    {
      pattern: /(telegram_?bot_?token|telegram_?chat_?id)[\s]*[:=][\s]*["']?([^"'\s,}]+)/gi,
      replacement: "$1: ***",
    },
    { pattern: /(\b\d{10,}\b)/g, replacement: "***" },
  ];

  private static maskSensitiveData(data: string): string {
    const config = configManager.getSecurityConfig();
    if (!config.maskSensitiveInfo) {
      return data;
    }

    let maskedData = data;
    for (const { pattern, replacement } of this.SENSITIVE_PATTERNS) {
      maskedData = maskedData.replace(pattern, replacement);
    }
    return maskedData;
  }

  private static shouldLog(level: LogLevel): boolean {
    const loggingConfig = configManager.getLoggingConfig();
    const levels: LogLevel[] = ["error", "warn", "info", "debug"];
    const currentLevelIndex = levels.indexOf(loggingConfig.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private static createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
    operation?: OperationType,
    duration?: number
  ): LogEntry {
    const loggingConfig = configManager.getLoggingConfig();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: loggingConfig.enableSensitiveDataMasking ? this.maskSensitiveData(message) : message,
      context,
      operation,
      duration,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: loggingConfig.enableSensitiveDataMasking
          ? this.maskSensitiveData(error.message)
          : error.message,
        code: error instanceof JobKoreaError ? error.code : undefined,
        stack:
          error.stack && loggingConfig.enableSensitiveDataMasking
            ? this.maskSensitiveData(error.stack)
            : error.stack,
      };
    }

    return entry;
  }

  private static formatForConsole(entry: LogEntry): string {
    const { timestamp, level, message, context, operation, duration, error } = entry;
    const loggingConfig = configManager.getLoggingConfig();

    let formatted = "";

    if (loggingConfig.includeTimestamp) {
      formatted += `[${timestamp}] `;
    }

    const levelEmoji = {
      error: "❌",
      warn: "⚠️",
      info: "ℹ️",
      debug: "🔍",
    };

    formatted += `${levelEmoji[level]} [${level.toUpperCase()}] ${message}`;

    if (operation) {
      formatted += ` [${operation}]`;
    }

    if (duration !== undefined) {
      formatted += ` (${duration}ms)`;
    }

    if (context && Object.keys(context).length > 0) {
      formatted += ` | Context: ${JSON.stringify(context)}`;
    }

    if (error) {
      formatted += ` | Error: ${error.name}: ${error.message}`;
      if (error.code) {
        formatted += ` (${error.code})`;
      }
    }

    return formatted;
  }

  static log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
    operation?: OperationType,
    duration?: number
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.createLogEntry(level, message, context, error, operation, duration);
    const formatted = this.formatForConsole(entry);

    switch (level) {
      case "error":
        console.error(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "info":
        console.log(formatted);
        break;
      case "debug":
        console.debug(formatted);
        break;
    }
  }

  static debug(message: string, context?: Record<string, unknown>, operation?: OperationType): void {
    this.log("debug", message, context, undefined, operation);
  }

  static info(message: string, context?: Record<string, unknown>, operation?: OperationType): void {
    this.log("info", message, context, undefined, operation);
  }

  static warning(message: string, context?: Record<string, unknown>, operation?: OperationType): void {
    this.log("warn", message, context, undefined, operation);
  }

  static error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
    operation?: OperationType
  ): void {
    this.log("error", message, context, error, operation);
  }

  static success(
    message: string,
    context?: Record<string, unknown>,
    operation?: OperationType,
    duration?: number
  ): void {
    this.log("info", `✅ ${message}`, context, undefined, operation, duration);
  }
}
