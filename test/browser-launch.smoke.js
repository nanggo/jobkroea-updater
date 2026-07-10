process.env.BROWSER_HEADLESS = "true";
process.env.LOG_LEVEL = "error";

require("ts-node/register");

const { BrowserService } = require("../src/services/browser");

async function main() {
  const browserService = new BrowserService();
  try {
    await browserService.initialize();
  } finally {
    await browserService.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
