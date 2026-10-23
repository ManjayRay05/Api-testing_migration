/**
 * API Migration Regression Test Runner
 * Core orchestrator for executing and comparing Old vs New API endpoints.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { buildFullUrl, MissingPathParameterError } = require("./url-resolver");
const { executeRequest, redactSensitiveData } = require("./request-client");
const { compareResponses } = require("./response-comparator");
const { generateReports } = require("./report-generator");
const { validateEndpointsConfig, validateEnvironment } = require("./config-validator");

/**
 * Main Test Runner function.
 * @param {object} options CLI flags / overrides
 * @returns {Promise<object>}
 */
async function runTests(options = {}) {
  const configPath = options.configPath || path.join(__dirname, "..", "endpoints.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const validation = validateEndpointsConfig(rawConfig);
  if (!validation.valid) {
    console.error("❌ Configuration validation failed:");
    validation.errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }

  // Parse environment & CLI options
  const oldBase = (options.oldBase || process.env.OLD_BASE_URL || "").trim().replace(/\/+$/, "");
  const newBase = (options.newBase || process.env.NEW_BASE_URL || "").trim().replace(/\/+$/, "");
  const oldToken = options.oldToken !== undefined ? options.oldToken : (process.env.OLD_TOKEN || "");
  const newToken = options.newToken !== undefined ? options.newToken : (process.env.NEW_TOKEN || "");
  const runMutationsEnv = String(process.env.RUN_MUTATIONS || "false").toLowerCase() === "true";
  const runMutations = options.readOnly ? false : (options.all ? runMutationsEnv : runMutationsEnv);
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 20000);
  const filterKeyword = (options.filter || "").toLowerCase().trim();

  // Validate Base URLs if not in mock test mode
  if (!options.isMockRun) {
    const envValidation = validateEnvironment({
      OLD_BASE_URL: oldBase,
      NEW_BASE_URL: newBase,
      OLD_TOKEN: oldToken,
      NEW_TOKEN: newToken,
      REQUEST_TIMEOUT_MS: timeoutMs
    });

    if (!envValidation.valid) {
      console.error("\n❌ Environment Configuration Error:");
      envValidation.errors.forEach(e => console.error(`   - ${e}`));
      console.error("\nPlease update your .env file with valid API endpoints or run mock tests using: npm run test:mock\n");
      process.exit(1);
    }
  }

  console.log("===============================================================================");
  console.log("             AUTOMATED API MIGRATION REGRESSION TEST RUNNER                    ");
  console.log("===============================================================================");
  console.log(`OLD BASE URL  : ${oldBase || "N/A"}`);
  console.log(`NEW BASE URL  : ${newBase || "N/A"}`);
  console.log(`ALLOW MUTATION: ${runMutations ? "YES (Write operations enabled)" : "NO (Safe GET/Read-only mode)"}`);
  console.log(`TIMEOUT (ms)  : ${timeoutMs}`);
  if (filterKeyword) console.log(`FILTER        : "${filterKeyword}"`);
  console.log("-------------------------------------------------------------------------------\n");

  const results = [];
  let testIndex = 0;

  for (const ep of rawConfig.endpoints) {
    testIndex++;
    const method = (ep.method || "GET").toUpperCase();
    const isMutation = ep.isMutation !== false && !["GET", "HEAD"].includes(method);
    const moduleName = ep.module || "General";

    // Filter by keyword if supplied
    if (filterKeyword) {
      const matchName = (ep.name || "").toLowerCase().includes(filterKeyword);
      const matchModule = moduleName.toLowerCase().includes(filterKeyword);
      const matchPath = (ep.oldPath || "").toLowerCase().includes(filterKeyword) || (ep.newPath || "").toLowerCase().includes(filterKeyword);
      if (!matchName && !matchModule && !matchPath) {
        continue;
      }
    }

    // 1. Check if disabled
    if (!ep.enabled) {
      console.log(`[SKIPPED] ${ep.name} (${method}) - Disabled in endpoints.json`);
      results.push({
        index: testIndex,
        name: ep.name,
        module: moduleName,
        method,
        oldPath: ep.oldPath,
        newPath: ep.newPath,
        status: "SKIPPED",
        note: "Disabled in endpoints.json"
      });
      continue;
    }

    // 2. Check read-only / mutation protection
    if (options.readOnly && !["GET", "HEAD"].includes(method)) {
      console.log(`[SKIPPED] ${ep.name} (${method}) - Read-only flag active`);
      results.push({
        index: testIndex,
        name: ep.name,
        module: moduleName,
        method,
        oldPath: ep.oldPath,
        newPath: ep.newPath,
        status: "SKIPPED",
        note: "Skipped by read-only mode"
      });
      continue;
    }

    if (isMutation && !runMutations) {
      console.log(`[SKIPPED] ${ep.name} (${method}) - Mutation safety lock (RUN_MUTATIONS=false)`);
      results.push({
        index: testIndex,
        name: ep.name,
        module: moduleName,
        method,
        oldPath: ep.oldPath,
        newPath: ep.newPath,
        status: "SKIPPED",
        note: "Mutation safety lock: Set RUN_MUTATIONS=true in .env to enable non-idempotent write operations."
      });
      continue;
    }

    // 3. Check body requirement for mutations
    if (["POST", "PUT", "PATCH"].includes(method) && (ep.body === null || ep.body === undefined)) {
      console.log(`[SKIPPED] ${ep.name} (${method}) - Request body missing`);
      results.push({
        index: testIndex,
        name: ep.name,
        module: moduleName,
        method,
        oldPath: ep.oldPath,
        newPath: ep.newPath,
        status: "SKIPPED",
        note: "Write operation has no body configured in endpoints.json."
      });
      continue;
    }

    // 4. Resolve URLs
    let oldUrl = "";
    let newUrl = "";
    try {
      oldUrl = buildFullUrl(oldBase, ep.oldPath, ep.pathParams || {}, ep.query || {});
      newUrl = buildFullUrl(newBase, ep.newPath, ep.pathParams || {}, ep.query || {});
    } catch (err) {
      const isParamErr = err instanceof MissingPathParameterError;
      console.log(`[SKIPPED] ${ep.name} (${method}) - ${err.message}`);
      results.push({
        index: testIndex,
        name: ep.name,
        module: moduleName,
        method,
        oldPath: ep.oldPath,
        newPath: ep.newPath,
        status: "SKIPPED",
        note: err.message
      });
      continue;
    }

    // 5. Execute API requests
    process.stdout.write(`Executing [${method}] ${ep.name} ... `);

    const oldResult = await executeRequest({
      url: oldUrl,
      method,
      token: oldToken,
      headers: ep.oldHeaders || {},
      body: ep.oldBody !== undefined ? ep.oldBody : ep.body,
      timeoutMs
    });

    const newResult = await executeRequest({
      url: newUrl,
      method,
      token: newToken,
      headers: ep.newHeaders || {},
      body: ep.newBody !== undefined ? ep.newBody : ep.body,
      timeoutMs
    });

    // 6. Check for Network / Connection / Execution Errors
    if (!oldResult.success || !newResult.success) {
      const errorMsg = `Old: ${oldResult.error || "HTTP " + oldResult.status} (${oldResult.message || "OK"}) | New: ${newResult.error || "HTTP " + newResult.status} (${newResult.message || "OK"})`;
      console.log(`💥 ERROR: ${errorMsg}`);
      results.push({
        index: testIndex,
        name: ep.name,
        module: moduleName,
        method,
        oldPath: ep.oldPath,
        newPath: ep.newPath,
        oldUrl,
        newUrl,
        status: "ERROR",
        note: errorMsg,
        oldResult,
        newResult
      });
      continue;
    }

    // 7. Perform Automated Response Comparison
    const comparisonRules = {
      ignorePaths: ep.ignorePaths || [],
      responseFieldMappings: ep.responseFieldMappings || {},
      numericTolerance: ep.numericTolerance ?? null,
      ignoreArrayOrder: ep.ignoreArrayOrder || false,
      comparisonStrategy: ep.comparisonStrategy || "exact",
      stableFields: ep.stableFields || [],
      expectedStatusCode: ep.expectedStatusCode
    };

    const comp = compareResponses(oldResult, newResult, comparisonRules);

    const testStatus = comp.pass ? "PASS" : "FAIL";
    const statusTag = testStatus === "PASS" ? "✅ PASS" : "❌ FAIL";
    console.log(`${statusTag} (${oldResult.durationMs}ms / ${newResult.durationMs}ms) [HTTP ${oldResult.status}/${newResult.status}]`);

    if (!comp.pass && comp.differences.length > 0) {
      const topDiff = comp.differences[0];
      console.log(`   └─ Diff [${topDiff.type}] at ${topDiff.path}: ${topDiff.message || ""}`);
      if (comp.differences.length > 1) {
        console.log(`   └─ ... and ${comp.differences.length - 1} more difference(s)`);
      }
    }

    results.push({
      index: testIndex,
      name: ep.name,
      module: moduleName,
      method,
      oldPath: ep.oldPath,
      newPath: ep.newPath,
      oldUrl,
      newUrl,
      status: testStatus,
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
      differences: comp.differences,
      differenceCount: comp.differences.length,
      note: comp.pass ? "Response matched" : `${comp.differences.length} difference(s) detected`
    });
  }

  // Aggregate results
  const summary = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, { PASS: 0, FAIL: 0, ERROR: 0, SKIPPED: 0 });

  const testReport = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    summary,
    environment: {
      oldBaseUrl: oldBase,
      newBaseUrl: newBase,
      runMutations
    },
    results
  };

  // Generate Reports (HTML, JSON, Excel)
  const reportPaths = await generateReports(testReport, options.reportDir);

  console.log("\n===============================================================================");
  console.log("                             TEST EXECUTION SUMMARY                            ");
  console.log("===============================================================================");
  console.log(`TOTAL ENDPOINTS : ${results.length}`);
  console.log(`PASSED          : ${summary.PASS}`);
  console.log(`FAILED          : ${summary.FAIL}`);
  console.log(`ERRORS          : ${summary.ERROR}`);
  console.log(`SKIPPED         : ${summary.SKIPPED}`);
  console.log("-------------------------------------------------------------------------------");
  console.log(`📊 HTML Report  : ${reportPaths.htmlPath}`);
  console.log(`📗 Excel Report : ${reportPaths.excelPath}`);
  console.log(`📄 JSON Report  : ${reportPaths.jsonPath}`);
  console.log("===============================================================================\n");

  return {
    summary,
    results,
    reportPaths,
    exitCode: (summary.FAIL > 0 || summary.ERROR > 0) ? 1 : 0
  };
}

// CLI Execution Entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const isReadOnly = args.includes("--read-only");
  const isAll = args.includes("--all");
  const filterArg = args.find(a => a.startsWith("--filter="));
  const filter = filterArg ? filterArg.split("=")[1] : "";

  runTests({
    readOnly: isReadOnly,
    all: isAll,
    filter
  })
    .then(outcome => {
      process.exit(outcome.exitCode);
    })
    .catch(err => {
      console.error("\nExecution Aborted:", err.message);
      process.exit(1);
    });
}

module.exports = {
  runTests
};
