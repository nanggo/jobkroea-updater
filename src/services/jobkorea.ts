import { Page } from "playwright";
import { URLS, SELECTORS, TIMEOUTS, RETRY_CONFIG } from "../constants";
import { Logger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import { AuthenticationError, NavigationError, UpdateError } from "../types";
import { AdaptiveTimeoutManager, withTimeoutMeasurement } from "../utils/adaptiveTimeout";

export class JobKoreaService {
  constructor(private readonly page: Page) {}

  private async waitForAnySelector(selectors: readonly string[], options: { state?: "visible" | "attached" | "detached" | "hidden"; timeout?: number } = {}): Promise<string> {
    const { state = "visible" } = options;
    const timeoutManager = AdaptiveTimeoutManager.getInstance();
    const adaptiveTimeout = options.timeout || timeoutManager.getAdaptiveTimeout('element');
    
    return await withTimeoutMeasurement(
      async () => {
        for (const selector of selectors) {
          try {
            await this.page.waitForSelector(selector, { 
              state, 
              timeout: Math.floor(adaptiveTimeout / selectors.length) 
            });
            Logger.info(`셀렉터 성공: ${selector}`);
            return selector;
          } catch (error) {
            Logger.warning(`셀렉터 실패: ${selector}, 다음 셀렉터 시도 중...`);
          }
        }
        
        throw new Error(`모든 셀렉터 실패: ${selectors.join(", ")}`);
      },
      'element',
      adaptiveTimeout
    );
  }

  async navigateToLoginPage(): Promise<void> {
    const timeoutManager = AdaptiveTimeoutManager.getInstance();
    
    await withRetry(
      async () => {
        await withTimeoutMeasurement(
          async () => {
            await this.page.goto(URLS.LOGIN, {
              waitUntil: "domcontentloaded",
              timeout: timeoutManager.getAdaptiveTimeout('navigation'),
            });

            await this.waitForAnySelector(SELECTORS.LOGIN.ID_INPUT, {
              state: "visible",
            });

            Logger.success("로그인 페이지로 성공적으로 이동 및 확인 완료");
          },
          'navigation'
        );
      },
      {
        maxRetries: RETRY_CONFIG.MAX_OPERATION_RETRIES,
        operation: "로그인 페이지 이동",
      }
    ).catch((error) => {
      throw new NavigationError(
        `로그인 페이지로 이동하는데 실패했습니다. (${RETRY_CONFIG.MAX_OPERATION_RETRIES}번 재시도)`
      );
    });
  }

  async login(id: string, password: string): Promise<void> {
    const timeoutManager = AdaptiveTimeoutManager.getInstance();
    
    await withRetry(
      async () => {
        const idSelector = await this.waitForAnySelector(SELECTORS.LOGIN.ID_INPUT, {
          state: "visible",
        });
        await this.page.fill(idSelector, id);

        const passwordSelector = await this.waitForAnySelector(SELECTORS.LOGIN.PASSWORD_INPUT, {
          state: "visible",
        });
        await this.page.fill(passwordSelector, password);

        const loginButtonSelector = await this.waitForAnySelector(SELECTORS.LOGIN.LOGIN_BUTTON, {
          state: "visible",
        });

        await Promise.all([
          withTimeoutMeasurement(
            () => this.page.waitForNavigation({
              waitUntil: "networkidle",
              timeout: timeoutManager.getAdaptiveTimeout('navigation'),
            }),
            'navigation'
          ),
          this.page.click(loginButtonSelector),
        ]);

        await this.waitForAnySelector(SELECTORS.MYPAGE.STATUS_LINK, {
          state: "visible",
        });

        Logger.success("로그인 성공 및 페이지 전환 확인 완료");
      },
      {
        maxRetries: RETRY_CONFIG.MAX_OPERATION_RETRIES,
        operation: "로그인",
      }
    ).catch(async (error) => {
      const screenshotPath = `error-login-${Date.now()}.png`;
      
      // 스크린샷 촬영과 로깅을 병렬로 처리
      const [screenshotResult] = await Promise.allSettled([
        this.page.screenshot({ path: screenshotPath, fullPage: true }),
      ]);
      
      if (screenshotResult.status === 'fulfilled') {
        Logger.error(`로그인 실패. 스크린샷 저장: ${screenshotPath}`);
      } else {
        Logger.error(`로그인 실패. 스크린샷 저장 실패: ${screenshotResult.reason}`);
      }

      throw new AuthenticationError("로그인 실패");
    });
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
    await withRetry(
      async () => {
        await this.page.goto(URLS.MYPAGE, { waitUntil: "networkidle" });
        Logger.success("마이페이지로 이동 완료");
      },
      {
        maxRetries: RETRY_CONFIG.MAX_OPERATION_RETRIES,
        operation: "마이페이지 이동",
      }
    ).catch((error) => {
      throw new NavigationError("마이페이지 이동 실패");
    });
  }

  async updateCareerInfo(): Promise<void> {
    await withRetry(
      async () => {
        let resumePopup: Page | null = null;
        try {
          const statusLinkSelector = await this.waitForAnySelector(SELECTORS.MYPAGE.STATUS_LINK, {
            timeout: TIMEOUTS.ELEMENT,
          });

          const adModal = await this.page.$(".ab-iam-root");
          if (adModal) {
            await adModal.evaluate((node) => node.remove());
            Logger.info("광고 모달 제거됨");
          }

          const [popup] = await Promise.all([
            this.page.waitForEvent("popup", { timeout: TIMEOUTS.POPUP }),
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
                } catch (error) {
                  console.log(`업데이트 버튼 셀렉터 실패: ${selector}`);
                  continue;
                }
              }
              throw new Error(`모든 업데이트 버튼 셀렉터 실패: ${selectors.join(", ")}`);
            },
            SELECTORS.MYPAGE.UPDATE_BUTTON
          );

          const dialogPromise = resumePopup.waitForEvent("dialog", {
            timeout: TIMEOUTS.ELEMENT,
          });

          await resumePopup.click(updateButtonSelector);

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
          
          // 스크린샷 촬영을 비동기로 처리 (에러 전파 차단)
          Promise.resolve().then(async () => {
            try {
              const pageToScreenshot =
                resumePopup && !resumePopup.isClosed() ? resumePopup : this.page;
              await pageToScreenshot.screenshot({ path: screenshotPath, fullPage: true });
              Logger.error(`업데이트 실패. 스크린샷 저장: ${screenshotPath}`);
            } catch (screenshotError) {
              Logger.error("스크린샷 저장 실패", screenshotError as Error);
            }
          });

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
        maxRetries: RETRY_CONFIG.MAX_OPERATION_RETRIES,
        operation: "경력 정보 업데이트",
      }
    }
  }
}