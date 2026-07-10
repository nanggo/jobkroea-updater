const test = require("node:test");
const assert = require("node:assert/strict");

process.env.LOG_LEVEL = "error";
process.env.ELEMENT_TIMEOUT_MS = "20";
process.env.NAVIGATION_TIMEOUT_MS = "20";
process.env.MAX_OPERATION_RETRIES = "1";
require("ts-node/register");

const { JobKoreaService } = require("../src/services/jobkorea");
const { AuthenticationError, NavigationError } = require("../src/types");
const {
  isCredentialEgressGuardArmed,
  recordBlockedTopLevelNavigation,
} = require("../src/utils/trustedNavigation");

function locatorCollection(items) {
  return {
    async count() {
      return items.length;
    },
    nth(index) {
      return items[index];
    },
    first() {
      return items[0];
    },
  };
}

function createLoginForm({
  action = "https://www.jobkorea.co.kr/Login/Login_Tot.asp",
  method = "post",
  target = "",
  buttonFormAction,
  buttonFormMethod,
  buttonFormTarget,
  ownerMismatch = false,
  detachedControl = false,
  onFill = () => undefined,
  onTrial = () => undefined,
  onClick = () => undefined,
} = {}) {
  const formElement = { action, method, target };
  const differentForm = { action, method, target };
  const createControl = (element, behavior) => ({
    async isEnabled() {
      return true;
    },
    async evaluate(callback) {
      return callback(element);
    },
    async elementHandle() {
      if (detachedControl && element === idElement) return null;
      return {
        element,
        async dispose() {},
      };
    },
    ...behavior,
  });
  const idElement = {
    form: ownerMismatch ? differentForm : formElement,
    type: "text",
  };
  const passwordElement = { form: formElement, type: "password" };
  const buttonAttributes = new Set();
  if (buttonFormAction !== undefined) buttonAttributes.add("formaction");
  if (buttonFormMethod !== undefined) buttonAttributes.add("formmethod");
  if (buttonFormTarget !== undefined) buttonAttributes.add("formtarget");
  const loginButtonElement = {
    form: formElement,
    formAction: buttonFormAction ?? action,
    formMethod: buttonFormMethod ?? method,
    formTarget: buttonFormTarget ?? target,
    hasAttribute(name) {
      return buttonAttributes.has(name);
    },
  };
  const idInput = createControl(idElement, {
    async fill(value) {
      onFill("id", value);
    },
  });
  const passwordInput = createControl(passwordElement, {
    async fill(value) {
      onFill("password", value);
    },
  });
  const loginButton = createControl(loginButtonElement, {
    async click(options) {
      if (options?.trial) {
        onTrial();
      } else {
        onClick();
      }
    },
  });

  return {
    async evaluate(callback, argument) {
      return callback(formElement, argument?.element ?? argument);
    },
    locator(selector) {
      if (selector.includes("input-id")) return locatorCollection([idInput]);
      if (selector.includes("input-password")) {
        return locatorCollection([passwordInput]);
      }
      if (selector.includes("login-button")) {
        return locatorCollection([loginButton]);
      }
      return locatorCollection([]);
    },
  };
}

function createPage(form, overrides = {}) {
  const browserContext = {};
  return {
    context: () => browserContext,
    url: () => "https://www.jobkorea.co.kr/Login/Login_Tot.asp",
    locator: selector =>
      selector === "form:visible"
        ? locatorCollection([form])
        : locatorCollection([]),
    waitForEvent: async () => null,
    waitForURL: async () => undefined,
    waitForTimeout: async () => undefined,
    ...overrides,
  };
}

test("submits credentials once and registers popup/navigation waits before click", async () => {
  const sequence = [];
  const fills = [];
  let clickCount = 0;
  const form = createLoginForm({
    onFill: (field, value) => fills.push([field, value]),
    onClick: () => {
      sequence.push("click");
      clickCount += 1;
    },
  });
  const page = createPage(form, {
    waitForEvent: async () => {
      sequence.push("popup-wait");
      throw new Error("no popup");
    },
    waitForURL: async predicate => {
      sequence.push("navigation-wait");
      assert.equal(
        predicate(new URL("https://www.jobkorea.co.kr/Login")),
        false
      );
      throw new Error("login result unavailable");
    },
  });

  const service = new JobKoreaService(page);

  await assert.rejects(
    service.login("user-id", "wrong-password"),
    error => error instanceof AuthenticationError && error.retryable === false
  );

  assert.deepEqual(fills, [
    ["id", "user-id"],
    ["password", "wrong-password"],
  ]);
  assert.equal(clickCount, 1);
  assert.ok(sequence.indexOf("popup-wait") < sequence.indexOf("click"));
  assert.ok(sequence.indexOf("navigation-wait") < sequence.indexOf("click"));
  assert.equal(isCredentialEgressGuardArmed(page.context()), true);
});

