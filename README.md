# Automated API Migration Regression Testing Framework

An enterprise-grade, configuration-driven regression testing automation framework built with Node.js and Axios. Designed to verify consistency between legacy (Old) APIs and newly migrated/renamed (New) APIs across headers, status codes, payload structures, nested arrays, and data types.

---

## Table of Contents
1. [Overview & Architecture](#1-overview--architecture)
2. [Prerequisites & Node.js Installation](#2-prerequisites--nodejs-installation)
3. [Opening the Project in VS Code](#3-opening-the-project-in-vs-code)
4. [Installing Dependencies](#4-installing-dependencies)
5. [Configuring Environment Variables (`.env`)](#5-configuring-environment-variables-env)
6. [Configuring Endpoint Mappings (`endpoints.json`)](#6-configuring-endpoint-mappings-endpointsjson)
7. [Configuring Path Parameters & Request Bodies](#7-configuring-path-parameters--request-bodies)
8. [Executing Regression Tests](#8-executing-regression-tests)
9. [Interpreting Test Results (PASS, FAIL, ERROR, SKIPPED)](#9-interpreting-test-results)
10. [Viewing and Analyzing the Interactive HTML Report](#10-viewing-and-analyzing-the-interactive-html-report)
11. [Safe Mutation Testing (POST, PUT, DELETE)](#11-safe-mutation-testing)
12. [Troubleshooting Guide](#12-troubleshooting-guide)
13. [Continuous Regression & CI/CD Workflow](#13-continuous-regression--cicd-workflow)

---

## 1. Overview & Architecture

When backend services rename routes or migrate to newer versions, subtle regressions can occur. This framework automates contract equivalence validation:

```
┌──────────────────┐
│ endpoints.json   │◄─── Endpoint mappings & comparison rules
└────────┬─────────┘
         │
         ▼
┌──────────────────┐      Execute Old API       ┌────────────────────────┐
│   Test Runner    ├───────────────────────────►│ Old Host (OLD_BASE_URL) │
│ (src/run-tests)  │◄───────────────────────────┤ Status, Body, Latency  │
│                  │      Capture Response      └────────────────────────┘
│                  │
│                  │      Execute New API       ┌────────────────────────┐
│                  ├───────────────────────────►│ New Host (NEW_BASE_URL) │
│                  │◄───────────────────────────┤ Status, Body, Latency  │
│                  │      Capture Response      └────────────────────────┘
└────────┬─────────┘
         │
         ▼
┌────────────────────────┐
│  Response Comparator   │◄─── Deep recursive JSON comparison
│ (src/response-compare) │◄─── Ignores approved volatile fields (timestamp, request_id)
└────────┬───────────────┘◄─── Applies field renames & numeric tolerances
         │
         ▼
┌────────────────────────┐
│ Reports Generator      │───► reports/api-comparison-report.html (Interactive Dashboard)
│ (src/report-generator) ├───► reports/api-comparison-report.json (Machine-readable)
└────────────────────────┘
```

### Project Directory Structure

```
api-migration-regression/
├── src/
│   ├── run-tests.js          # Core test orchestrator and CLI runner
│   ├── request-client.js     # Axios client with timing, auth, and credential redaction
│   ├── response-comparator.js# Recursive JSON diffing, tolerance, and field mappings
│   ├── url-resolver.js       # Dynamic path parameter interpolation and URL encoding
│   ├── report-generator.js   # Interactive HTML dashboard and JSON report generator
│   ├── config-validator.js   # Structural and schema validator for endpoints and .env
│   ├── mock-server.js        # Zero-dependency local mock server for validation
│   └── auth-helper.js        # Velora sign-in and session token utility
├── test/
│   └── runner.test.js        # Unit and end-to-end integration test suite
├── reports/
│   ├── api-comparison-report.html # Executive dashboard report
│   └── api-comparison-report.json # Structured JSON diff output
├── endpoints.json            # 33 configured endpoint mappings
├── .env.example              # Environment template
├── .env                      # Local configuration file (gitignored)
├── .gitignore                # Protects credentials and reports
├── package.json              # NPM scripts and dependencies
└── README.md                 # Complete documentation
```

---

## 2. Prerequisites & Node.js Installation

### Windows Installation
1. Download **Node.js LTS** (version 20.x or 22.x LTS) from [https://nodejs.org/](https://nodejs.org/).
2. Run the Windows `.msi` installer, accept defaults, and complete installation.
3. Open Windows PowerShell and verify installation:
   ```powershell
   node -v
   npm -v
   ```

> **PowerShell Note on Windows:**
> If PowerShell gives an execution policy error on `npm` (e.g. `cannot be loaded because running scripts is disabled`), use `npm.cmd` instead of `npm`, or run:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

---

## 3. Opening the Project in VS Code

1. Launch **Visual Studio Code**.
2. Click **File > Open Folder...** (or press `Ctrl + K, Ctrl + O`).
3. Select the `api-migration-regression` folder.
4. Open the integrated terminal: press `` Ctrl + ` `` or go to **Terminal > New Terminal**.

---

## 4. Installing Dependencies

In the VS Code terminal, run:

```powershell
npm.cmd install
```
*(Or `npm install` if your PowerShell execution policy is already configured).*

This installs:
- `axios`: High-performance HTTP client for request execution.
- `dotenv`: Secure environment variable management.

---

## 5. Configuring Environment Variables (`.env`)

Copy `.env.example` to create your local `.env`:

```powershell
Copy-Item .env.example .env
```

Open `.env` in VS Code and supply your target environment details:

```ini
# Base URLs (Old host vs New host)
OLD_BASE_URL=https://web-uat.velora.plus
NEW_BASE_URL=https://web-uat.velora.plus

# Bearer Tokens (Do NOT include the word "Bearer", just the raw token string)
OLD_TOKEN=your_old_jwt_or_session_token_here
NEW_TOKEN=your_new_jwt_or_session_token_here

# Velora UAT Test Account Credentials
VELORA_CLIENT_ID=S117027
VELORA_PASSWORD=Live@0987
VELORA_PIN=123456

# Mutation Safety Lock: Keep false for read-only GET tests
RUN_MUTATIONS=false

# Request Timeout in Milliseconds (Default: 20000 = 20s)
REQUEST_TIMEOUT_MS=20000
```

> **Security Guarantee:**
> All tokens, passwords, and secrets are automatically redacted from console output and generated reports. `.env` is strictly excluded in `.gitignore`.

---

## 6. Configuring Endpoint Mappings (`endpoints.json`)

All 33 endpoint mappings are pre-configured in `endpoints.json`, categorized across 9 core modules:

| Module | Old Path | New Path | Method | Default Status |
| :--- | :--- | :--- | :---: | :---: |
| **Authentication** | `/api/v4/user/login` | `/api/v4/sign-in` | `POST` | Disabled (Mutation) |
| **Authentication** | `/api/v4/user/password/forgot/otp` | `/api/v4/recovery/otp` | `POST` | Disabled (Mutation) |
| **Authentication** | `/api/v4/user/password/set` | `/api/v4/recovery` | `POST` | Disabled (Mutation) |
| **Member Configuration** | `/api/v1/broker/settings` | `/api/v1/member/config` | `GET` | **Enabled** |
| **Member Configuration** | `/api/v1/broker/settings` | `/api/v1/member/config` | `POST` | Disabled (Mutation) |
| **Member Configuration** | `/api/v2/broker/settings` | `/api/v2/member/config` | `GET` | **Enabled** |
| **Account & Profile** | `/api/v1/management/user/settings` | `/api/v1/account/preferences` | `GET` | **Enabled** |
| **Account & Profile** | `/api/v1/management/user/settings` | `/api/v1/account/preferences` | `POST` | Disabled (Mutation) |
| **Account & Profile** | `/api/v1/user/profile` | `/api/v1/account` | `GET` | **Enabled** |
| **Account & Profile** | `/api/v1/user/referrals/bonus` | `/api/v1/rewards` | `GET` | **Enabled** |
| **Favorites** | `/api/v1/dashboard/pins` | `/api/v1/favorites` | `GET` | **Enabled** |
| **Favorites** | `/api/v1/dashboard/pins/:marketwatch_id` | `/api/v1/favorites/:marketwatch_id` | `GET` | **Enabled** |
| **Favorites** | `/api/v1/dashboard/pins` | `/api/v1/favorites` | `PUT` | Disabled (Mutation) |
| **Favorites** | `/api/v1/dashboard/pins/:marketwatch_id` | `/api/v1/favorites/:marketwatch_id` | `PUT` | Disabled (Mutation) |
| **Symbol Lists** | `/api/v1/marketwatches` | `/api/v1/symbol-lists` | `GET` | **Enabled** |
| **Symbol Lists** | `/api/v1/marketwatches` | `/api/v1/symbol-lists` | `POST` | Disabled (Mutation) |
| **Symbol Lists** | `/api/v1/marketwatches/:mw_id` | `/api/v1/symbol-lists/:mw_id` | `PUT` | Disabled (Mutation) |
| **Orders** | `/api/v1/orders` | `/api/v1/order-book` | `GET` | **Enabled** |
| **Orders** | `/api/v1/orders` | `/api/v1/order-book` | `POST` | Disabled (Mutation) |
| **Orders** | `/api/v1/orders/bracket` | `/api/v1/bracket-orders` | `POST` | Disabled (Mutation) |
| **Orders** | `/api/v1/orders/bracket` | `/api/v1/bracket-orders` | `PUT` | Disabled (Mutation) |
| **Orders** | `/api/v1/orders/bracket` | `/api/v1/bracket-orders` | `DELETE` | Disabled (Mutation) |
| **Orders** | `/api/v1/orders/kart` | `/api/v1/basket-orders` | `POST` | Disabled (Mutation) |
| **Orders** | `/api/v1/orders/kart` | `/api/v1/basket-orders` | `PUT` | Disabled (Mutation) |
| **Orders** | `/api/v1/orders/kart/:oms_order_id` | `/api/v1/basket-orders/:oms_order_id` | `DELETE` | Disabled (Mutation) |
| **Orders** | `/api/v1/orders/cover` | `/api/v1/cover-orders` | `DELETE` | Disabled (Mutation) |
| **Trades & Positions** | `/api/v1/trades` | `/api/v1/fills` | `GET` | **Enabled** |
| **Trades & Positions** | `/api/v1/positions` | `/api/v1/open-positions` | `GET` | **Enabled** |
| **Ledger & Margin** | `/api/v1/funds/transactions` | `/api/v1/ledger/movements` | `GET` | **Enabled** |
| **Ledger & Margin** | `/api/v1/funds/view/margin` | `/api/v1/balances/margin` | `GET` | **Enabled** |
| **Market Data** | `/api/v1/marketdata/:exchange/:segment` | `/api/v1/ticker/:exchange/:segment` | `GET` | **Enabled** |
| **Market Data** | `/api/v1/marketdata/:exchange/:segment/:token` | `/api/v1/ticker/:exchange/:segment/:token` | `GET` | **Enabled** |
| **Market Data** | `/api/v1/marketdata/:exchange/:segment/:token/:key` | `/api/v1/ticker/:exchange/:segment/:token/:key` | `GET` | **Enabled** |

---

## 7. Configuring Path Parameters & Request Bodies

### Path Parameters
Endpoints containing route tokens (such as `:marketwatch_id`, `:mw_id`, `:oms_order_id`, `:exchange`, `:segment`, `:token`, `:key`) resolve values from `pathParams`.

Example from `endpoints.json`:
```json
{
  "name": "ticker_token",
  "method": "GET",
  "oldPath": "/api/v1/marketdata/:exchange/:segment/:token",
  "newPath": "/api/v1/ticker/:exchange/:segment/:token",
  "pathParams": {
    "exchange": "NSE",
    "segment": "CM",
    "token": "26000"
  }
}
```
*Values are automatically URL-encoded using `encodeURIComponent`.*

### Request Body & Separate Payloads
If an endpoint requires a payload, configure `body`:
```json
{
  "name": "order_book_post",
  "method": "POST",
  "body": {
    "exchange": "NSE",
    "tradingsymbol": "INFY",
    "transaction_type": "BUY",
    "quantity": 1,
    "price": 1500.0
  }
}
```
If test data isolation requires distinct IDs between Old and New systems, specify `oldBody` and `newBody` separately.

### Dynamic Field Exclusions & Tolerances
```json
{
  "ignorePaths": [
    "timestamp",
    "request_id",
    "trace_id",
    "access_token"
  ],
  "responseFieldMappings": {
    "old_key_name": "new_key_name"
  },
  "numericTolerance": {
    "ltp": 0.50
  }
}
```

---

## 8. Executing Regression Tests with Playwright

The framework is powered by **Playwright Test Runner (`@playwright/test`)** in JavaScript.

### 1. Validate Configuration
Ensure `endpoints.json` and `.env` are structurally valid without sending requests:
```powershell
npm.cmd run test:validate
```

### 2. Verify Locally with Built-In Mock Server (100% Offline)
Runs the test suite against local simulated Old & New API servers covering matches, type mismatches, missing fields, tolerances, and error states:
```powershell
npm.cmd run test:mock
```

### 3. Run Safe Read-Only Tests Against Real API (Playwright)
Executes all enabled safe GET endpoints:
```powershell
npm.cmd run test:read-only
```
*(Runs `npx playwright test --grep @readonly`).*

### 4. Run All Configured Endpoints (Playwright)
```powershell
npm.cmd test
```
*(Runs `npx playwright test`). Mutation endpoints like order placement remain safely **SKIPPED** unless `RUN_MUTATIONS=true` is enabled in `.env`.*

### 5. Filter Tests by Module with Playwright Tags
Playwright automatically tags each test by module and type:
```powershell
# Run only Orders module tests
npx.cmd playwright test --grep @orders

# Run only Market Data tests
npx.cmd playwright test --grep @marketdata

# Run only Authentication tests
npx.cmd playwright test --grep @authentication
```

---

## 9. Interpreting Test Results

Every endpoint execution is assigned one of four statuses:

| Status | Meaning | When It Occurs | Action Required |
| :---: | :--- | :--- | :--- |
| **`PASS`** | Match | Both Old and New APIs returned identical status codes and equivalent payload values (accounting for approved ignored dynamic fields). | No action needed. Verification succeeded. |
| **`FAIL`** | Discrepancy | HTTP status code mismatch, missing field in New response, extra unexpected key, data type mismatch, or value divergence. | Inspect differences in HTML report and raise bug ticket or update field mappings. |
| **`ERROR`** | Network / Infra | Server was unreachable (`ECONNREFUSED`), timed out (`ETIMEDOUT`), DNS failure (`ENOTFOUND`), or invalid base URL. | Check host connectivity, VPN status, and server availability. |
| **`SKIPPED`** | Protected / Incomplete | Endpoint disabled in `endpoints.json`, mutation safety lock is active (`RUN_MUTATIONS=false`), or required path parameter is missing. | Review safety settings or configure missing parameters if you intend to run it. |

---

## 10. Dual HTML Reporting: Playwright & Executive Dashboard

Every test run automatically generates **two comprehensive HTML reports**:

### A. Executive API Comparison Dashboard
- **File:** `reports/api-comparison-report.html`
- **Machine Data:** `reports/api-comparison-report.json`
- **Features:** Side-by-side Old vs New comparison, KPI metrics, searchable live filter pills, millisecond latency comparisons, and structured difference categorization (`MISSING_FIELD`, `EXTRA_FIELD`, `TYPE_MISMATCH`, `VALUE_MISMATCH`, `STATUS_MISMATCH`).
- **Open in Browser:**
  ```powershell
  Start-Process reports\api-comparison-report.html
  ```

### B. Playwright Native HTML Report
- **Folder:** `playwright-report/index.html`
- **Features:** Deep step-by-step traces, failure contexts, Playwright test metadata, and attached JSON execution summaries.
- **Open in Browser:**
  ```powershell
  npm.cmd run test:report
  ```
  *(Or `npx.cmd playwright show-report playwright-report`).*

---

## 11. Safe Mutation Testing (POST, PUT, DELETE)

Write requests (orders, pins, config updates) can modify application state. To protect your UAT environment:

1. **Default Lock:** `RUN_MUTATIONS` is `false` by default.
2. **Double Confirmation:**
   - In `endpoints.json`, set `"enabled": true` on the specific endpoint you wish to test.
   - Verify the `body` payload contains disposable test data.
   - In `.env`, set:
     ```ini
     RUN_MUTATIONS=true
     ```
3. Run all tests:
   ```powershell
   npm.cmd run test:all
   ```
4. **Immediate Re-Lock:** After testing, set `RUN_MUTATIONS=false` again.

---

## 12. Troubleshooting Guide

### 1. `401 Unauthorized` or `403 Forbidden`
- **Cause:** Missing or expired authentication token.
- **Fix:** Update `OLD_TOKEN` and `NEW_TOKEN` in `.env`. If using the Velora sign-in helper, run:
  ```powershell
  npm.cmd run auth:login
  ```
  Copy the retrieved token into `OLD_TOKEN` and `NEW_TOKEN`.

### 2. `ECONNREFUSED` or `ETIMEDOUT`
- **Cause:** The target server is down, unreachable, or blocked by corporate firewall / VPN.
- **Fix:** Verify connectivity by pinging or opening `https://web-uat.velora.plus` in your browser. Increase `REQUEST_TIMEOUT_MS=30000` in `.env` if UAT is experiencing high latency.

### 3. Missing Path Parameter Warnings
- **Cause:** Endpoint template contains `:token` or `:mw_id`, but `pathParams` is empty.
- **Fix:** Add the required ID to that endpoint's `"pathParams"` block in `endpoints.json`.

### 4. False Failure from Dynamic Fields (Timestamps, Request IDs)
- **Cause:** Response contains unique generated values on each call.
- **Fix:** Add the field name to that endpoint's `"ignorePaths"` array:
  ```json
  "ignorePaths": ["timestamp", "request_id", "trace_id", "server_time"]
  ```

### 5. False Failure from Renamed Property
- **Cause:** New API intentionally renamed a property (e.g. `marketwatch_id` to `symbol_list_id`).
- **Fix:** Add to `"responseFieldMappings"`:
  ```json
  "responseFieldMappings": {
    "marketwatch_id": "symbol_list_id"
  }
  ```

---

## 13. Continuous Regression & CI/CD Workflow

The test runner exits with standard process exit codes:
- `exit code 0`: All executed tests PASSED (or SKIPPED).
- `exit code 1`: One or more tests FAILED or encountered an ERROR.

You can run this in CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins) with:
```powershell
npm test
```
The generated `reports/api-comparison-report.json` and `reports/api-comparison-report.html` can be saved as CI test artifacts for audit trails.
