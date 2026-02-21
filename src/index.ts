// src/index.ts
import { updateResume } from "./updateResume";
import { ConfigValidator } from "./utils/validation";
import { Logger } from "./utils/logger";
import * as fs from "fs";

// dotenv는 로컬 개발 환경에서만 필요 (CI에서는 환경변수가 직접 주입됨)
try {
  require("dotenv").config();
} catch {
  // dotenv가 설치되지 않은 환경 (CI 등)에서는 무시
}

function cleanupOldScreenshots(): void {
  try {
    const files = fs.readdirSync(process.cwd());
    const screenshotFiles = files.filter(f => f.startsWith("error-") && f.endsWith(".png"));

    for (const file of screenshotFiles) {
      fs.unlinkSync(`${process.cwd()}/${file}`);
    }

    if (screenshotFiles.length > 0) {
      Logger.info(`이전 스크린샷 ${screenshotFiles.length}개 정리 완료`);
    }
  } catch (error) {
    Logger.warning("스크린샷 정리 중 오류 발생");
  }
}

async function main() {
  try {
    cleanupOldScreenshots();

    // 환경변수 존재 여부 검증
    const envValidation = ConfigValidator.validateEnvironmentVariables();
    if (!envValidation.isValid) {
      Logger.error("환경변수 검증 실패:");
      envValidation.errors.forEach(error => Logger.error(`  - ${error}`));
      process.exit(1);
    }

    // 설정 객체 생성
    const config = {
      jobkoreaId: process.env.JOBKOREA_ID!,
      jobkoreaPwd: process.env.JOBKOREA_PWD!,
      telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
      telegramChatId: process.env.TELEGRAM_CHAT_ID!,
    };

    // 설정 값 형식 검증
    const configValidation = ConfigValidator.validateConfig(config);
    if (!configValidation.isValid) {
      Logger.error("설정 검증 실패. 환경변수를 확인해주세요.");
      process.exit(1);
    }

    Logger.info("애플리케이션 시작");
    await updateResume(config);
    Logger.success("애플리케이션 정상 종료");
  } catch (error) {
    Logger.error("애플리케이션 실행 중 치명적 오류 발생", error as Error);
    process.exit(1);
  }
}

main();
