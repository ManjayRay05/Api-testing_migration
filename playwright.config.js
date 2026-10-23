// @ts-check
const { defineConfig } = require("@playwright/test");
require("dotenv").config();

/**
 * Playwright Test Configuration for API Migration Regression Testing
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: "./tests",
  timeout: Number(process.env.REQUEST_TIMEOUT_MS || 25000),
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["./src/playwright-reporter.js"]
  ],
  use: {
    extraHTTPHeaders: {
      "Accept": "application/json, text/plain, */*"
    },
    trace: "off"
  }
});
