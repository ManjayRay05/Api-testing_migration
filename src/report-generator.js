/**
 * Report Generator Module
 * Generates interactive, executive-ready HTML dashboards and machine-readable JSON reports.
 */

const fs = require("fs");
const path = require("path");
const { redactSensitiveData } = require("./request-client");
const { generateExcelReport } = require("./excel-generator");

/**
 * Escapes HTML characters safely.
 * @param {any} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

/**
 * Generates HTML, JSON, and Excel reports.
 * @param {object} testRunData
 * @param {string} outputDir
 * @returns {Promise<{ htmlPath: string, jsonPath: string, excelPath: string }>}
 */
async function generateReports(testRunData, outputDir = path.join(__dirname, "..", "reports")) {
  fs.mkdirSync(outputDir, { recursive: true });

  const sanitizedData = redactSensitiveData(testRunData);

  // 1. Write JSON Report
  const jsonPath = path.join(outputDir, "api-comparison-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(sanitizedData, null, 2), "utf8");

  // 2. Write HTML Report
  const htmlPath = path.join(outputDir, "api-comparison-report.html");
  const htmlContent = buildHtmlReport(sanitizedData);
  fs.writeFileSync(htmlPath, htmlContent, "utf8");

  // 3. Write Excel (.xlsx) Report with side-by-side comparison
  const excelPath = path.join(outputDir, "api-comparison-report.xlsx");
  await generateExcelReport(sanitizedData, excelPath);

  return { htmlPath, jsonPath, excelPath };
}

/**
 * Builds the interactive single-file HTML report.
 * @param {object} data
 * @returns {string}
 */
function buildHtmlReport(data) {
  const { summary, total, results = [], generatedAt, environment = {} } = data;
  const passCount = summary.PASS || 0;
  const failCount = summary.FAIL || 0;
  const errorCount = summary.ERROR || 0;
  const skippedCount = summary.SKIPPED || 0;
  const passRate = total > 0 ? ((passCount / (total - skippedCount || 1)) * 100).toFixed(1) : "0.0";

  // Collect modules
  const modules = [...new Set(results.map(r => r.module || "General"))].sort();

  // Pre-render rows with JSON payload for rich client-side interactivity
  const renderedRows = results.map((r, idx) => {
    const statusClass = `badge-${r.status.toLowerCase()}`;
    const methodClass = `method-${r.method.toLowerCase()}`;
    const diffCount = r.differences ? r.differences.length : 0;
    const oldStatus = r.oldStatus !== undefined && r.oldStatus !== null ? r.oldStatus : "-";
    const newStatus = r.newStatus !== undefined && r.newStatus !== null ? r.newStatus : "-";
    const oldDuration = r.oldDurationMs !== undefined ? `${r.oldDurationMs}ms` : "-";
    const newDuration = r.newDurationMs !== undefined ? `${r.newDurationMs}ms` : "-";

    const payloadJson = escapeHtml(JSON.stringify(r));

    return `
      <tr class="result-row" data-id="${idx}" data-status="${escapeHtml(r.status)}" data-module="${escapeHtml(r.module || 'General')}" data-method="${escapeHtml(r.method)}" data-name="${escapeHtml(r.name)}">
        <td class="text-center font-mono text-muted">${idx + 1}</td>
        <td>
          <span class="method-tag ${methodClass}">${escapeHtml(r.method)}</span>
        </td>
        <td>
          <div class="font-semibold text-main">${escapeHtml(r.name)}</div>
          <div class="text-xs text-muted font-mono truncate-path" title="${escapeHtml(r.oldPath)} &rarr; ${escapeHtml(r.newPath)}">
            ${escapeHtml(r.oldPath)} &rarr; ${escapeHtml(r.newPath)}
          </div>
        </td>
        <td><span class="module-pill">${escapeHtml(r.module || "General")}</span></td>
        <td>
          <span class="status-badge ${statusClass}">
            <span class="status-dot"></span>
            ${escapeHtml(r.status)}
          </span>
        </td>
        <td class="text-center font-mono">
          <span class="${r.oldStatus >= 400 ? 'text-warning' : 'text-success'}">${escapeHtml(oldStatus)}</span> / 
          <span class="${r.newStatus >= 400 ? 'text-warning' : 'text-success'}">${escapeHtml(newStatus)}</span>
        </td>
        <td class="text-center font-mono text-xs text-muted">
          ${escapeHtml(oldDuration)} / ${escapeHtml(newDuration)}
        </td>
        <td class="text-center">
          ${diffCount > 0 
            ? `<span class="diff-badge">${diffCount} diff${diffCount > 1 ? 's' : ''}</span>`
            : (r.status === "PASS" ? `<span class="text-success text-xs font-semibold">Matched</span>` : `<span class="text-muted text-xs">-</span>`)}
        </td>
        <td class="text-right">
          <button class="btn-action" onclick="toggleDetails(${idx})">
            Details <span class="arrow-icon" id="arrow-${idx}">▼</span>
          </button>
        </td>
      </tr>
      <tr class="details-row hidden" id="details-${idx}">
        <td colspan="9" class="details-cell">
          <div class="details-content" id="details-body-${idx}">
            <!-- Loaded on-demand or parsed from data -->
            <script>
              window.__DATA_${idx} = ${JSON.stringify(r)};
            </script>
          </div>
        </td>
      </tr>
    `;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Migration Regression Test Report</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-card: #1e293b;
      --bg-hover: #334155;
      --border-color: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --color-pass: #10b981;
      --color-pass-bg: rgba(16, 185, 129, 0.15);
      --color-fail: #ef4444;
      --color-fail-bg: rgba(239, 68, 68, 0.15);
      --color-error: #f59e0b;
      --color-error-bg: rgba(245, 158, 11, 0.15);
      --color-skipped: #64748b;
      --color-skipped-bg: rgba(100, 116, 139, 0.2);
      --accent: #38bdf8;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.5;
      padding: 24px;
    }

    .container { max-width: 1400px; margin: 0 auto; }

    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header-title h1 {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-title p {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .header-env {
      display: flex;
      gap: 12px;
      font-size: 12px;
      background: var(--bg-secondary);
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
    }
    .env-item { display: flex; flex-direction: column; }
    .env-label { color: var(--text-muted); font-size: 10px; text-transform: uppercase; font-weight: 600; }
    .env-val { font-family: var(--font-mono); color: var(--accent); }

    /* KPI Summary Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }
    .kpi-card::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0; height: 3px;
      background: var(--card-accent, var(--accent));
    }
    .kpi-card.pass { --card-accent: var(--color-pass); }
    .kpi-card.fail { --card-accent: var(--color-fail); }
    .kpi-card.error { --card-accent: var(--color-error); }
    .kpi-card.skipped { --card-accent: var(--color-skipped); }
    .kpi-label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); }
    .kpi-value { font-size: 28px; font-weight: 700; margin: 6px 0; color: #fff; }
    .kpi-sub { font-size: 11px; color: var(--text-muted); }

    /* Filters Bar */
    .controls-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .search-box {
      flex: 1;
      min-width: 280px;
      position: relative;
    }
    .search-input {
      width: 100%;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 14px 10px 36px;
      color: var(--text-main);
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }
    .filter-pills { display: flex; gap: 8px; flex-wrap: wrap; }
    .filter-btn {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-btn:hover { background: var(--bg-hover); color: #fff; }
    .filter-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #0f172a;
    }
    .module-select {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }

    /* Table */
    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th {
      background: #162032;
      color: var(--text-muted);
      font-weight: 600;
      padding: 12px 16px;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border-color);
    }
    td { padding: 14px 16px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
    tbody tr:hover { background: rgba(51, 65, 85, 0.4); }

    /* Method Tags */
    .method-tag {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-block;
      text-align: center;
      min-width: 52px;
    }
    .method-get { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
    .method-post { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
    .method-put { background: rgba(251, 146, 60, 0.2); color: #fb923c; }
    .method-delete { background: rgba(248, 113, 113, 0.2); color: #f87171; }

    /* Status Badges */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; }
    .badge-pass { background: var(--color-pass-bg); color: var(--color-pass); }
    .badge-pass .status-dot { background: var(--color-pass); }
    .badge-fail { background: var(--color-fail-bg); color: var(--color-fail); }
    .badge-fail .status-dot { background: var(--color-fail); }
    .badge-error { background: var(--color-error-bg); color: var(--color-error); }
    .badge-error .status-dot { background: var(--color-error); }
    .badge-skipped { background: var(--color-skipped-bg); color: var(--text-muted); }
    .badge-skipped .status-dot { background: var(--text-muted); }

    .module-pill {
      font-size: 11px;
      background: rgba(148, 163, 184, 0.12);
      color: var(--text-muted);
      padding: 3px 8px;
      border-radius: 12px;
      display: inline-block;
    }
    .diff-badge {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .btn-action {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn-action:hover { background: var(--bg-hover); }
    .arrow-icon { font-size: 9px; transition: transform 0.2s; }
    .arrow-icon.open { transform: rotate(180deg); }

    .btn-download-excel {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      padding: 9px 16px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
      transition: all 0.2s ease;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .btn-download-excel:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4);
      color: #ffffff;
    }

    /* Details Drawer */
    .details-row.hidden { display: none; }
    .details-cell {
      background: #0b1120;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-color);
    }
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 16px;
    }
    @media (max-width: 900px) {
      .details-grid { grid-template-columns: 1fr; }
    }
    .details-panel {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 14px;
    }
    .panel-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .meta-list { list-style: none; font-size: 12px; margin-bottom: 8px; }
    .meta-list li { margin-bottom: 4px; display: flex; gap: 8px; }
    .meta-k { color: var(--text-muted); min-width: 80px; }
    .meta-v { font-family: var(--font-mono); color: #fff; word-break: break-all; }

    /* Differences list */
    .diff-table {
      width: 100%;
      margin-top: 12px;
      border-collapse: collapse;
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .diff-table th { background: #1a2436; padding: 6px 10px; font-size: 10px; }
    .diff-table td { padding: 6px 10px; border-bottom: 1px solid #2d3b55; }
    .diff-type-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }
    .diff-type-STATUS_MISMATCH { background: #7f1d1d; color: #fca5a5; }
    .diff-type-MISSING_FIELD { background: #831843; color: #fbcfe8; }
    .diff-type-EXTRA_FIELD { background: #1e3a8a; color: #bfdbfe; }
    .diff-type-TYPE_MISMATCH { background: #78350f; color: #fde68a; }
    .diff-type-VALUE_MISMATCH { background: #701a75; color: #f5d0fe; }

    pre.code-view {
      background: #070d17;
      padding: 10px;
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: #cbd5e1;
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
      border: 1px solid #1e293b;
    }

    /* Helper Utilities */
    .font-mono { font-family: var(--font-mono); }
    .font-semibold { font-weight: 600; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-muted { color: var(--text-muted); }
    .text-main { color: var(--text-main); }
    .text-success { color: var(--color-pass); }
    .text-warning { color: var(--color-error); }
    .text-danger { color: var(--color-fail); }
    .text-xs { font-size: 11px; }
    .truncate-path { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    footer {
      margin-top: 32px;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      border-top: 1px solid var(--border-color);
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title">
        <h1>🚀 API Migration Regression Report</h1>
        <p>Execution completed on <strong>${escapeHtml(generatedAt)}</strong></p>
      </div>
      <div class="header-env">
        <div class="env-item">
          <span class="env-label">Old Base URL</span>
          <span class="env-val">${escapeHtml(environment.oldBaseUrl || "Not Configured")}</span>
        </div>
        <div class="env-item">
          <span class="env-label">New Base URL</span>
          <span class="env-val">${escapeHtml(environment.newBaseUrl || "Not Configured")}</span>
        </div>
        <div class="env-item">
          <span class="env-label">Mutations Allowed</span>
          <span class="env-val" style="color: ${environment.runMutations ? 'var(--color-pass)' : 'var(--text-muted)'}">${environment.runMutations ? 'TRUE' : 'FALSE'}</span>
        </div>
      </div>
      <div class="header-actions">
        <a href="./api-comparison-report.xlsx" download="api-comparison-report.xlsx" class="btn-download-excel">
          📥 Download Excel (.xlsx)
        </a>
      </div>
    </header>

    <!-- KPI Summary Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Endpoints</div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-sub">${total - skippedCount} executed, ${skippedCount} skipped</div>
      </div>
      <div class="kpi-card pass">
        <div class="kpi-label">Passed</div>
        <div class="kpi-value" style="color: var(--color-pass)">${passCount}</div>
        <div class="kpi-sub">Pass Rate: <strong>${passRate}%</strong></div>
      </div>
      <div class="kpi-card fail">
        <div class="kpi-label">Failed</div>
        <div class="kpi-value" style="color: var(--color-fail)">${failCount}</div>
        <div class="kpi-sub">Response/Status discrepancies</div>
      </div>
      <div class="kpi-card error">
        <div class="kpi-label">Errors</div>
        <div class="kpi-value" style="color: var(--color-error)">${errorCount}</div>
        <div class="kpi-sub">Network or connection failures</div>
      </div>
      <div class="kpi-card skipped">
        <div class="kpi-label">Skipped</div>
        <div class="kpi-value" style="color: var(--text-muted)">${skippedCount}</div>
        <div class="kpi-sub">Disabled or mutation protected</div>
      </div>
    </div>

    <!-- Filters and Search -->
    <div class="controls-bar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" id="searchInput" class="search-input" placeholder="Search by name, path, method, or error..." oninput="applyFilters()">
      </div>
      <div class="filter-pills">
        <button class="filter-btn active" data-status="ALL" onclick="setStatusFilter('ALL')">All (${total})</button>
        <button class="filter-btn" data-status="PASS" onclick="setStatusFilter('PASS')">Pass (${passCount})</button>
        <button class="filter-btn" data-status="FAIL" onclick="setStatusFilter('FAIL')">Fail (${failCount})</button>
        <button class="filter-btn" data-status="ERROR" onclick="setStatusFilter('ERROR')">Error (${errorCount})</button>
        <button class="filter-btn" data-status="SKIPPED" onclick="setStatusFilter('SKIPPED')">Skipped (${skippedCount})</button>
      </div>
      <select id="moduleSelect" class="module-select" onchange="applyFilters()">
        <option value="ALL">All Modules</option>
        ${modules.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}
      </select>
    </div>

    <!-- Results Table -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th class="text-center" style="width: 40px">#</th>
            <th style="width: 80px">Method</th>
            <th>Endpoint Name & Route Mapping</th>
            <th style="width: 140px">Module</th>
            <th style="width: 100px">Status</th>
            <th class="text-center" style="width: 130px">Status (Old/New)</th>
            <th class="text-center" style="width: 120px">Duration</th>
            <th class="text-center" style="width: 90px">Differences</th>
            <th class="text-right" style="width: 90px">Action</th>
          </tr>
        </thead>
        <tbody id="resultsTableBody">
          ${renderedRows}
        </tbody>
      </table>
    </div>

    <footer>
      Automated API Migration Regression Testing Framework &bull; Designed for high-reliability contract verification
    </footer>
  </div>

  <script>
    let currentStatusFilter = "ALL";

    function setStatusFilter(status) {
      currentStatusFilter = status;
      document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-status") === status);
      });
      applyFilters();
    }

    function applyFilters() {
      const search = (document.getElementById("searchInput").value || "").toLowerCase().trim();
      const selectedModule = document.getElementById("moduleSelect").value;
      const rows = document.querySelectorAll(".result-row");

      rows.forEach(row => {
        const id = row.getAttribute("data-id");
        const status = row.getAttribute("data-status");
        const module = row.getAttribute("data-module");
        const method = row.getAttribute("data-method").toLowerCase();
        const name = row.getAttribute("data-name").toLowerCase();
        const textContent = row.textContent.toLowerCase();

        const matchStatus = (currentStatusFilter === "ALL" || status === currentStatusFilter);
        const matchModule = (selectedModule === "ALL" || module === selectedModule);
        const matchSearch = (!search || textContent.includes(search) || method.includes(search) || name.includes(search));

        const visible = matchStatus && matchModule && matchSearch;
        row.style.display = visible ? "" : "none";

        // Keep details row hidden if parent row is hidden
        const detailsRow = document.getElementById("details-" + id);
        if (detailsRow && !visible) {
          detailsRow.classList.add("hidden");
          const arrow = document.getElementById("arrow-" + id);
          if (arrow) arrow.classList.remove("open");
        }
      });
    }

    function toggleDetails(idx) {
      const detailsRow = document.getElementById("details-" + idx);
      const arrow = document.getElementById("arrow-" + idx);
      const body = document.getElementById("details-body-" + idx);

      const isHidden = detailsRow.classList.contains("hidden");
      if (isHidden) {
        detailsRow.classList.remove("hidden");
        arrow.classList.add("open");
        renderDetailsContent(idx, body);
      } else {
        detailsRow.classList.add("hidden");
        arrow.classList.remove("open");
      }
    }

    function renderDetailsContent(idx, container) {
      const data = window["__DATA_" + idx];
      if (!data) return;

      let differencesHtml = "";
      if (data.differences && data.differences.length > 0) {
        const diffRows = data.differences.map(d => \`
          <tr>
            <td><span class="diff-type-badge diff-type-\${d.type}">\${escapeText(d.type)}</span></td>
            <td><code>\${escapeText(d.path)}</code></td>
            <td class="text-danger"><pre style="margin:0;font-size:11px">\${escapeText(JSON.stringify(d.oldValue, null, 2))}</pre></td>
            <td class="text-success"><pre style="margin:0;font-size:11px">\${escapeText(JSON.stringify(d.newValue, null, 2))}</pre></td>
          </tr>
        \`).join("");

        differencesHtml = \`
          <div style="margin-top: 16px;">
            <div class="panel-title">Detected Differences (\${data.differences.length})</div>
            <table class="diff-table">
              <thead>
                <tr>
                  <th style="width: 140px">Type</th>
                  <th>Path</th>
                  <th>Old API Value</th>
                  <th>New API Value</th>
                </tr>
              </thead>
              <tbody>\${diffRows}</tbody>
            </table>
          </div>
        \`;
      } else if (data.status === "PASS") {
        differencesHtml = \`
          <div style="margin-top: 16px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.3);">
            <span class="text-success font-semibold">✓ Exact Match:</span> Old and New API responses produced equivalent HTTP status and schema values.
          </div>
        \`;
      } else if (data.note) {
        differencesHtml = \`
          <div style="margin-top: 16px; padding: 12px; background: rgba(100, 116, 139, 0.1); border-radius: 6px; border: 1px solid rgba(100, 116, 139, 0.3);">
            <strong>Reason / Note:</strong> \${escapeText(data.note)}
          </div>
        \`;
      }

      container.innerHTML = \`
        <div class="details-grid">
          <div class="details-panel">
            <div class="panel-title">Old API Execution Details</div>
            <ul class="meta-list">
              <li><span class="meta-k">URL:</span> <span class="meta-v">\${escapeText(data.oldUrl || data.oldPath || "-")}</span></li>
              <li><span class="meta-k">Status:</span> <span class="meta-v">\${escapeText(data.oldStatus || "-")}</span></li>
              <li><span class="meta-k">Latency:</span> <span class="meta-v">\${data.oldDurationMs !== undefined ? data.oldDurationMs + ' ms' : '-'}</span></li>
            </ul>
            <div class="panel-title" style="margin-top: 10px; font-size: 11px;">Response Body</div>
            <pre class="code-view">\${escapeText(JSON.stringify(data.oldBody ?? (data.oldResult?.body || "-"), null, 2))}</pre>
          </div>

          <div class="details-panel">
            <div class="panel-title">New API Execution Details</div>
            <ul class="meta-list">
              <li><span class="meta-k">URL:</span> <span class="meta-v">\${escapeText(data.newUrl || data.newPath || "-")}</span></li>
              <li><span class="meta-k">Status:</span> <span class="meta-v">\${escapeText(data.newStatus || "-")}</span></li>
              <li><span class="meta-k">Latency:</span> <span class="meta-v">\${data.newDurationMs !== undefined ? data.newDurationMs + ' ms' : '-'}</span></li>
            </ul>
            <div class="panel-title" style="margin-top: 10px; font-size: 11px;">Response Body</div>
            <pre class="code-view">\${escapeText(JSON.stringify(data.newBody ?? (data.newResult?.body || "-"), null, 2))}</pre>
          </div>
        </div>
        \${differencesHtml}
      \`;
    }

    function escapeText(str) {
      if (str === null || str === undefined) return "";
      return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c]));
    }
  </script>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  generateReports,
  buildHtmlReport
};
