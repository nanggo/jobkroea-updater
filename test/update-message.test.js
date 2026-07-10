const test = require("node:test");
const assert = require("node:assert/strict");

require("ts-node/register");

const { configManager } = require("../src/config");
const { Logger } = require("../src/utils/logger");
const {
  sanitizeNotificationErrorDetail,
} = require("../src/updateResume");

test("update success patterns accept the observed resume dialog but not generic edits", () => {
  const patterns = configManager.getUpdateConfig().successPatterns;
  const observedMessage =
    "이력서 수정일이 오늘날짜로 업데이트 되었습니다. 최신 이력서로 입사지원 하세요";

  assert.equal(
    patterns.some(pattern => observedMessage.includes(pattern)),
    true
  );
  assert.equal(
    patterns.some(pattern => "프로필이 수정되었습니다".includes(pattern)),
    false
  );
});

test("notification errors redact secrets and stay below Telegram's limit", () => {
  const secret = "notification-password";
  Logger.registerSensitiveValues([secret]);
  const detail = sanitizeNotificationErrorDetail(
    `locator.fill: ${secret} https://evil.example/${encodeURIComponent(secret)}?token=abc ${"<&".repeat(5000)}`
  );

  assert.equal(detail.length <= 2800, true);
  assert.doesNotMatch(detail, /notification-password|token=abc|evil\.example\/notification/);
  assert.match(detail, /\[생략됨\]$/);
  assert.doesNotMatch(detail, /<(?!\/)|&(?!amp;|lt;|gt;)/);
});
