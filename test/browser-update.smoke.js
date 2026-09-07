const assert = require("node:assert/strict");
const { JobKoreaService } = require("../src/services/jobkorea");
const { UpdateError } = require("../src/types");

const resumePages = {
  sync: '<button class="button-update" onclick="window.recordUpdate(); alert(\'이력서 수정일이 오늘날짜로 업데이트 되었습니다\')">Update</button>',
  async: '<button class="button-update" onclick="window.recordUpdate(); setTimeout(() => alert(\'이력서 수정일이 오늘날짜로 업데이트 되었습니다\'), 50)">Update</button>',
  unexpected: '<button class="button-update" onclick="window.recordUpdate(); alert(\'업데이트에 실패했습니다\')">Update</button>',
  missing: '<button class="button-update" onclick="window.recordUpdate()">Update</button>',
};

// Exercise the real service and Chromium without contacting JobKorea or Telegram.
exports.verifyBrowserUpdateFlow = async function (page) {
  const context = page.context();
  context.setDefaultTimeout(2000);
  let scenario = "sync";
  let updateClicks = 0;
  let dismissedLoginConfirm = false;
  await context.exposeBinding("recordUpdate", () => { updateClicks++; });
  await context.exposeBinding("recordLoginConfirm", (_, accepted) => {
    dismissedLoginConfirm = accepted === false;
  });
  await context.route("**/*", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/User/Mypage") {
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<div class="status"><a target="_blank" href="/User/Resume/View">Resume</a></div>',
      });
    }
    if (pathname === "/Login/Reminder") {
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<a href="#나중에 변경" onclick="event.preventDefault(); window.recordLoginConfirm(confirm(\'Change later?\'))">Later</a>',
      });
    }
    if (pathname !== "/User/Resume/View") return route.abort();

    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: resumePages[scenario],
    });
  });

  await page.goto("https://www.jobkorea.co.kr/User/Mypage");
  const service = new JobKoreaService(page);
  for (const current of ["sync", "async", "unexpected", "missing"]) {
    scenario = current;
    const before = updateClicks;
    if (current === "sync" || current === "async") {
      await service.updateCareerInfo();
    } else {
      await assert.rejects(service.updateCareerInfo(), error =>
        error instanceof UpdateError && error.retryable === false &&
        (current === "missing" || error.message.includes("업데이트에 실패했습니다"))
      );
    }
    assert.equal(updateClicks - before, 1, `${current}: never repeat the update click`);
    assert.deepEqual(context.pages(), [page], `${current}: close the resume popup`);
    console.log(`Browser update flow passed: ${current}`);
  }

  const popup = await context.newPage();
  await popup.goto("https://www.jobkorea.co.kr/Login/Reminder");
  await service.handleLoginPopup(popup);
  assert.equal(dismissedLoginConfirm, true, "dismiss the login dialog before click completes");
  assert.equal(popup.isClosed(), true);
  console.log("Browser login popup flow passed");
};
