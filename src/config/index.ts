// src/config/index.ts
import { Config } from "../types";

export interface AppConfig {
  // URL 설정
  urls: {
    login: string;
    mypage: string;
  };
  
  // CSS 셀렉터 설정 (fallback 포함)
  selectors: {
    login: {
      idInput: readonly string[];
      passwordInput: readonly string[];
      loginButton: readonly string[];
    };
    mypage: {
      statusLink: readonly string[];
      updateButton: readonly string[];
    };
  };
  
  // 타임아웃 설정
  timeouts: {
    navigation: number;
    element: number;
    popup: number;
    updateDelay: number;
  };
  
  // 재시도 설정
  retry: {
    maxOperationRetries: number;
    maxProcessRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  
  // 브라우저 설정
  browser: {
    headless: boolean;
    viewport: {
      width: number;
      height: number;
    };
    args: readonly string[];
    blockResources: {
      ads: boolean;
      analytics: boolean;
      socialMedia: boolean;
      unnecessaryImages: boolean;
    };
  };
  
  // 적응형 타임아웃 설정
  adaptiveTimeout: {
    baseTimeout: number;
    minTimeout: number;
    maxTimeout: number;
    measurementWindow: number;
    successThreshold: number;
    failureMultiplier: number;
    successMultiplier: number;
  };
  
  // 로깅 설정
  logging: {
    enableSensitiveDataMasking: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    includeTimestamp: boolean;
  };
  
  // 보안 설정
  security: {
    maskSensitiveInfo: boolean;
    validateInputs: boolean;
    enforceHttps: boolean;
  };
}

export const defaultConfig: AppConfig = {
  urls: {
    login: "https://www.jobkorea.co.kr/Login/",
    mypage: "https://www.jobkorea.co.kr/User/Mypage",
  },
  
  selectors: {
    login: {
      idInput: [".input-id", "#user_id", 'input[name="user_id"]', 'input[type="text"]'],
      passwordInput: [".input-password", "#user_pwd", 'input[name="user_pwd"]', 'input[type="password"]'],
      loginButton: [".login-button", "#login_btn", 'button[type="submit"]', '.btn-login'],
    },
    mypage: {
      statusLink: [".status a", ".my-status a", 'a[href*="status"]', ".resume-status a"],
      updateButton: [".button-update", ".btn-update", 'button[onclick*="update"]', ".update-btn"],
    },
  },
  
  timeouts: {
    navigation: 20000,
    element: 15000,
    popup: 10000,
    updateDelay: 3000,
  },
  
  retry: {
    maxOperationRetries: 3,
    maxProcessRetries: 3,
    baseDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  },
  
  browser: {
    headless: true,
    viewport: {
      width: 1280,
      height: 720,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--memory-pressure-off',
    ],
    blockResources: {
      ads: true,
      analytics: true,
      socialMedia: true,
      unnecessaryImages: true,
    },
  },
  
  adaptiveTimeout: {
    baseTimeout: 15000,
    minTimeout: 5000,
    maxTimeout: 30000,
    measurementWindow: 10,
    successThreshold: 0.8,
    failureMultiplier: 1.5,
    successMultiplier: 0.9,
  },
  
  logging: {
    enableSensitiveDataMasking: true,
    logLevel: 'info',
    includeTimestamp: true,
  },
  
  security: {
    maskSensitiveInfo: true,
    validateInputs: true,
    enforceHttps: true,
  },
};

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = { ...defaultConfig };
    this.loadEnvironmentOverrides();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadEnvironmentOverrides(): void {
    // 환경변수로 설정 오버라이드 가능
    if (process.env.JOBKOREA_LOGIN_URL) {
      this.config.urls.login = process.env.JOBKOREA_LOGIN_URL;
    }
    
    if (process.env.JOBKOREA_MYPAGE_URL) {
      this.config.urls.mypage = process.env.JOBKOREA_MYPAGE_URL;
    }
    
    if (process.env.BROWSER_HEADLESS) {
      this.config.browser.headless = process.env.BROWSER_HEADLESS === 'true';
    }
    
    if (process.env.MAX_RETRIES) {
      const maxRetries = parseInt(process.env.MAX_RETRIES, 10);
      if (!isNaN(maxRetries) && maxRetries > 0) {
        this.config.retry.maxOperationRetries = maxRetries;
        this.config.retry.maxProcessRetries = maxRetries;
      }
    }
    
    if (process.env.LOG_LEVEL && ['error', 'warn', 'info', 'debug'].includes(process.env.LOG_LEVEL)) {
      this.config.logging.logLevel = process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug';
    }
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // 편의 메서드들
  getUrls() {
    return this.config.urls;
  }

  getSelectors() {
    return this.config.selectors;
  }

  getTimeouts() {
    return this.config.timeouts;
  }

  getRetryConfig() {
    return this.config.retry;
  }

  getBrowserConfig() {
    return this.config.browser;
  }

  getAdaptiveTimeoutConfig() {
    return this.config.adaptiveTimeout;
  }

  getLoggingConfig() {
    return this.config.logging;
  }

  getSecurityConfig() {
    return this.config.security;
  }
}

export const configManager = ConfigManager.getInstance();
export default configManager;