test("does not fill credentials after a cross-origin navigation race", async () => {
  let urlChecks = 0;
  let fills = 0;
  let clicks = 0;
  const form = createLoginForm({
    onFill: () => {
      fills += 1;
    },
    onClick: () => {
      clicks += 1;
    },
  });
  const page = createPage(form, {
    url: () => {
      urlChecks += 1;
      return urlChecks < 2
        ? "https://www.jobkorea.co.kr/Login/Login_Tot.asp"
        : "https://attacker.example/login";
    },
  });

  const service = new JobKoreaService(page);

  await assert.rejects(
    service.login("user-id", "password"),
    error => error instanceof AuthenticationError && error.retryable === false
  );

  assert.equal(fills, 0);
  assert.equal(clicks, 0);
});

test("a delayed blocked-navigation event stops credential preparation", async () => {
  const fills = [];
  let clicks = 0;
  let page;
  const form = createLoginForm({
    onFill: field => {
      fills.push(field);
      if (field === "id") {
        recordBlockedTopLevelNavigation(
          page,
          "https://attacker.example/delayed-redirect"
        );
      }
    },
    onClick: () => {
      clicks += 1;
    },
  });
  page = createPage(form);
  const service = new JobKoreaService(page);

  await assert.rejects(
    service.login("user-id", "password"),
    error => error instanceof AuthenticationError && error.retryable === false
  );

  assert.deepEqual(fills, ["id"]);
  assert.equal(clicks, 0);
  assert.equal(isCredentialEgressGuardArmed(page.context()), true);
});

test("never mixes credential fields and submit buttons across forms", async () => {
  let decoyFills = 0;
  let validFills = 0;
  let validClicks = 0;
  const decoyForm = {
    async getAttribute() {
      return "/search";
    },
    locator(selector) {
      if (selector.includes("input-id")) {
        return locatorCollection([
          {
            async isEnabled() {
              return true;
            },
            async fill() {
              decoyFills += 1;
            },
          },
        ]);
      }
      return locatorCollection([]);
    },
  };
  const validForm = createLoginForm({
    onFill: () => {
      validFills += 1;
    },
    onClick: () => {
      validClicks += 1;
    },
  });
  const page = createPage(validForm, {
    locator: selector =>
      selector === "form:visible"
        ? locatorCollection([decoyForm, validForm])
        : locatorCollection([]),
  });

  const service = new JobKoreaService(page);
  await service.login("user-id", "password");

  assert.equal(decoyFills, 0);
  assert.equal(validFills, 2);
  assert.equal(validClicks, 1);
  assert.equal(isCredentialEgressGuardArmed(page.context()), false);
});

test("rejects a login form that submits outside the trusted login path", async () => {
  let fills = 0;
  let clicks = 0;
  const form = createLoginForm({
    action: "https://attacker.example/collect",
    onFill: () => {
      fills += 1;
    },
    onClick: () => {
      clicks += 1;
    },
  });
  const service = new JobKoreaService(createPage(form));

  await assert.rejects(
    service.login("user-id", "password"),
    error => error instanceof AuthenticationError && error.retryable === false
  );

  assert.equal(fills, 0);
  assert.equal(clicks, 0);
});

test("rejects submitter action, method, target, and form-owner overrides", async () => {
  const unsafeForms = [
    createLoginForm({
      buttonFormAction: "https://attacker.example/collect",
      buttonFormTarget: "credential-frame",
    }),
    createLoginForm({ buttonFormMethod: "get" }),
    createLoginForm({ buttonFormTarget: "_blank" }),
    createLoginForm({ ownerMismatch: true }),
  ];

  for (const form of unsafeForms) {
    const service = new JobKoreaService(createPage(form));
    await assert.rejects(
      service.login("user-id", "password"),
      error => error instanceof AuthenticationError && error.retryable === false
    );
  }
});

test("keeps pre-submit readiness failures retryable", async () => {
  const serviceWithoutForm = new JobKoreaService(
    createPage(null, {
      locator: () => locatorCollection([]),
    })
  );
  await assert.rejects(
    serviceWithoutForm.login("user-id", "password"),
    error => error instanceof NavigationError && error.retryable === true
  );

  const serviceWithTrialFailure = new JobKoreaService(
    createPage(
      createLoginForm({
        onTrial: () => {
          throw new Error("button detached before submit");
        },
      })
    )
  );
  await assert.rejects(
    serviceWithTrialFailure.login("user-id", "password"),
    error => error instanceof NavigationError && error.retryable === true
  );

  const serviceWithDetachedControl = new JobKoreaService(
    createPage(createLoginForm({ detachedControl: true }))
  );
  await assert.rejects(
    serviceWithDetachedControl.login("user-id", "password"),
    error => error instanceof NavigationError && error.retryable === true
  );
});
