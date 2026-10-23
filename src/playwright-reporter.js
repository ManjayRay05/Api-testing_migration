/**
 * Custom Playwright Reporter
 * Integrates Playwright Test Runner output with executive HTML dashboard
 * and JSON comparison reporting.
 */

const path = require("path");
const { generateReports } = require("./report-generator");
const { redactSensitiveData } = require("./request-client");

class ApiRegressionReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(__dirname, "..", "reports");
    this.results = [];
  }

  onBegin(config, suite) {
    this.results = [];
    this.config = config;
    this.startTime = Date.now();
  }

  onTestEnd(test, result) {
    // Extract metadata stored during test execution (prefer latest)
    const metadataAnnotation = [...test.annotations].reverse().find(a => a.type === "regression_metadata");
    let testData = {};

    if (metadataAnnotation && metadataAnnotation.description) {
      try {
        testData = JSON.parse(metadataAnnotation.description);
      } catch {
        testData = {};
      }
    }

    // Determine normalized status: PASS, FAIL, ERROR, or SKIPPED
    let normalizedStatus = "FAIL";
    if (result.status === "skipped") {
      normalizedStatus = "SKIPPED";
    } else if (result.status === "passed") {
      normalizedStatus = "PASS";
    } else if (result.status === "timedOut" || result.errors.some(e => e.message && e.message.includes("ECONN"))) {
      normalizedStatus = "ERROR";
    } else {
      normalizedStatus = "FAIL";
    }

    const failureMessage = result.error ? result.error.message : undefined;

    this.results.push({
      name: testData.name || test.title,
      module: testData.module || test.parent?.title || "General",
      method: testData.method || "GET",
      oldPath: testData.oldPath || "",
      newPath: testData.newPath || "",
      oldUrl: testData.oldUrl || "",
      newUrl: testData.newUrl || "",
      status: normalizedStatus,
      oldStatus: testData.oldStatus,
      newStatus: testData.newStatus,
      oldDurationMs: testData.oldDurationMs,
      newDurationMs: testData.newDurationMs,
      oldRequestHeaders: testData.oldRequestHeaders,
      newRequestHeaders: testData.newRequestHeaders,
      oldRequestBody: testData.oldRequestBody,
      newRequestBody: testData.newRequestBody,
      oldResponseHeaders: testData.oldResponseHeaders,
      newResponseHeaders: testData.newResponseHeaders,
      oldBody: testData.oldBody,
      newBody: testData.newBody,
      differences: testData.differences || [],
      differenceCount: (testData.differences || []).length,
      note: testData.note || failureMessage || (normalizedStatus === "PASS" ? "Response matched" : "")
    });
  }

  async onEnd(result) {
    const counts = this.results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, { PASS: 0, FAIL: 0, ERROR: 0, SKIPPED: 0 });

    const reportData = {
      generatedAt: new Date().toISOString(),
      total: this.results.length,
      summary: counts,
      environment: {
        oldBaseUrl: process.env.OLD_BASE_URL || "",
        newBaseUrl: process.env.NEW_BASE_URL || "",
        runMutations: String(process.env.RUN_MUTATIONS || "false").toLowerCase() === "true"
      },
      results: this.results
    };

    const { htmlPath, jsonPath, excelPath } = await generateReports(reportData, this.outputDir);

    console.log("\n===============================================================================");
    console.log("             PLAYWRIGHT API REGRESSION TEST SUMMARY                            ");
    console.log("===============================================================================");
    console.log(`TOTAL ENDPOINTS : ${this.results.length}`);
    console.log(`PASSED          : ${counts.PASS}`);
    console.log(`FAILED          : ${counts.FAIL}`);
    console.log(`ERRORS          : ${counts.ERROR}`);
    console.log(`SKIPPED         : ${counts.SKIPPED}`);
    console.log("-------------------------------------------------------------------------------");
    console.log(`📊 Custom HTML Dashboard : ${htmlPath}`);
    console.log(`📗 Microsoft Excel (.xlsx): ${excelPath}`);
    console.log(`📄 Custom JSON Report    : ${jsonPath}`);
    console.log("===============================================================================\n");
  }
}

module.exports = ApiRegressionReporter;
