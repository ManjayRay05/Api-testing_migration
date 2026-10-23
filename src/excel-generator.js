/**
 * Excel Report Generator Module
 * Generates an executive-grade, beautifully formatted Microsoft Excel (.xlsx) workbook
 * containing detailed side-by-side comparison of Old API vs New API:
 * - Request Headers & Request Body (Side-by-Side)
 * - HTTP Status & Latency (Side-by-Side)
 * - Response Headers & Response Body (Side-by-Side)
 * - Color-coded PASS/FAIL/ERROR/SKIPPED status
 * - Dedicated "Discrepancies & Defects" sheet for easy sharing
 */

const ExcelJS = require("exceljs");
const path = require("path");

/**
 * Formats arbitrary data (objects, arrays, strings) into readable string for Excel cell.
 * @param {any} val
 * @returns {string}
 */
function formatCellContent(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/**
 * Generates the Excel comparison report workbook.
 * @param {object} testData
 * @param {string} outputPath
 * @returns {Promise<string>}
 */
async function generateExcelReport(testData, outputPath = path.join(__dirname, "..", "reports", "api-comparison-report.xlsx")) {
  const { summary = {}, total = 0, results = [], generatedAt, environment = {} } = testData;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "API Migration Regression Testing Framework";
  workbook.created = new Date();

  // Define Colors
  const COLOR_HEADER_DARK = "FF0F172A"; // Dark Slate
  const COLOR_HEADER_OLD = "FF1E3A8A";  // Deep Blue
  const COLOR_HEADER_NEW = "FF065F46";  // Deep Emerald / Green
  const COLOR_HEADER_DIFF = "FF831843"; // Deep Rose / Pink
  const COLOR_WHITE = "FFFFFFFF";

  const STYLE_HEADER_BASE = {
    font: { name: "Segoe UI", size: 10, bold: true, color: { argb: COLOR_WHITE } },
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF94A3B8" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } }
    }
  };

  // =========================================================================
  // SHEET 1: EXECUTIVE SUMMARY
  // =========================================================================
  const summarySheet = workbook.addWorksheet("Executive Summary", {
    views: [{ showGridLines: true }]
  });

  summarySheet.columns = [
    { width: 4 },
    { width: 28 },
    { width: 24 },
    { width: 24 },
    { width: 24 }
  ];

  // Title Banner
  summarySheet.mergeCells("B2:E2");
  const titleCell = summarySheet.getCell("B2");
  titleCell.value = "API MIGRATION REGRESSION TEST REPORT";
  titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: COLOR_WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_DARK } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  summarySheet.getRow(2).height = 40;

  // Environment Sub-banner
  summarySheet.mergeCells("B3:E3");
  const subCell = summarySheet.getCell("B3");
  subCell.value = `Execution Completed: ${generatedAt || new Date().toISOString()}`;
  subCell.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: "FF475569" } };
  subCell.alignment = { vertical: "middle", horizontal: "center" };
  summarySheet.getRow(3).height = 24;

  // Metadata Table
  const metaRows = [
    ["Old API Base URL", environment.oldBaseUrl || "Not Configured"],
    ["New API Base URL", environment.newBaseUrl || "Not Configured"],
    ["Mutation Testing Allowed", environment.runMutations ? "YES (Write Operations Enabled)" : "NO (Safe Read-Only Mode)"],
    ["Total Configured Endpoints", total]
  ];

  let currentMetaRow = 5;
  metaRows.forEach(([lbl, val]) => {
    summarySheet.getCell(`B${currentMetaRow}`).value = lbl;
    summarySheet.getCell(`B${currentMetaRow}`).font = { bold: true, name: "Segoe UI", size: 10 };
    summarySheet.getCell(`B${currentMetaRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

    summarySheet.mergeCells(`C${currentMetaRow}:E${currentMetaRow}`);
    const vCell = summarySheet.getCell(`C${currentMetaRow}`);
    vCell.value = val;
    vCell.font = { name: "Segoe UI", size: 10 };
    currentMetaRow++;
  });

  // KPI Metrics Table
  const kpiStartRow = currentMetaRow + 2;
  summarySheet.mergeCells(`B${kpiStartRow}:E${kpiStartRow}`);
  const kpiHeader = summarySheet.getCell(`B${kpiStartRow}`);
  kpiHeader.value = "TEST EXECUTION KPI SUMMARY";
  kpiHeader.font = { bold: true, color: { argb: COLOR_WHITE }, name: "Segoe UI", size: 11 };
  kpiHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  kpiHeader.alignment = { vertical: "middle", horizontal: "center" };
  summarySheet.getRow(kpiStartRow).height = 26;

  const kpiTableHeaderRow = kpiStartRow + 1;
  summarySheet.getCell(`B${kpiTableHeaderRow}`).value = "Status";
  summarySheet.getCell(`C${kpiTableHeaderRow}`).value = "Count";
  summarySheet.getCell(`D${kpiTableHeaderRow}`).value = "Percentage";
  summarySheet.getCell(`E${kpiTableHeaderRow}`).value = "Evaluation";
  ["B", "C", "D", "E"].forEach(col => {
    const c = summarySheet.getCell(`${col}${kpiTableHeaderRow}`);
    c.font = { bold: true, name: "Segoe UI", size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    c.alignment = { horizontal: "center" };
  });

  const passCount = summary.PASS || 0;
  const failCount = summary.FAIL || 0;
  const errorCount = summary.ERROR || 0;
  const skippedCount = summary.SKIPPED || 0;
  const executedCount = total - skippedCount;
  const passRate = executedCount > 0 ? ((passCount / executedCount) * 100).toFixed(1) : "0.0";

  const kpiData = [
    { label: "PASS", count: passCount, pct: total ? `${((passCount / total) * 100).toFixed(1)}%` : "0%", eval: "Responses & schema matched", color: "FFDCFCE7", fontColor: "FF166534" },
    { label: "FAIL", count: failCount, pct: total ? `${((failCount / total) * 100).toFixed(1)}%` : "0%", eval: "Contract discrepancies detected", color: "FFFEE2E2", fontColor: "FF991B1B" },
    { label: "ERROR", count: errorCount, pct: total ? `${((errorCount / total) * 100).toFixed(1)}%` : "0%", eval: "Transport / Network connection failures", color: "FFFEF3C7", fontColor: "FF92400E" },
    { label: "SKIPPED", count: skippedCount, pct: total ? `${((skippedCount / total) * 100).toFixed(1)}%` : "0%", eval: "Protected mutations or disabled", color: "FFF1F5F9", fontColor: "FF475569" },
    { label: "TOTAL", count: total, pct: "100%", eval: `Pass Rate of Executed Tests: ${passRate}%`, color: "FFE2E8F0", fontColor: "FF0F172A" }
  ];

  kpiData.forEach((item, idx) => {
    const rowNum = kpiTableHeaderRow + 1 + idx;
    summarySheet.getCell(`B${rowNum}`).value = item.label;
    summarySheet.getCell(`B${rowNum}`).font = { bold: true, color: { argb: item.fontColor } };
    summarySheet.getCell(`B${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: item.color } };

    summarySheet.getCell(`C${rowNum}`).value = item.count;
    summarySheet.getCell(`C${rowNum}`).alignment = { horizontal: "center" };

    summarySheet.getCell(`D${rowNum}`).value = item.pct;
    summarySheet.getCell(`D${rowNum}`).alignment = { horizontal: "center" };

    summarySheet.getCell(`E${rowNum}`).value = item.eval;
  });

  // =========================================================================
  // SHEET 2: SIDE-BY-SIDE DETAILED COMPARISON
  // =========================================================================
  const detailSheet = workbook.addWorksheet("Side-by-Side Comparison", {
    views: [{ state: "frozen", xSplit: 5, ySplit: 2, showGridLines: true }]
  });

  detailSheet.columns = [
    { header: "#", key: "index", width: 6 },
    { header: "Module", key: "module", width: 18 },
    { header: "Endpoint Name", key: "name", width: 24 },
    { header: "Method", key: "method", width: 10 },
    { header: "Result Status", key: "status", width: 14 },
    { header: "Differences Summary", key: "note", width: 36 },
    { header: "Diffs", key: "diffCount", width: 8 },

    // Old API Side
    { header: "Old Route / URL", key: "oldUrl", width: 32 },
    { header: "Old HTTP", key: "oldStatus", width: 10 },
    { header: "Old ms", key: "oldDurationMs", width: 10 },
    { header: "Old Request Headers", key: "oldReqHeaders", width: 32 },
    { header: "Old Request Body", key: "oldReqBody", width: 32 },
    { header: "Old Response Headers", key: "oldResHeaders", width: 32 },
    { header: "Old Response Body", key: "oldResBody", width: 45 },

    // New API Side
    { header: "New Route / URL", key: "newUrl", width: 32 },
    { header: "New HTTP", key: "newStatus", width: 10 },
    { header: "New ms", key: "newDurationMs", width: 10 },
    { header: "New Request Headers", key: "newReqHeaders", width: 32 },
    { header: "New Request Body", key: "newReqBody", width: 32 },
    { header: "New Response Headers", key: "newResHeaders", width: 32 },
    { header: "New Response Body", key: "newResBody", width: 45 },

    // Performance & Health
    { header: "Status Match", key: "statusMatch", width: 14 },
    { header: "Latency Delta", key: "latencyDelta", width: 14 }
  ];

  // Group Header Row (Row 1)
  detailSheet.spliceRows(1, 0, []);
  detailSheet.getRow(1).height = 26;
  detailSheet.getRow(2).height = 24;

  detailSheet.mergeCells("A1:G1");
  detailSheet.getCell("A1").value = "GENERAL ENDPOINT METRICS";
  detailSheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_DARK } };
  detailSheet.getCell("A1").font = { name: "Segoe UI", size: 10, bold: true, color: { argb: COLOR_WHITE } };
  detailSheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };

  detailSheet.mergeCells("H1:N1");
  detailSheet.getCell("H1").value = "◄ OLD API (LEGACY) SPECIFICATION & RESPONSE ►";
  detailSheet.getCell("H1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_OLD } };
  detailSheet.getCell("H1").font = { name: "Segoe UI", size: 10, bold: true, color: { argb: COLOR_WHITE } };
  detailSheet.getCell("H1").alignment = { vertical: "middle", horizontal: "center" };

  detailSheet.mergeCells("O1:U1");
  detailSheet.getCell("O1").value = "◄ NEW API (MIGRATED) SPECIFICATION & RESPONSE ►";
  detailSheet.getCell("O1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_NEW } };
  detailSheet.getCell("O1").font = { name: "Segoe UI", size: 10, bold: true, color: { argb: COLOR_WHITE } };
  detailSheet.getCell("O1").alignment = { vertical: "middle", horizontal: "center" };

  detailSheet.mergeCells("V1:W1");
  detailSheet.getCell("V1").value = "VERIFICATION";
  detailSheet.getCell("V1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  detailSheet.getCell("V1").font = { name: "Segoe UI", size: 10, bold: true, color: { argb: COLOR_WHITE } };
  detailSheet.getCell("V1").alignment = { vertical: "middle", horizontal: "center" };

  // Subheader Row Styling (Row 2)
  for (let c = 1; c <= 23; c++) {
    const cell = detailSheet.getRow(2).getCell(c);
    let bgColor = COLOR_HEADER_DARK;
    if (c >= 8 && c <= 14) bgColor = "FF2563EB"; // Lighter Blue for Old sub-headers
    else if (c >= 15 && c <= 21) bgColor = "FF059669"; // Lighter Green for New sub-headers
    else if (c >= 22) bgColor = "FF475569";

    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: COLOR_WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: "FF94A3B8" } } };
  }

  // Populate Data Rows
  results.forEach((r, idx) => {
    const isOldHttpPass = r.oldStatus && r.oldStatus < 400;
    const isNewHttpPass = r.newStatus && r.newStatus < 400;
    const statusMatchVal = (r.oldStatus !== undefined && r.newStatus !== undefined)
      ? (r.oldStatus === r.newStatus ? "MATCH" : "MISMATCH")
      : "-";

    const latencyDeltaVal = (r.newDurationMs !== undefined && r.oldDurationMs !== undefined)
      ? `${r.newDurationMs - r.oldDurationMs} ms`
      : "-";

    const row = detailSheet.addRow({
      index: idx + 1,
      module: r.module || "General",
      name: r.name,
      method: r.method,
      status: r.status,
      note: r.differences && r.differences.length > 0
        ? r.differences.map(d => `[${d.type}] ${d.path}`).join("; ")
        : (r.note || (r.status === "PASS" ? "Exact match" : "")),
      diffCount: r.differences ? r.differences.length : 0,

      // Old API
      oldUrl: r.oldUrl || r.oldPath || "-",
      oldStatus: r.oldStatus ?? "-",
      oldDurationMs: r.oldDurationMs !== undefined ? `${r.oldDurationMs}` : "-",
      oldReqHeaders: formatCellContent(r.oldRequestHeaders || r.oldResult?.requestSummary?.headers || {}),
      oldReqBody: formatCellContent(r.oldRequestBody ?? r.oldResult?.requestSummary?.body ?? ""),
      oldResHeaders: formatCellContent(r.oldResponseHeaders || r.oldResult?.headers || {}),
      oldResBody: formatCellContent(r.oldBody ?? r.oldResult?.body ?? ""),

      // New API
      newUrl: r.newUrl || r.newPath || "-",
      newStatus: r.newStatus ?? "-",
      newDurationMs: r.newDurationMs !== undefined ? `${r.newDurationMs}` : "-",
      newReqHeaders: formatCellContent(r.newRequestHeaders || r.newResult?.requestSummary?.headers || {}),
      newReqBody: formatCellContent(r.newRequestBody ?? r.newResult?.requestSummary?.body ?? ""),
      newResHeaders: formatCellContent(r.newResponseHeaders || r.newResult?.headers || {}),
      newResBody: formatCellContent(r.newBody ?? r.newResult?.body ?? ""),

      // Comparison
      statusMatch: statusMatchVal,
      latencyDelta: latencyDeltaVal
    });

    row.height = 36;
    row.alignment = { vertical: "top", wrapText: true };
    row.font = { name: "Segoe UI", size: 9 };

    // Format Status Cell (Col 5)
    const statusCell = row.getCell(5);
    statusCell.alignment = { vertical: "middle", horizontal: "center" };
    if (r.status === "PASS") {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
      statusCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF166534" } };
    } else if (r.status === "FAIL") {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      statusCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF991B1B" } };
    } else if (r.status === "ERROR") {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      statusCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF92400E" } };
    } else {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      statusCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF475569" } };
    }

    // Format Status Match Cell (Col 22)
    const matchCell = row.getCell(22);
    matchCell.alignment = { vertical: "middle", horizontal: "center" };
    if (statusMatchVal === "MISMATCH") {
      matchCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      matchCell.font = { bold: true, color: { argb: "FF991B1B" } };
    }
  });

  // =========================================================================
  // SHEET 3: DISCREPANCIES & DEFECT LOG
  // =========================================================================
  const defectSheet = workbook.addWorksheet("Discrepancies & Defects", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }]
  });

  defectSheet.columns = [
    { header: "Endpoint", key: "endpoint", width: 22 },
    { header: "Module", key: "module", width: 18 },
    { header: "Method", key: "method", width: 10 },
    { header: "Discrepancy Type", key: "type", width: 22 },
    { header: "JSON Path", key: "path", width: 26 },
    { header: "Old API Value", key: "oldVal", width: 35 },
    { header: "New API Value", key: "newVal", width: 35 },
    { header: "Detailed Explanation", key: "msg", width: 50 },
    { header: "HTTP Status (Old/New)", key: "httpStatus", width: 22 }
  ];

  // Header row styling
  defectSheet.getRow(1).height = 26;
  for (let c = 1; c <= 9; c++) {
    const cell = defectSheet.getRow(1).getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_DIFF } };
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: COLOR_WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF94A3B8" } } };
  }

  let totalDefectsAdded = 0;
  results.forEach(r => {
    if (r.differences && r.differences.length > 0) {
      r.differences.forEach(d => {
        totalDefectsAdded++;
        const row = defectSheet.addRow({
          endpoint: r.name,
          module: r.module || "General",
          method: r.method,
          type: d.type,
          path: d.path,
          oldVal: formatCellContent(d.oldValue),
          newVal: formatCellContent(d.newValue),
          msg: d.message || "",
          httpStatus: `${r.oldStatus ?? "-"} / ${r.newStatus ?? "-"}`
        });

        row.height = 28;
        row.alignment = { vertical: "top", wrapText: true };
        row.font = { name: "Segoe UI", size: 9 };

        const typeCell = row.getCell(4);
        typeCell.font = { bold: true, name: "Segoe UI", size: 9 };
        if (d.type === "STATUS_MISMATCH") {
          typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          typeCell.font = { bold: true, color: { argb: "FF991B1B" } };
        } else if (d.type === "MISSING_FIELD") {
          typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE7F3" } };
          typeCell.font = { bold: true, color: { argb: "FF831843" } };
        } else if (d.type === "EXTRA_FIELD") {
          typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
          typeCell.font = { bold: true, color: { argb: "FF1E40AF" } };
        } else if (d.type === "TYPE_MISMATCH") {
          typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
          typeCell.font = { bold: true, color: { argb: "FF92400E" } };
        }
      });
    }
  });

  if (totalDefectsAdded === 0) {
    const row = defectSheet.addRow({
      endpoint: "N/A",
      module: "N/A",
      method: "N/A",
      type: "NONE",
      path: "-",
      oldVal: "-",
      newVal: "-",
      msg: "Congratulations! Zero discrepancies detected across all executed API tests.",
      httpStatus: "-"
    });
    row.getCell(8).font = { bold: true, color: { argb: "FF166534" } };
  }

  // Write out file
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

module.exports = {
  generateExcelReport
};
