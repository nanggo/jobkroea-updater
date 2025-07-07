// src/updateResume.ts
import { Config, JobKoreaError } from "./types";
import { Logger } from "./utils/logger";
import { BrowserService } from "./services/browser";
import { JobKoreaService } from "./services/jobkorea";
import { sendTelegramMessage } from "./notify";

export async function updateResume(config: Config): Promise<void> {
  const browserService = new BrowserService();

  try {
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

    // 6. 성공 메시지 전송
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() < 10) {
      await sendSuccessNotification(config.telegramToken, config.telegramChatId);
    }
  } catch (error) {
    await handleError(error, config.telegramToken, config.telegramChatId);
    process.exit(1);
  } finally {
    await browserService.close();
  }
}

async function sendSuccessNotification(
  token: string,
  chatId: string
): Promise<void> {
  const now = new Date();
  const message = `<blockquote>✅ 이력서 업데이트 완료!\n날짜: ${now.toLocaleDateString(
    "ko-KR",
    { timeZone: "Asia/Seoul" }
  )} 시간: ${now.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
  })}</blockquote>`;

  await sendTelegramMessage(token, chatId, message, "HTML");
  Logger.success("성공 메시지 전송 완료");
}

async function handleError(
  error: unknown,
  token: string,
  chatId: string
): Promise<void> {
  const errorMessage =
    error instanceof JobKoreaError
      ? `❌ 이력서 업데이트 실패!\n이유: ${error.message} (${error.code})`
      : `❌ 이력서 업데이트 실패!\n이유: ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }`;

  Logger.error("에러 발생", error instanceof Error ? error : undefined);
  await sendTelegramMessage(token, chatId, errorMessage);
  Logger.info("실패 메시지 전송 완료");
}
