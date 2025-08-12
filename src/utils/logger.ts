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
    // 패스워드 관련
    { pattern: /(password|pwd|pass|secret)[\s]*[:=][\s]*["']?([^"'\s,}]+)/gi, replacement: '$1: ***' },
    // 토큰 관련
    { pattern: /(token|key|auth|bearer)[\s]*[:=][\s]*["']?([^"'\s,}]+)/gi, replacement: '$1: ***' },
    // ID가 포함된 경우 (JobKorea ID 등)
    { pattern: /(jobkorea_?id|user_?id|login_?id)[\s]*[:=][\s]*["']?([^"'\s,}]+)/gi, replacement: '$1: ***' },
    // Telegram 관련
    { pattern: /(telegram_?bot_?token|telegram_?chat_?id)[\s]*[:=][\s]*["']?([^"'\s,}]+)/gi, replacement: '$1: ***' },
    // 일반적인 민감 정보 패턴
    { pattern: /(\b\d{10,}\b)/g, replacement: '***' }, // 10자리 이상 숫자 (전화번호, ID 등)
  ];

  private static logHistory: LogEntry[] = [];
  private static maxHistorySize = 1000; // 최대 로그 기록 수

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
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
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
        message: loggingConfig.enableSensitiveDataMasking ? this.maskSensitiveData(error.message) : error.message,
        code: error instanceof JobKoreaError ? error.code : undefined,
        stack: error.stack && loggingConfig.enableSensitiveDataMasking ? this.maskSensitiveData(error.stack) : error.stack,
      };
    }

    return entry;
  }

  private static addToHistory(entry: LogEntry): void {
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }
  }

  private static formatForConsole(entry: LogEntry): string {
    const { timestamp, level, message, context, operation, duration, error } = entry;
    const loggingConfig = configManager.getLoggingConfig();
    
    let formatted = '';
    
    if (loggingConfig.includeTimestamp) {
      formatted += `[${timestamp}] `;
    }
    
    const levelEmoji = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🔍',
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
    this.addToHistory(entry);
    
    const formatted = this.formatForConsole(entry);
    
    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'info':
        console.log(formatted);
        break;
      case 'debug':
        console.debug(formatted);
        break;
    }
  }

  static debug(message: string, context?: Record<string, unknown>, operation?: OperationType): void {
    this.log('debug', message, context, undefined, operation);
  }

  static info(message: string, context?: Record<string, unknown>, operation?: OperationType): void {
    this.log('info', message, context, undefined, operation);
  }

  static warning(message: string, context?: Record<string, unknown>, operation?: OperationType): void {
    this.log('warn', message, context, undefined, operation);
  }

  static error(message: string, error?: Error, context?: Record<string, unknown>, operation?: OperationType): void {
    this.log('error', message, context, error, operation);
  }

  static success(message: string, context?: Record<string, unknown>, operation?: OperationType, duration?: number): void {
    this.log('info', `✅ ${message}`, context, undefined, operation, duration);
  }

  // 성능 측정을 위한 메서드
  static measureOperation<T>(
    operation: OperationType,
    operationName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const startTime = Date.now();
      this.debug(`${operationName} 시작`, undefined, operation);
      
      try {
        const result = await fn();
        const duration = Date.now() - startTime;
        this.success(`${operationName} 완료`, undefined, operation, duration);
        resolve(result);
      } catch (error) {
        const duration = Date.now() - startTime;
        this.error(`${operationName} 실패`, error as Error, { duration }, operation);
        reject(error);
      }
    });
  }

  // 로그 히스토리 조회 메서드
  static getHistory(level?: LogLevel, limit?: number): LogEntry[] {
    let filtered = this.logHistory;
    
    if (level) {
      filtered = filtered.filter(entry => entry.level === level);
    }
    
    if (limit) {
      filtered = filtered.slice(-limit);
    }
    
    return filtered;
  }

  // 로그 히스토리 정리
  static clearHistory(): void {
    this.logHistory = [];
  }

  // 에러 통계
  static getErrorStats(): { total: number; byCode: Record<string, number> } {
    const errors = this.logHistory.filter(entry => entry.level === 'error' && entry.error);
    const byCode: Record<string, number> = {};
    
    errors.forEach(entry => {
      if (entry.error?.code) {
        byCode[entry.error.code] = (byCode[entry.error.code] || 0) + 1;
      }
    });
    
    return { total: errors.length, byCode };
  }
}
