import { writeFile } from "fs/promises";
import { Page } from "playwright";
import { configManager } from "../config";
import { Logger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import { AuthenticationError, NavigationError, UpdateError } from "../types";

export class JobKoreaService {
  private readonly urls = configManager.getUrls();
  private readonly selectors = configManager.getSelectors();
  private readonly timeouts = configManager.getTimeouts();
  private readonly retryConfig = configManager.getRetryConfig();

  constructor(private readonly page: Page) {}

  private async waitForAnySelector(
    selectors: readonly string[],
    options: {
      state?: "visible" | "attached" | "detached" | "hidden";
      timeout?: number;
    } = {}
  ): Promise<string> {
    const { state = "visible" } = options;
    const timeout = options.timeout || this.timeouts.element;

    if (state === "visible") {
      await this.page.waitForSelector(selectors.join(", "), {
        state,
        timeout,
      });

      for (const selector of selectors) {
        if (await this.page.locator(selector).first().isVisible()) {
          Logger.info(`셀렉터 성공: ${selector}`);
          return selector;
        }
      }

      throw new Error(`표시된 셀렉터를 찾지 못했습니다: ${selectors.join(", ")}`);
    }

    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, {
          state,
          timeout: Math.floor(timeout / selectors.length),
        });
        Logger.info(`셀렉터 성공: ${selector}`);
        return selector;
      } catch {
        Logger.warning(`셀렉터 실패: ${selector}, 다음 셀렉터 시도 중...`);
      }
    }

    throw new Error(`모든 셀렉터 실패: ${selectors.join(", ")}`);
  }

  async navigateToLoginPage(): Promise<void> {
    await withRetry(
      async () => {
        const response = await this.page.goto(this.urls.login, {
          waitUntil: "commit",
          timeout: this.timeouts.navigation,
        });

        Logger.info(
          "로그인 페이지 최초 응답 수신",
          {
            requestedUrl: this.urls.login,
            currentUrl: this.page.url(),
            responseUrl: response?.url() ?? null,
            status: response?.status() ?? null,
            ok: response?.ok() ?? null,
          },
          "navigation"
        );

        try {
          await this.page.waitForLoadState("domcontentloaded", {
            timeout: Math.floor(this.timeouts.navigation / 2),
          });
        } catch (error) {
          Logger.warning(
            "DOMContentLoaded 대기 시간 초과. 셀렉터 기준으로 계속 진행합니다.",
            {
              currentUrl: this.page.url(),
              reason: error instanceof Error ? error.message : String(error),
            },
            "navigation"
          );
        }

        await this.waitForAnySelector(this.selectors.login.idInput, {
          state: "visible",
          timeout: this.timeouts.navigation,
        });

        Logger.success(
          "로그인 페이지로 성공적으로 이동 및 확인 완료",
          { currentUrl: this.page.url() },
          "navigation"
        );
      },
      {
        maxRetries: this.retryConfig.maxOperationRetries,
        operation: "로그인 페이지 이동",
      }
    ).catch(async (originalError: Error) => {
      const timestamp = Date.now();
      const screenshotPath = `error-navigate-${timestamp}.png`;
      const htmlPath = `error-navigate-${timestamp}.html`;

      const results = await Promise.allSettled([
        this.page.screenshot({ path: screenshotPath, fullPage: true }),
        this.page.content().then((html) => writeFile(htmlPath, html, "utf-8")),
      ]);

      for (const [i, result] of results.entries()) {
        const label = i === 0 ? "스크린샷" : "HTML";
        const path = i === 0 ? screenshotPath : htmlPath;
        if (result.status === "fulfilled") {
          Logger.error(`로그인 페이지 이동 실패. ${label} 저장: ${path}`);
        } else {
          Logger.warning(`${label} 저장 실패: ${result.reason}`);
        }
      }

      throw new NavigationError(
        `로그인 페이지로 이동하는데 실패했습니다. (${this.retryConfig.maxOperationRetries}번 재시도): ${originalError.message}`,
        {
          requestedUrl: this.urls.login,
          currentUrl: this.page.url(),
        }
      );
    });
  }

  async login(id: string, password: string): Promise<void> {
    await withRetry(
      async () => {
        const idSelector = await this.waitForAnySelector(this.selectors.login.idInput, {
          state: "visible",
        });
        await this.page.fill(idSelector, id);

        const passwordSelector = await this.waitForAnySelector(this.selectors.login.passwordInput, {
          state: "visible",
        });
        await this.page.fill(passwordSelector, password);

        const loginButtonSelector = await this.waitForAnySelector(this.selectors.login.loginButton, {
          state: "visible",
        });

        await this.page.click(loginButtonSelector);

        // 로그인 페이지에서 벗어났는지 URL 검증으로 성공 판정
        await this.page.waitForURL(url => !url.pathname.includes("/Login/"), {
          timeout: this.timeouts.navigation,
        });

        Logger.success("로그인 성공 및 페이지 전환 확인 완료");
      },
      {
        maxRetries: this.retryConfig.maxOperationRetries,
        operation: "로그인",
      }
    ).catch(async (originalError: Error) => {
      const screenshotPath = `error-login-${Date.now()}.png`;

      const [screenshotResult] = await Promise.allSettled([
        this.page.screenshot({ path: screenshotPath, fullPage: true }),
      ]);

      if (screenshotResult.status === "fulfilled") {
        Logger.error(`로그인 실패. 스크린샷 저장: ${screenshotPath}`);
      } else {
        Logger.error(`로그인 실패. 스크린샷 저장 실패: ${screenshotResult.reason}`);
      }

      throw new AuthenticationError(`로그인 실패: ${originalError.message}`);
    });
  }

  async handleLoginPopup(): Promise<void> {
    try {
      Logger.info("로그인 팝업 처리 중...");
      const [popup] = await Promise.all([
        this.page.waitForEvent("popup", { timeout: this.timeouts.popup }),
      ]);

      if (popup) {
        await popup.waitForSelector('a[href*="나중에 변경"]', {
          timeout: this.timeouts.element,
        });
        const [dialog] = await Promise.all([
          popup.waitForEvent("dialog", { timeout: this.timeouts.popup }),
          popup.click('a[href*="나중에 변경"]'),
        ]);
        await dialog.dismiss();
        Logger.success("팝업 처리 완료");
      }
    } catch {
      Logger.warning("팝업이 나타나지 않았거나 처리할 수 없습니다.");
    }
  }

  async navigateToMypage(): Promise<void> {
    await withRetry(
      async () => {
        await this.page.goto(this.urls.mypage, {
          waitUntil: "networkidle",
          timeout: this.timeouts.navigation,
        });
        Logger.success("마이페이지로 이동 완료");
      },
      {
        maxRetries: this.retryConfig.maxOperationRetries,
        operation: "마이페이지 이동",
      }
    ).catch(() => {
      throw new NavigationError("마이페이지 이동 실패");
    });
  }

  async updateCareerInfo(): Promise<void> {
    await withRetry(
      async () => {
        let resumePopup: Page | null = null;
        try {
          const statusLinkSelector = await this.waitForAnySelector(this.selectors.mypage.statusLink, {
            timeout: this.timeouts.element,
          });

          const adModal = await this.page.$(".ab-iam-root");
          if (adModal) {
            await adModal.evaluate((node) => node.remove());
            Logger.info("광고 모달 제거됨");
          }

          const [popup] = await Promise.all([
            this.page.waitForEvent("popup", { timeout: this.timeouts.popup }),
            this.page.click(statusLinkSelector),
          ]);
          resumePopup = popup;

          if (!resumePopup) {
            throw new UpdateError("이력서 팝업창을 열 수 없습니다.");
          }

          await resumePopup.waitForLoadState();

          const updateButtonSelector = await resumePopup.evaluate(
            (selectors) => {
              for (const selector of selectors) {
                try {
                  const element = document.querySelector(selector);
                  if (element) {
                    console.log(`업데이트 버튼 셀렉터 성공: ${selector}`);
                    return selector;
                  }
                } catch {
                  console.log(`업데이트 버튼 셀렉터 실패: ${selector}`);
                  continue;
                }
              }
              throw new Error(`모든 업데이트 버튼 셀렉터 실패: ${selectors.join(", ")}`);
            },
            [...this.selectors.mypage.updateButton]
          );

          const dialogPromise = resumePopup.waitForEvent("dialog", {
            timeout: this.timeouts.element,
          });

          await resumePopup.click(updateButtonSelector);

          const dialog = await dialogPromise;

          const successPatterns = configManager.getUpdateConfig().successPatterns;
          const dialogMessage = dialog.message();
          const isSuccess = successPatterns.some(pattern => dialogMessage.includes(pattern));

          if (isSuccess) {
            Logger.info(`성공 다이얼로그 확인: "${dialogMessage}"`);
            await dialog.accept();
            Logger.success("경력 정보 업데이트 완료");
          } else {
            const errorMessage = `예상치 못한 다이얼로그 발생: ${dialogMessage}`;
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
            `경력 정보 업데이트 실패: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      },
      {
        maxRetries: this.retryConfig.maxOperationRetries,
        operation: "경력 정보 업데이트",
      }
    );
  }
}
