import { Logger } from "./logger";

interface TimeoutMetrics {
  averageResponseTime: number;
  successRate: number;
  lastMeasurements: number[];
  measurementCount: number;
}

interface AdaptiveTimeoutConfig {
  baseTimeout: number;
  minTimeout: number;
  maxTimeout: number;
  measurementWindow: number;
  successThreshold: number;
  failureMultiplier: number;
  successMultiplier: number;
}

export class AdaptiveTimeoutManager {
  private static instance: AdaptiveTimeoutManager;
  private metrics: TimeoutMetrics = {
    averageResponseTime: 0,
    successRate: 1.0,
    lastMeasurements: [],
    measurementCount: 0,
  };

  private config: AdaptiveTimeoutConfig = {
    baseTimeout: 15000,
    minTimeout: 5000,
    maxTimeout: 30000,
    measurementWindow: 10,
    successThreshold: 0.8,
    failureMultiplier: 1.5,
    successMultiplier: 0.9,
  };

  static getInstance(): AdaptiveTimeoutManager {
    if (!AdaptiveTimeoutManager.instance) {
      AdaptiveTimeoutManager.instance = new AdaptiveTimeoutManager();
    }
    return AdaptiveTimeoutManager.instance;
  }

  recordMeasurement(responseTime: number, success: boolean): void {
    // 성공한 요청만 응답 시간에 포함
    if (success) {
      this.metrics.lastMeasurements.push(responseTime);
      
      // 측정 윈도우 크기 유지
      if (this.metrics.lastMeasurements.length > this.config.measurementWindow) {
        this.metrics.lastMeasurements.shift();
      }
      
      // 평균 응답 시간 계산
      this.metrics.averageResponseTime = 
        this.metrics.lastMeasurements.reduce((sum, time) => sum + time, 0) / 
        this.metrics.lastMeasurements.length;
    }

    this.metrics.measurementCount++;
    
    // 성공률 계산 (최근 측정값들 기준)
    const recentWindow = Math.min(this.config.measurementWindow, this.metrics.measurementCount);
    const successCount = this.metrics.lastMeasurements.length;
    this.metrics.successRate = successCount / recentWindow;

    Logger.info(`타임아웃 측정 기록: ${responseTime}ms, 성공: ${success}, 평균 응답시간: ${this.metrics.averageResponseTime.toFixed(0)}ms, 성공률: ${(this.metrics.successRate * 100).toFixed(1)}%`);
  }

  getAdaptiveTimeout(operationType: 'navigation' | 'element' | 'popup' | 'network'): number {
    let baseTimeout: number;
    
    // 작업 유형별 기본 타임아웃
    switch (operationType) {
      case 'navigation':
        baseTimeout = 20000;
        break;
      case 'element':
        baseTimeout = 15000;
        break;
      case 'popup':
        baseTimeout = 10000;
        break;
      case 'network':
        baseTimeout = 8000;
        break;
      default:
        baseTimeout = this.config.baseTimeout;
    }

    // 측정 데이터가 충분하지 않으면 기본값 사용
    if (this.metrics.measurementCount < 3) {
      return baseTimeout;
    }

    let adaptiveTimeout = baseTimeout;

    // 성공률 기반 조정
    if (this.metrics.successRate < this.config.successThreshold) {
      // 성공률이 낮으면 타임아웃 증가
      adaptiveTimeout *= this.config.failureMultiplier;
      Logger.warning(`낮은 성공률로 인한 타임아웃 증가: ${adaptiveTimeout.toFixed(0)}ms`);
    } else if (this.metrics.successRate > 0.95) {
      // 성공률이 높으면 타임아웃 감소 (성능 최적화)
      adaptiveTimeout *= this.config.successMultiplier;
      Logger.info(`높은 성공률로 인한 타임아웃 감소: ${adaptiveTimeout.toFixed(0)}ms`);
    }

    // 평균 응답시간 기반 조정
    if (this.metrics.averageResponseTime > 0) {
      const responseBasedTimeout = this.metrics.averageResponseTime * 2.5; // 여유분 2.5배
      adaptiveTimeout = Math.max(adaptiveTimeout, responseBasedTimeout);
    }

    // 최소/최대 범위 내로 제한
    adaptiveTimeout = Math.max(this.config.minTimeout, Math.min(this.config.maxTimeout, adaptiveTimeout));

    Logger.info(`적응형 타임아웃 계산: ${operationType} -> ${adaptiveTimeout.toFixed(0)}ms`);
    return Math.round(adaptiveTimeout);
  }

  resetMetrics(): void {
    this.metrics = {
      averageResponseTime: 0,
      successRate: 1.0,
      lastMeasurements: [],
      measurementCount: 0,
    };
    Logger.info("타임아웃 측정 지표 초기화");
  }

  getMetrics(): TimeoutMetrics {
    return { ...this.metrics };
  }
}

// 타임아웃 측정을 위한 래퍼 함수
export async function withTimeoutMeasurement<T>(
  operation: () => Promise<T>,
  operationType: 'navigation' | 'element' | 'popup' | 'network',
  timeoutMs?: number
): Promise<T> {
  const timeoutManager = AdaptiveTimeoutManager.getInstance();
  const adaptiveTimeout = timeoutMs || timeoutManager.getAdaptiveTimeout(operationType);
  
  const startTime = Date.now();
  let success = false;
  
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timeout after ${adaptiveTimeout}ms`)), adaptiveTimeout);
    });
    
    const result = await Promise.race([operation(), timeoutPromise]);
    success = true;
    return result;
  } finally {
    const responseTime = Date.now() - startTime;
    timeoutManager.recordMeasurement(responseTime, success);
  }
}