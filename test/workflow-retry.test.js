const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const readWorkflow = name => fs.readFileSync(
  path.join(__dirname, "../.github/workflows", name), "utf8"
);
const mainWorkflow = readWorkflow("update_resume.yml");
const fallbackWorkflow = readWorkflow("auto_rerun_update_resume.yml");
const dispatchFunctions = [mainWorkflow, fallbackWorkflow].flatMap(source =>
  [...source.matchAll(/^( +)dispatch_retry\(\) \{\n.*?^\1\}/gms)]
    .map(match => match[0].split("\n").map(line => line.slice(match[1].length)).join("\n"))
);
assert.equal(dispatchFunctions.length, 3);

function stepScript(source, name) {
  const step = source.slice(source.indexOf(`      - name: ${name}\n`));
  const lines = step.slice(step.indexOf("        run: |\n") + "        run: |\n".length).split("\n");
  const result = [];
  for (const line of lines) {
    if (line.trim() && !line.startsWith("          ")) break;
    result.push(line.slice(10));
  }
  return result.join("\n");
}

function runShell(script, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jobkorea-retry-test-"));
  try {
    const callLog = path.join(directory, "calls");
    const output = path.join(directory, "output");
    const preamble = `
      set -euo pipefail
      timeout() { shift; "$@"; }
      sleep() { :; }
      gh() {
        printf '%s ' "$@" >> "$CALL_LOG"
        printf '\\n' >> "$CALL_LOG"
        case "$1 $2" in
          'run view')
            if [[ "$*" == *jobs,displayTitle* ]]; then
              printf '%s' "$RUN_METADATA"
            else
              printf '%s' "$CHAIN_CREATED_AT"
              return "$CREATED_EXIT_CODE"
            fi ;;
          'api --paginate')
            if [ "$LOOKUP_EXIT_CODE" != 0 ]; then return "$LOOKUP_EXIT_CODE"; fi
            if [ -f "$DISPATCH_MARKER" ]; then
              printf '%s' "$API_PAGES_AFTER_DISPATCH"
            else
              printf '%s' "$API_PAGES"
            fi ;;
          'workflow run')
            touch "$DISPATCH_MARKER"
            return "$DISPATCH_EXIT_CODE" ;;
          *) echo 'Unexpected mock gh command' >&2; return 90 ;;
        esac
      }
    `;
    const result = spawnSync("bash", ["-c", preamble + script], {
      encoding: "utf8", timeout: 5000,
      env: {
        PATH: process.env.PATH,
        CHAIN_ID: "123", NEXT_ATTEMPT: "2", RETRY_REF: "main", GH_REPO: "synthetic/repo",
        RUN_ID: "456", RUN_METADATA: "{}",
        CHAIN_CREATED_AT: "2026-09-07T00:00:00Z", CREATED_EXIT_CODE: "0",
        API_PAGES: '[{"workflow_runs":[]}]', API_PAGES_AFTER_DISPATCH: '[{"workflow_runs":[]}]',
        LOOKUP_EXIT_CODE: "0", DISPATCH_EXIT_CODE: "0",
        CALL_LOG: callLog, GITHUB_OUTPUT: output,
        DISPATCH_MARKER: path.join(directory, "dispatched"),
        ...overrides,
      },
    });
    assert.ifError(result.error);
    return {
      ...result,
      calls: fs.existsSync(callLog) ? fs.readFileSync(callLog, "utf8") : "",
      outputs: fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "",
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const pages = (chain = "123", attempt = 2, status = "completed", conclusion = "success") =>
  JSON.stringify([{ workflow_runs: [{ display_title: `Update Resume (attempt ${attempt}, chain ${chain})`, status, conclusion }] }]);
const dispatchCount = result => (result.calls.match(/^workflow run /gm) || []).length;

for (const [index, body] of dispatchFunctions.entries()) {
  const script = body + "\ndispatch_retry\n";
  test(`dispatch path ${index + 1}: recognizes queued and completed runs in the same chain`, () => {
    for (const [status, conclusion] of [["queued", null], ["completed", "success"], ["completed", "failure"]]) {
      const result = runShell(script, { API_PAGES: pages("123", 2, status, conclusion) });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(dispatchCount(result), 0);
    }
  });

  test(`dispatch path ${index + 1}: isolates other chains and attempts and forwards identity`, () => {
    for (const fixture of [pages("999"), pages("123", 3)]) {
      const result = runShell(script, { API_PAGES: fixture });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(dispatchCount(result), 1);
      assert.match(result.calls, /-f attempt=2 -f chain_id=123/);
      assert.match(result.calls, /--paginate --slurp --method GET/);
      assert.match(result.calls, /-f created=>=2026-09-07T00:00:00Z/);
    }
  });

  test(`dispatch path ${index + 1}: finds a completed retry on a later API page`, () => {
    const result = runShell(script, { API_PAGES: JSON.stringify([
      { workflow_runs: [] }, ...JSON.parse(pages()),
    ]) });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(dispatchCount(result), 0);
  });

  test(`dispatch path ${index + 1}: an accepted but errored dispatch is not repeated after completion`, () => {
    const result = runShell(script, { DISPATCH_EXIT_CODE: "1", API_PAGES_AFTER_DISPATCH: pages() });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(dispatchCount(result), 1);
  });

  test(`dispatch path ${index + 1}: unverifiable state never dispatches`, () => {
    for (const overrides of [
      { LOOKUP_EXIT_CODE: "1" }, { CREATED_EXIT_CODE: "1" },
      { CHAIN_CREATED_AT: "invalid" }, { CHAIN_ID: "invalid" },
      { API_PAGES: "invalid json" }, { API_PAGES: '[{"message":"error"}]' },
      { NEXT_ATTEMPT: "5" },
    ]) {
      const result = runShell(script, overrides);
      assert.notEqual(result.status, 0);
      assert.equal(dispatchCount(result), 0);
    }
  });
}

const recoveryScript = stepScript(fallbackWorkflow, "Check retry dispatch failure");
const metadata = (title, job = "retry-update-resume-2", step = "Dispatch retry after update failure") => JSON.stringify({
  displayTitle: title,
  jobs: [{ name: job, steps: [{ name: step, conclusion: "failure" }] }],
});

test("fallback carries the original chain through later attempts", () => {
  const result = runShell(recoveryScript, { RUN_METADATA: metadata("Update Resume (attempt 2, chain 123)") });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.outputs, /chain_id=123/);
  assert.match(result.outputs, /source_attempt=2/);
  assert.match(result.outputs, /should_dispatch=true/);
});

test("fallback refuses a recoverable legacy run without an identifiable chain", () => {
  const result = runShell(recoveryScript, { RUN_METADATA: metadata("Update Resume (attempt 2)") });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.outputs, /should_dispatch=true/);
});

test("fallback skips terminal and unrelated failures", () => {
  for (const [job, step] of [["retry-update-resume-4", "Dispatch retry after update failure"], ["update-resume", "Run update script"]]) {
    const result = runShell(recoveryScript, { RUN_METADATA: metadata("Update Resume (attempt 4, chain 123)", job, step) });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.outputs, /should_dispatch=false/);
  }
});
