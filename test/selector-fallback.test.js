const test = require("node:test");
const assert = require("node:assert/strict");

process.env.LOG_LEVEL = "error";
require("ts-node/register");

const { JobKoreaService } = require("../src/services/jobkorea");

test("selector fallback targets visible matches instead of a hidden first node", async () => {
  let waitedSelector = "";
  const page = {
    waitForSelector: async selector => {
      waitedSelector = selector;
    },
    locator: selector => ({
      first: () => ({ isVisible: async () => selector.includes(":visible") }),
    }),
  };
  const service = new JobKoreaService(page);

  const selected = await service.waitForAnySelector([".primary", ".fallback"]);

  assert.equal(selected, ".primary:visible");
  assert.equal(waitedSelector, ".primary:visible, .fallback:visible");
});

test("clickable fallback skips disabled visible matches", async () => {
  const disabled = { isEnabled: async () => false };
  const enabled = { isEnabled: async () => true };
  const page = {
    locator: () => ({
      count: async () => 2,
      nth: index => (index === 0 ? disabled : enabled),
    }),
    waitForTimeout: async () => undefined,
  };
  const service = new JobKoreaService(page);

  const selected = await service.waitForClickableLocator(page, ["button"], 100);

  assert.equal(selected, enabled);
});
