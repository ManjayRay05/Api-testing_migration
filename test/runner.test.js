/**
 * Test Validation Suite for API Migration Regression Framework
 * Validates url-resolver, response-comparator, request-client,
 * and end-to-end regression runner execution against Mock Server.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolvePath, buildFullUrl, MissingPathParameterError } = require("../src/url-resolver");
const { compareResponses } = require("../src/response-comparator");
const { redactSensitiveData, buildHeaders } = require("../src/request-client");
const { startMockServers } = require("../src/mock-server");
const { runTests } = require("../src/run-tests");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

async function runAllTests() {
  console.log("\n=======================================================");
  console.log("   AUTOMATED UNIT & INTEGRATION REGRESSION TEST SUITE  ");
  console.log("=======================================================\n");

  // 1. URL Resolver Tests
  console.log("▶ 1. URL Resolver Module Tests:");
  it("Resolves single path parameter correctly", () => {
    const res = resolvePath("/api/v1/favorites/:marketwatch_id", { marketwatch_id: "5" });
    assert.strictEqual(res, "/api/v1/favorites/5");
  });

  it("Resolves multiple path parameters with URL encoding", () => {
    const res = resolvePath("/api/v1/ticker/:exchange/:segment/:token", {
      exchange: "NSE",
      segment: "CM & FO",
      token: "26000"
    });
    assert.strictEqual(res, "/api/v1/ticker/NSE/CM%20%26%20FO/26000");
  });

  it("Throws MissingPathParameterError if required param is missing", () => {
    assert.throws(
      () => resolvePath("/api/v1/favorites/:marketwatch_id", {}),
      MissingPathParameterError
    );
  });

  it("Builds full URL cleanly without duplicate slashes", () => {
    const full = buildFullUrl("https://api.velora.plus/", "/api/v1/account", {}, { ref: "123" });
    assert.strictEqual(full, "https://api.velora.plus/api/v1/account?ref=123");
  });

  // 2. Sensitive Data Redaction Tests
  console.log("\n▶ 2. Security & Redaction Tests:");
  it("Redacts sensitive fields in headers and payloads", () => {
    const payload = {
      client_id: "S117027",
      password: "SuperSecretPassword",
      pin: "123456",
      token: "jwt.token.here",
      nested: {
        authorization: "Bearer secret-token",
        safeField: "safeValue"
      }
    };
    const sanitized = redactSensitiveData(payload);
    assert.strictEqual(sanitized.password, "[REDACTED]");
    assert.strictEqual(sanitized.pin, "[REDACTED]");
    assert.strictEqual(sanitized.token, "[REDACTED]");
    assert.strictEqual(sanitized.nested.authorization, "[REDACTED]");
    assert.strictEqual(sanitized.nested.safeField, "safeValue");
    assert.strictEqual(sanitized.client_id, "S117027");
  });

  it("Builds Bearer headers properly", () => {
    const headers = buildHeaders("test_token_123", { "X-Custom": "val" });
    assert.strictEqual(headers.Authorization, "Bearer test_token_123");
    assert.strictEqual(headers["X-Custom"], "val");
  });

  // 3. Response Comparator Tests
  console.log("\n▶ 3. Response Comparator Tests:");
  it("Passes when old and new responses match exactly", () => {
    const oldRes = { status: 200, body: { success: true, count: 5 } };
    const newRes = { status: 200, body: { count: 5, success: true } }; // different key order
    const comp = compareResponses(oldRes, newRes);
    assert.strictEqual(comp.pass, true);
    assert.strictEqual(comp.differenceCount, 0);
  });

  it("Fails on HTTP status mismatch", () => {
    const oldRes = { status: 200, body: { ok: true } };
    const newRes = { status: 500, body: { error: "Server Error" } };
    const comp = compareResponses(oldRes, newRes);
    assert.strictEqual(comp.pass, false);
    const statusDiff = comp.differences.find(d => d.type === "STATUS_MISMATCH");
    assert.ok(statusDiff);
    assert.strictEqual(statusDiff.oldValue, 200);
    assert.strictEqual(statusDiff.newValue, 500);
  });

  it("Detects missing field in new response", () => {
    const oldRes = { status: 200, body: { id: 1, email: "user@test.com", role: "admin" } };
    const newRes = { status: 200, body: { id: 1, email: "user@test.com" } };
    const comp = compareResponses(oldRes, newRes);
    assert.strictEqual(comp.pass, false);
    const diff = comp.differences.find(d => d.type === "MISSING_FIELD");
    assert.ok(diff);
    assert.strictEqual(diff.path, "$.role");
  });

  it("Detects unexpected extra field in new response", () => {
    const oldRes = { status: 200, body: { id: 1 } };
    const newRes = { status: 200, body: { id: 1, extraKey: "unexpected" } };
    const comp = compareResponses(oldRes, newRes);
    assert.strictEqual(comp.pass, false);
    const diff = comp.differences.find(d => d.type === "EXTRA_FIELD");
    assert.ok(diff);
    assert.strictEqual(diff.path, "$.extraKey");
  });

  it("Detects data-type mismatch (string vs number)", () => {
    const oldRes = { status: 200, body: { id: "101" } };
    const newRes = { status: 200, body: { id: 101 } };
    const comp = compareResponses(oldRes, newRes);
    assert.strictEqual(comp.pass, false);
    const diff = comp.differences.find(d => d.type === "TYPE_MISMATCH");
    assert.ok(diff);
    assert.strictEqual(diff.path, "$.id");
  });

  it("Detects nested array and object value differences", () => {
    const oldRes = { status: 200, body: { user: { addresses: [{ city: "Mumbai" }] } } };
    const newRes = { status: 200, body: { user: { addresses: [{ city: "Delhi" }] } } };
    const comp = compareResponses(oldRes, newRes);
    assert.strictEqual(comp.pass, false);
    const diff = comp.differences.find(d => d.type === "VALUE_MISMATCH");
    assert.ok(diff);
    assert.strictEqual(diff.path, "$.user.addresses[0].city");
  });

  it("Ignores configured dynamic fields (e.g. timestamp, request_id)", () => {
    const oldRes = { status: 200, body: { id: 1, timestamp: 11111, request_id: "abc" } };
    const newRes = { status: 200, body: { id: 1, timestamp: 99999, request_id: "xyz" } };
    const comp = compareResponses(oldRes, newRes, { ignorePaths: ["timestamp", "request_id"] });
    assert.strictEqual(comp.pass, true);
    assert.strictEqual(comp.differenceCount, 0);
  });

  it("Supports property renaming through responseFieldMappings", () => {
    const oldRes = { status: 200, body: { marketwatch_id: "1", name: "Tech" } };
    const newRes = { status: 200, body: { symbol_list_id: "1", name: "Tech" } };
    const comp = compareResponses(oldRes, newRes, {
      responseFieldMappings: { marketwatch_id: "symbol_list_id" }
    });
    assert.strictEqual(comp.pass, true);
  });

  it("Supports numeric tolerance for volatile market data", () => {
    const oldRes = { status: 200, body: { ltp: 1500.25, volume: 100 } };
    const newRes = { status: 200, body: { ltp: 1500.30, volume: 100 } };
    const comp = compareResponses(oldRes, newRes, {
      numericTolerance: { ltp: 0.10 }
    });
    assert.strictEqual(comp.pass, true);
  });

  it("Treats matching HTTP error responses (e.g. 404 from both) as valid match", () => {
    const oldRes = { status: 404, body: { error: "Resource not found" } };
    const newRes = { status: 404, body: { error: "Resource not found" } };
    const comp = compareResponses(oldRes, newRes);
    assert.strictEqual(comp.pass, true);
    assert.strictEqual(comp.statusMatch, true);
  });

  // 4. End-to-End Regression Test with Mock Server
  console.log("\n▶ 4. End-to-End Regression Test Execution (Mocked):");
  await itAsync("Executes test suite against Mock Server and generates reports", async () => {
    const MOCK_OLD_PORT = 4101;
    const MOCK_NEW_PORT = 4102;

    const mockServers = await startMockServers(MOCK_OLD_PORT, MOCK_NEW_PORT);

    try {
      const outcome = await runTests({
        oldBase: mockServers.oldUrl,
        newBase: mockServers.newUrl,
        oldToken: "mock-old-token",
        newToken: "mock-new-token",
        isMockRun: true
      });

      assert.ok(outcome.summary.PASS > 0, "At least some endpoints passed");
      assert.strictEqual(outcome.summary.PASS + outcome.summary.SKIPPED + outcome.summary.FAIL, 33, "All 33 endpoints processed");

      // Verify Reports generated
      assert.ok(fs.existsSync(outcome.reportPaths.htmlPath), "HTML report generated");
      assert.ok(fs.existsSync(outcome.reportPaths.jsonPath), "JSON report generated");

      const htmlContent = fs.readFileSync(outcome.reportPaths.htmlPath, "utf8");
      assert.ok(htmlContent.includes("API Migration Regression Report"), "HTML report contains correct title");
      assert.ok(!htmlContent.includes("SuperSecretPassword"), "No sensitive secrets leaked");

      const jsonContent = JSON.parse(fs.readFileSync(outcome.reportPaths.jsonPath, "utf8"));
      assert.strictEqual(typeof jsonContent.total, "number", "JSON report contains total count");
      assert.ok(Array.isArray(jsonContent.results), "JSON report contains results array");

    } finally {
      await mockServers.close();
    }
  });

  await itAsync("Accurately identifies and reports deliberate regressions/failures", async () => {
    const MOCK_OLD_PORT = 4103;
    const MOCK_NEW_PORT = 4104;

    // Introduce deliberate discrepancy on new server for rewards
    const discrepancies = {
      "/api/v1/rewards": () => ({
        status: 200,
        body: { status: "success", points: 9999 } // Old returns points: 250
      })
    };

    const mockServers = await startMockServers(MOCK_OLD_PORT, MOCK_NEW_PORT, discrepancies);

    try {
      const outcome = await runTests({
        oldBase: mockServers.oldUrl,
        newBase: mockServers.newUrl,
        filter: "rewards",
        isMockRun: true
      });

      assert.strictEqual(outcome.summary.FAIL, 1, "Exactly 1 failure detected");
      assert.strictEqual(outcome.results[0].status, "FAIL");
      assert.ok(outcome.results[0].differences.some(d => d.path === "$.points"), "Points mismatch path captured");
    } finally {
      await mockServers.close();
    }
  });

  console.log("\n=======================================================");
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log("=======================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}

module.exports = { runAllTests };
