// src/constants.ts
// 중앙화된 설정 시스템을 통해 상수들을 관리
import { configManager } from "./config";

const config = configManager.getConfig();

export const URLS = {
  LOGIN: config.urls.login,
  MYPAGE: config.urls.mypage,
} as const;

export const SELECTORS = {
  LOGIN: {
    ID_INPUT: config.selectors.login.idInput,
    PASSWORD_INPUT: config.selectors.login.passwordInput,
    LOGIN_BUTTON: config.selectors.login.loginButton,
  },
  MYPAGE: {
    STATUS_LINK: config.selectors.mypage.statusLink,
    UPDATE_BUTTON: config.selectors.mypage.updateButton,
  },
} as const;

export const TIMEOUTS = {
  NAVIGATION: config.timeouts.navigation,
  ELEMENT: config.timeouts.element,
  POPUP: config.timeouts.popup,
  UPDATE_DELAY: config.timeouts.updateDelay,
} as const;

export const RETRY_CONFIG = {
  MAX_OPERATION_RETRIES: config.retry.maxOperationRetries,
  MAX_PROCESS_RETRIES: config.retry.maxProcessRetries,
  BASE_DELAY: config.retry.baseDelay,
  MAX_DELAY: config.retry.maxDelay,
  BACKOFF_MULTIPLIER: config.retry.backoffMultiplier,
} as const;
