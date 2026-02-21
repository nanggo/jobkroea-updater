// src/updateResume.ts
import { Config, JobKoreaError } from "./types";
import { Logger } from "./utils/logger";
import { BrowserService } from "./services/browser";
import { JobKoreaService } from "./services/jobkorea";
import { sendTelegramMessage } from "./notify";
import { withBrowserRestart } from "./utils/retry";
import { configManager } from "./config";

export async function updateResume(config: Config): Promise<void> {
  const browserService = new BrowserService();
  const retryConfig = configManager.getRetryConfig();
  let retryCount = 0;

  // 프로세스 종료 시그널 수신 시 브라우저 정리
  const signalCodes: Record<string, number> = { SIGINT: 130, SIGTERM: 143 };
  const gracefulShutdown = async (signal: string) => {
    Logger.info(`${signal} 수신. 브라우저 정리 중...`);
    await browserService.close();
    process.exit(signalCodes[signal] ?? 1);
  };
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  try {
    await withBrowserRestart(
      async () => {
        retryCount++;
        Logger.info(`이력서 업데이트 프로세스 시작 (시도 ${retryCount}/${retryConfig.maxProcessRetries})`);

        await browserService.initialize();
        const page = browserService.getPage();
        const jobKoreaService = new JobKoreaService(page);

        // 1. 로그인 페이지로 이동
        await jobKoreaService.navigateToLoginPage();

        // 2. 로그인 수행
        await jobKoreaService.login(config.jobkoreaId, config.jobkoreaPwd);

        // 3. 로그인 후 팝업 처리
        await jobKoreaService.handleLoginPopup();

        // 4. 마이페이지로 이동
        await jobKoreaService.navigateToMypage();

        // 5. 경력 정보 업데이트
        await jobKoreaService.updateCareerInfo();

        Logger.success("이력서 업데이트 프로세스 완료");
      },
      async () => {
        Logger.info("브라우저 재시작 중...");
        await browserService.close();
        await new Promise(resolve => setTimeout(resolve, 1000));
      },
      {
        maxRetries: retryConfig.maxProcessRetries,
        operation: "이력서 업데이트 전체 프로세스",
      }
    );

    // 6. 성공 메시지 전송과 브라우저 정리를 병렬로 처리
    const results = await Promise.allSettled([
      sendSuccessNotification(config.telegramToken, config.telegramChatId, retryCount),
      browserService.close(),
    ]);

    if (results[0].status === 'rejected') {
      Logger.warning("성공 알림 전송 실패. Telegram 설정을 확인해주세요.");
    }
  } catch (error) {
    // 에러 처리와 브라우저 정리를 병렬로 처리
    const results = await Promise.allSettled([
      handleError(error, config.telegramToken, config.telegramChatId, retryCount),
      browserService.close(),
    ]);

    if (results[0].status === 'rejected') {
      Logger.warning("실패 알림 전송 실패. Telegram 설정을 확인해주세요.");
    }

    process.exit(1);
  }
}

async function sendSuccessNotification(
  token: string,
  chatId: string,
  retryCount: number
): Promise<void> {
  const now = new Date();
  const retryInfo = retryCount > 1 ? `\n재시도 횟수: ${retryCount - 1}번` : "";
  const message = `<blockquote>✅ 이력서 업데이트 완료!\n날짜: ${now.toLocaleDateString(
    "ko-KR",
    { timeZone: "Asia/Seoul" }
  )} 시간: ${now.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
  })}${retryInfo}</blockquote>`;

  await sendTelegramMessage(token, chatId, message, "HTML");
  Logger.success("성공 메시지 전송 완료");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handleError(
  error: unknown,
  token: string,
  chatId: string,
  retryCount: number
): Promise<void> {
  const retryInfo = retryCount > 0 ? `\n재시도 횟수: ${retryCount}번 (모든 재시도 실패)` : "";
  const rawMessage =
    error instanceof JobKoreaError
      ? error.message
      : error instanceof Error
        ? error.message
        : "알 수 없는 오류";
  const safeMessage = escapeHtml(rawMessage);
  const errorMessage =
    error instanceof JobKoreaError
      ? `❌ 이력서 업데이트 최종 실패!\n이유: ${safeMessage} (${error.code})${retryInfo}`
      : `❌ 이력서 업데이트 최종 실패!\n이유: ${safeMessage}${retryInfo}`;

  Logger.error("최종 에러 발생", error instanceof Error ? error : undefined);
  await sendTelegramMessage(token, chatId, errorMessage);
  Logger.info("실패 메시지 전송 완료");
}
