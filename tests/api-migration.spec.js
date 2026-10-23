/**
 * Playwright API Migration Regression Test Suite
 * Dynamically generates Playwright tests for all 33 endpoints mapped in endpoints.json.
 */

const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { buildFullUrl, MissingPathParameterError } = require("../src/url-resolver");
const { compareResponses } = require("../src/response-comparator");
const { createRequestContext, executePlaywrightRequest } = require("../src/playwright-client");
const { redactSensitiveData } = require("../src/request-client");

const configPath = path.join(__dirname, "..", "endpoints.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const oldBase = (process.env.OLD_BASE_URL || "").trim().replace(/\/+$/, "");
const newBase = (process.env.NEW_BASE_URL || "").trim().replace(/\/+$/, "");
const oldToken = process.env.OLD_TOKEN || "";
const newToken = process.env.NEW_TOKEN || "";
const runMutations = String(process.env.RUN_MUTATIONS || "false").toLowerCase() === "true";
const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 25000);

// Group endpoints by module
const modulesMap = new Map();
for (const ep of config.endpoints) {
  const mod = ep.module || "General";
  if (!modulesMap.has(mod)) {
    modulesMap.set(mod, []);
  }
  modulesMap.get(mod).push(ep);
}

for (const [moduleName, endpoints] of modulesMap.entries()) {
  test.describe(`${moduleName}`, () => {
    let oldContext;
    let newContext;

    test.beforeAll(async () => {
      // Initialize separate Playwright APIRequestContext instances for Old and New hosts
      if (oldBase) {
        oldContext = await createRequestContext(oldBase, oldToken, {}, timeoutMs);
      }
      if (newBase) {
        newContext = await createRequestContext(newBase, newToken, {}, timeoutMs);
      }
    });

    test.afterAll(async () => {
      if (oldContext) await oldContext.dispose();
      if (newContext) await newContext.dispose();
    });

    for (const ep of endpoints) {
      const method = (ep.method || "GET").toUpperCase();
      const isMutation = ep.isMutation !== false && !["GET", "HEAD"].includes(method);
      const tagType = isMutation ? "@mutation" : "@readonly";
      const moduleTag = `@${moduleName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

      test(`[${method}] ${ep.name} ${tagType} ${moduleTag}`, async ({ playwright }, testInfo) => {
        // Record base metadata so reporter always has full endpoint details
        testInfo.annotations.push({
          type: "regression_metadata",
          description: JSON.stringify({
            name: ep.name,
            module: moduleName,
            method,
            oldPath: ep.oldPath,
            newPath: ep.newPath,
            status: "SKIPPED",
            note: ""
          })
        });

        // 1. Check if disabled in configuration
        if (!ep.enabled) {
          test.skip(true, `Disabled in endpoints.json`);
          return;
        }

        // 2. Enforce mutation safety controls
        if (isMutation && !runMutations) {
          test.skip(true, `Mutation safety lock: RUN_MUTATIONS is false. Set RUN_MUTATIONS=true in .env to enable write operations.`);
          return;
        }

        // 3. Check payload requirement for mutations
        if (["POST", "PUT", "PATCH"].includes(method) && (ep.body === null || ep.body === undefined)) {
          test.skip(true, `Write operation requires a valid "body" payload in endpoints.json`);
          return;
        }

        // 4. Resolve path parameters and URLs
        let oldUrl = "";
        let newUrl = "";
        try {
          oldUrl = buildFullUrl(oldBase, ep.oldPath, ep.pathParams || {}, ep.query || {});
          newUrl = buildFullUrl(newBase, ep.newPath, ep.pathParams || {}, ep.query || {});
        } catch (err) {
          test.skip(true, `Missing path parameter: ${err.message}`);
          return;
        }

        // 5. Ensure contexts are ready
        if (!oldContext || !newContext) {
          throw new Error("Base URLs are not properly configured in .env (OLD_BASE_URL and NEW_BASE_URL are required).");
        }

        // 6. Execute requests via Playwright
        const oldResult = await executePlaywrightRequest(oldContext, {
          url: oldUrl,
          method,
          headers: ep.oldHeaders || {},
          body: ep.oldBody !== undefined ? ep.oldBody : ep.body,
          timeoutMs
        });

        const newResult = await executePlaywrightRequest(newContext, {
          url: newUrl,
          method,
          headers: ep.newHeaders || {},
          body: ep.newBody !== undefined ? ep.newBody : ep.body,
          timeoutMs
        });

        // 7. Verify network transport
        if (!oldResult.success || !newResult.success) {
          const errMsg = `Old: ${oldResult.error || "HTTP " + oldResult.status} | New: ${newResult.error || "HTTP " + newResult.status}`;
          testInfo.annotations.push({
            type: "regression_metadata",
            description: JSON.stringify({
              name: ep.name,
              module: moduleName,
              method,
              oldPath: ep.oldPath,
              newPath: ep.newPath,
              oldUrl,
              newUrl,
              status: "ERROR",
              note: errMsg
            })
          });
          throw new Error(`Transport/Network Error: ${errMsg}`);
        }

        // 8. Automated Response Comparison
        const comparisonRules = {
          oldPath: ep.oldPath,
          newPath: ep.newPath,
          ignorePaths: ep.ignorePaths || [],
          responseFieldMappings: ep.responseFieldMappings || {},
          numericTolerance: ep.numericTolerance ?? null,
          ignoreArrayOrder: ep.ignoreArrayOrder || false,
          comparisonStrategy: ep.comparisonStrategy || "exact",
          stableFields: ep.stableFields || [],
          expectedStatusCode: ep.expectedStatusCode
        };

        const comparison = compareResponses(oldResult, newResult, comparisonRules);

        // Store metadata for custom reporter & Excel generation
        testInfo.annotations.push({
          type: "regression_metadata",
          description: JSON.stringify({
            name: ep.name,
            module: moduleName,
            method,
            oldPath: ep.oldPath,
            newPath: ep.newPath,
            oldUrl,
            newUrl,
            status: comparison.pass ? "PASS" : "FAIL",
            oldStatus: oldResult.status,
            newStatus: newResult.status,
            oldDurationMs: oldResult.durationMs,
            newDurationMs: newResult.durationMs,
            oldRequestHeaders: oldResult.requestSummary?.headers || ep.oldHeaders || {},
            newRequestHeaders: newResult.requestSummary?.headers || ep.newHeaders || {},
            oldRequestBody: oldResult.requestSummary?.body !== undefined ? oldResult.requestSummary.body : ep.body,
            newRequestBody: newResult.requestSummary?.body !== undefined ? newResult.requestSummary.body : ep.body,
            oldResponseHeaders: oldResult.headers || {},
            newResponseHeaders: newResult.headers || {},
            oldBody: oldResult.body,
            newBody: newResult.body,
            differences: comparison.differences
          })
        });

        // Attach details to native Playwright report
        await testInfo.attach("Execution-Comparison-Summary.json", {
          contentType: "application/json",
          body: JSON.stringify({
            endpoint: ep.name,
            method,
            oldUrl,
            newUrl,
            oldStatus: oldResult.status,
            newStatus: newResult.status,
            latencyDiffMs: newResult.durationMs - oldResult.durationMs,
            differences: comparison.differences
          }, null, 2)
        });

        // 9. Assert status codes & schema consistency
        expect(
          comparison.differences,
          `API Regression Detected (${comparison.differences.length} differences):\n${comparison.differences.map(d => ` - [${d.type}] ${d.path}: ${d.message}`).join("\n")}`
        ).toHaveLength(0);

        expect(
          newResult.status,
          `HTTP status mismatch: Old returned ${oldResult.status}, but New returned ${newResult.status}`
        ).toBe(oldResult.status);
      });
    }
  });
}
