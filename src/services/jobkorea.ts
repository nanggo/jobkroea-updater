import { Page } from "playwright";
import { URLS, SELECTORS, TIMEOUTS } from "../constants";
import { Logger } from "../utils/logger";
import { AuthenticationError, NavigationError, UpdateError } from "../types";

export class JobKoreaService {
  constructor(private readonly page: Page) {}

  async navigateToLoginPage(): Promise<void> {
    const MAX_RETRIES = 3;
    for (let i = 1; i <= MAX_RETRIES; i++) {
      try {
        Logger.info(`로그인 페이지로 이동 시도 중... (${i}/${MAX_RETRIES})`);
        await this.page.goto(URLS.LOGIN, {
          waitUntil: "domcontentloaded",
          timeout: TIMEOUTS.NAVIGATION,
        });

        await this.page.waitForSelector(SELECTORS.LOGIN.ID_INPUT, {
          state: "visible",
          timeout: TIMEOUTS.ELEMENT,
        });

        Logger.success("로그인 페이지로 성공적으로 이동 및 확인 완료");
        return;
      } catch (error) {
        Logger.warning(
          `로그인 페이지 이동 실패 (${i}/${MAX_RETRIES}). 재시도합니다.`
        );
        if (i === MAX_RETRIES) {
          throw new NavigationError(
            `로그인 페이지로 이동하는데 실패했습니다. (${MAX_RETRIES}번 재시도)`
          );
        }
        await this.page.waitForTimeout(2000);
      }
    }
  }

  async login(id: string, password: string): Promise<void> {
    try {
      Logger.info("로그인 시도 중...");

      await this.page.waitForSelector(SELECTORS.LOGIN.ID_INPUT, {
        state: "visible",
        timeout: TIMEOUTS.ELEMENT,
      });
      await this.page.fill(SELECTORS.LOGIN.ID_INPUT, id);

      await this.page.waitForSelector(SELECTORS.LOGIN.PASSWORD_INPUT, {
        state: "visible",
        timeout: TIMEOUTS.ELEMENT,
      });
      await this.page.fill(SELECTORS.LOGIN.PASSWORD_INPUT, password);

      await this.page.waitForSelector(SELECTORS.LOGIN.LOGIN_BUTTON, {
        state: "visible",
        timeout: TIMEOUTS.ELEMENT,
      });

      await Promise.all([
        this.page.waitForNavigation({
          waitUntil: "networkidle",
          timeout: TIMEOUTS.NAVIGATION,
        }),
        this.page.click(SELECTORS.LOGIN.LOGIN_BUTTON),
      ]);

      await this.page.waitForSelector(SELECTORS.MYPAGE.STATUS_LINK, {
        state: "visible",
        timeout: TIMEOUTS.ELEMENT,
      });

      Logger.success("로그인 성공 및 페이지 전환 확인 완료");
    } catch (error) {
      const screenshotPath = `error-login-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      Logger.error(`로그인 실패. 스크린샷 저장: ${screenshotPath}`);

      throw new AuthenticationError("로그인 실패");
    }
  }

  async handleLoginPopup(): Promise<void> {
    try {
      Logger.info("로그인 팝업 처리 중...");
      const [popup] = await Promise.all([
        this.page.waitForEvent("popup", { timeout: TIMEOUTS.POPUP }),
      ]);

      if (popup) {
        await popup.waitForSelector('a[href*="나중에 변경"]', {
          timeout: TIMEOUTS.ELEMENT,
        });
        const [dialog] = await Promise.all([
          popup.waitForEvent("dialog", { timeout: TIMEOUTS.POPUP }),
          popup.click('a[href*="나중에 변경"]'),
        ]);
        await dialog.dismiss();
        Logger.success("팝업 처리 완료");
      }
    } catch (error) {
      Logger.warning("팝업이 나타나지 않았거나 처리할 수 없습니다.");
    }
  }

  async navigateToMypage(): Promise<void> {
    try {
      Logger.info("마이페이지로 이동 중...");
      await this.page.goto(URLS.MYPAGE, { waitUntil: "networkidle" });
      Logger.success("마이페이지로 이동 완료");
    } catch (error) {
      throw new NavigationError("마이페이지 이동 실패");
    }
  }

  async updateCareerInfo(): Promise<void> {
    let resumePopup: Page | null = null;
    try {
      Logger.info("경력 정보 업데이트 중...");
      await this.page.waitForSelector(SELECTORS.MYPAGE.STATUS_LINK, {
        timeout: TIMEOUTS.ELEMENT,
      });

      const adModal = await this.page.$(".ab-iam-root");
      if (adModal) {
        await adModal.evaluate((node) => node.remove());
        Logger.info("광고 모달 제거됨");
      }

      const [popup] = await Promise.all([
        this.page.waitForEvent("popup", { timeout: TIMEOUTS.POPUP }),
        this.page.click(SELECTORS.MYPAGE.STATUS_LINK),
      ]);
      resumePopup = popup;

      if (!resumePopup) {
        throw new UpdateError("이력서 팝업창을 열 수 없습니다.");
      }

      await resumePopup.waitForLoadState();

      await resumePopup.waitForSelector(SELECTORS.MYPAGE.UPDATE_BUTTON, {
        timeout: TIMEOUTS.ELEMENT,
      });

      const dialogPromise = resumePopup.waitForEvent("dialog", {
        timeout: TIMEOUTS.ELEMENT,
      });

      await resumePopup.click(SELECTORS.MYPAGE.UPDATE_BUTTON);

      const dialog = await dialogPromise;

      const successMessage = "업데이트 되었습니다";
      if (dialog.message().includes(successMessage)) {
        Logger.info(`성공 다이얼로그 확인: "${dialog.message()}"`);
        await dialog.accept();
        Logger.success("경력 정보 업데이트 완료");
      } else {
        const errorMessage = `예상치 못한 다이얼로그 발생: ${dialog.message()}`;
        Logger.error(errorMessage);
        await dialog.dismiss();
        throw new UpdateError(errorMessage);
      }
    } catch (error) {
      const screenshotPath = `error-update-${Date.now()}.png`;
      try {
        const pageToScreenshot =
          resumePopup && !resumePopup.isClosed() ? resumePopup : this.page;
        await pageToScreenshot.screenshot({ path: screenshotPath, fullPage: true });
        Logger.error(`업데이트 실패. 스크린샷 저장: ${screenshotPath}`);
      } catch (screenshotError) {
        Logger.error("스크린샷 저장 실패", screenshotError as Error);
      }

      if (
        error instanceof UpdateError ||
        error instanceof NavigationError ||
        error instanceof AuthenticationError
      ) {
        throw error;
      }
      throw new UpdateError(
        `경력 정보 업���이트 실패: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
