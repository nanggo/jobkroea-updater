// src/index.ts
import { updateResume } from "./updateResume";
import { ConfigValidator } from "./utils/validation";
import { Logger } from "./utils/logger";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  try {
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
