import { Browser, chromium, Page, BrowserContext } from "playwright";
import { Logger } from "../utils/logger";
import { configManager } from "../config";

export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(): Promise<void> {
    try {
      const browserConfig = configManager.getBrowserConfig();
      
      // 설정 기반 브라우저 옵션
      this.browser = await chromium.launch({
        headless: browserConfig.headless,
        args: [...browserConfig.args],
      });

      // 설정 기반 컨텍스트 설정
      this.context = await this.browser.newContext({
        viewport: { 
          width: browserConfig.viewport.width, 
          height: browserConfig.viewport.height 
        },
        // 불필요한 리소스 차단으로 성능 향상
        ignoreHTTPSErrors: true,
        // 이미지, 폰트, 스타일시트만 로드하고 기타 리소스는 차단
        // 하지만 JobKorea 사이트의 기능에 필요한 것들은 유지
        javaScriptEnabled: true,
        // 메모리 사용량 감소를 위한 설정
        extraHTTPHeaders: {
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      });

      // 설정 기반 리소스 차단
      if (browserConfig.blockResources.ads || browserConfig.blockResources.analytics || 
          browserConfig.blockResources.socialMedia || browserConfig.blockResources.unnecessaryImages) {
        await this.context.route('**/*', (route) => {
          const resourceType = route.request().resourceType();
          const url = route.request().url();
          
          let shouldBlock = false;
          
          // 광고 차단
          if (browserConfig.blockResources.ads && 
              (url.includes('ads') || url.includes('doubleclick'))) {
            shouldBlock = true;
          }
          
          // 분석 도구 차단
          if (browserConfig.blockResources.analytics && 
              (url.includes('google-analytics') || url.includes('googletagmanager'))) {
            shouldBlock = true;
          }
          
          // 소셜 미디어 차단
          if (browserConfig.blockResources.socialMedia &&
              (url.includes('facebook.com') || url.includes('twitter.com') || url.includes('instagram.com'))) {
            shouldBlock = true;
          }
          
          // 불필요한 이미지 차단
          if (browserConfig.blockResources.unnecessaryImages &&
              (resourceType === 'media' || (resourceType === 'image' && !url.includes('jobkorea')))) {
            shouldBlock = true;
          }
          
          if (shouldBlock) {
            route.abort();
          } else {
            route.continue();
          }
        });
      }

      this.page = await this.context.newPage();
      
      // 페이지 레벨 최적화
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      });

      Logger.info("브라우저 초기화 완료 (최적화 적용)");
    } catch (error) {
      Logger.error("브라우저 초기화 실패", error as Error);
      throw error;
    }
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error("브라우저가 초기화되지 않았습니다.");
    }
    return this.page;
  }

  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      Logger.info("브라우저 종료 완료 (리소스 정리됨)");
    } catch (error) {
      Logger.error("브라우저 종료 중 오류 발생", error as Error);
      // 강제로 null 처리하여 메모리 누수 방지
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }
}
