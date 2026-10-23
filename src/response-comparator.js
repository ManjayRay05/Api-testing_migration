/**
 * Response Comparator Module
 * Performs deep, recursive comparison of HTTP responses (status, headers, and body).
 * Supports:
 * - Dynamic field exclusions (ignorePaths)
 * - Property renaming mappings (responseFieldMappings)
 * - Numeric tolerances (numericTolerance)
 * - Configurable array ordering (ignoreArrayOrder)
 * - Market data comparison strategies
 */

/**
 * Checks if a given JSON path matches any pattern in the ignored paths list.
 * Supports exact key, dot-paths (data.timestamp), wildcards (items[*].id or *.timestamp), and $ root notation.
 * @param {string} currentPath e.g. "$.data.timestamp"
 * @param {string} key e.g. "timestamp"
 * @param {string[]} ignoredPatterns
 * @returns {boolean}
 */
function isPathIgnored(currentPath, key, ignoredPatterns = []) {
  if (!ignoredPatterns || !Array.isArray(ignoredPatterns) || ignoredPatterns.length === 0) {
    return false;
  }

  // Normalize path without leading "$."
  const cleanPath = currentPath.replace(/^\$\.?/, "");

  for (const pattern of ignoredPatterns) {
    const cleanPattern = pattern.replace(/^\$\.?/, "");

    // Exact key match (e.g. "timestamp")
    if (pattern === key || cleanPattern === key) return true;
    if (key && pattern.toLowerCase() === key.toLowerCase()) return true;

    // Exact path match (e.g. "data.timestamp")
    if (cleanPath === cleanPattern) return true;

    // Wildcard match (e.g. "*.timestamp" or "items[*].id")
    const regexPattern = "^" + cleanPattern
      .replace(/\[\*\]/g, "\\[\\d+\\]")
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*") + "$";

    if (new RegExp(regexPattern, "i").test(cleanPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves the mapped key name in the new API response if property was renamed.
 * @param {string} oldKey
 * @param {string} currentPath
 * @param {Record<string, string>} fieldMappings e.g. { "marketwatch_id": "symbol_list_id" }
 * @returns {string} The new key name to check in the new response
 */
function resolveMappedKey(oldKey, currentPath, fieldMappings = {}) {
  if (!fieldMappings || typeof fieldMappings !== "object") return oldKey;

  // Direct key mapping
  if (fieldMappings[oldKey]) return fieldMappings[oldKey];

  // Full path mapping e.g. "data.marketwatch_id" -> "data.symbol_list_id"
  const cleanPath = currentPath.replace(/^\$\.?/, "");
  if (fieldMappings[cleanPath]) {
    const target = fieldMappings[cleanPath];
    return target.includes(".") ? target.split(".").pop() : target;
  }

  return oldKey;
}

/**
 * Determines numeric tolerance for a specific path if configured.
 * @param {string} currentPath
 * @param {string} key
 * @param {number|Record<string, number>} numericTolerance
 * @returns {number|null}
 */
function getTolerance(currentPath, key, numericTolerance) {
  if (numericTolerance === undefined || numericTolerance === null) return null;
  if (typeof numericTolerance === "number") return numericTolerance;

  if (typeof numericTolerance === "object") {
    const cleanPath = currentPath.replace(/^\$\.?/, "");
    if (numericTolerance[cleanPath] !== undefined) return numericTolerance[cleanPath];
    if (numericTolerance[key] !== undefined) return numericTolerance[key];
  }

  return null;
}

/**
 * Checks if two numeric values match within allowed tolerance.
 * @param {number} a
 * @param {number} b
 * @param {number} tolerance
 * @returns {boolean}
 */
function numbersMatchWithTolerance(a, b, tolerance) {
  if (typeof a !== "number" || typeof b !== "number" || isNaN(a) || isNaN(b)) {
    return false;
  }
  return Math.abs(a - b) <= tolerance;
}

/**
 * Determines standard data type for strict type checking.
 * @param {any} v
 * @returns {string}
 */
function getDetailedType(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Deep recursive comparison between old and new response data.
 * @param {any} oldVal
 * @param {any} newVal
 * @param {string} currentPath
 * @param {object} options
 * @param {Array} outDifferences
 */
function recursiveDiff(oldVal, newVal, currentPath, options, outDifferences) {
  const {
    ignorePaths = [],
    fieldMappings = {},
    numericTolerance = null,
    ignoreArrayOrder = false,
    comparisonStrategy = "exact",
    stableFields = []
  } = options;

  // If strategy is "stable-fields-only" and we are at root object level, filter to stable fields
  if (comparisonStrategy === "stable-fields-only" && currentPath === "$" && typeof oldVal === "object" && oldVal !== null) {
    const filterToStable = (obj) => {
      if (!obj || typeof obj !== "object") return obj;
      const res = {};
      for (const f of stableFields) {
        if (f in obj) res[f] = obj[f];
      }
      return res;
    };
    oldVal = filterToStable(oldVal);
    newVal = filterToStable(newVal);
  }

  // Exact primitive or object identity equality
  if (Object.is(oldVal, newVal)) {
    return;
  }

  const oldType = getDetailedType(oldVal);
  const newType = getDetailedType(newVal);

  // Check type mismatch
  if (oldType !== newType) {
    // Check if tolerance applies to numbers vs numeric strings if permissible, otherwise flag type mismatch
    outDifferences.push({
      path: currentPath,
      type: "TYPE_MISMATCH",
      oldValue: oldVal,
      newValue: newVal,
      oldType,
      newType,
      message: `Type mismatch at ${currentPath}: Old is ${oldType} (${JSON.stringify(oldVal)}), New is ${newType} (${JSON.stringify(newVal)})`
    });
    return;
  }

  // Compare primitives
  if (oldType !== "object" && oldType !== "array") {
    if (oldType === "number") {
      const tol = getTolerance(currentPath, currentPath.split(".").pop(), numericTolerance);
      if (tol !== null && numbersMatchWithTolerance(oldVal, newVal, tol)) {
        // Tolerated match!
        return;
      }
    }

    outDifferences.push({
      path: currentPath,
      type: "VALUE_MISMATCH",
      oldValue: oldVal,
      newValue: newVal,
      message: `Value mismatch at ${currentPath}: Old="${oldVal}" vs New="${newVal}"`
    });
    return;
  }

  // Compare Arrays
  if (oldType === "array") {
    if (oldVal.length !== newVal.length) {
      outDifferences.push({
        path: `${currentPath}.length`,
        type: "ARRAY_LENGTH_MISMATCH",
        oldValue: oldVal.length,
        newValue: newVal.length,
        message: `Array length mismatch at ${currentPath}: Old has ${oldVal.length} items, New has ${newVal.length} items`
      });
    }

    if (ignoreArrayOrder) {
      // Unordered array comparison
      const newItemsRemaining = [...newVal];
      const unmatchedOld = [];

      for (let i = 0; i < oldVal.length; i++) {
        const oldItem = oldVal[i];
        let foundIndex = -1;

        for (let j = 0; j < newItemsRemaining.length; j++) {
          const tempDiffs = [];
          recursiveDiff(oldItem, newItemsRemaining[j], `${currentPath}[${i}]`, options, tempDiffs);
          if (tempDiffs.length === 0) {
            foundIndex = j;
            break;
          }
        }

        if (foundIndex !== -1) {
          newItemsRemaining.splice(foundIndex, 1);
        } else {
          unmatchedOld.push({ index: i, item: oldItem });
        }
      }

      for (const { index, item } of unmatchedOld) {
        outDifferences.push({
          path: `${currentPath}[${index}]`,
          type: "VALUE_MISMATCH",
          oldValue: item,
          newValue: "[unmatched]",
          message: `Array item at ${currentPath}[${index}] has no matching counterpart in New array`
        });
      }
      return;
    }

    // Ordered array comparison
    const maxLen = Math.min(oldVal.length, newVal.length);
    for (let i = 0; i < maxLen; i++) {
      recursiveDiff(oldVal[i], newVal[i], `${currentPath}[${i}]`, options, outDifferences);
    }
    return;
  }

  // Compare Objects
  if (oldType === "object") {
    const oldKeys = Object.keys(oldVal);
    const newKeys = new Set(Object.keys(newVal));

    // Track which new keys have been processed or mapped
    const processedNewKeys = new Set();

    for (const oldKey of oldKeys) {
      const childPath = currentPath === "$" ? `$.${oldKey}` : `${currentPath}.${oldKey}`;

      if (isPathIgnored(childPath, oldKey, ignorePaths)) {
        continue;
      }

      // Check if old key maps to a different key in new API
      const mappedNewKey = resolveMappedKey(oldKey, childPath, fieldMappings);

      if (!newKeys.has(mappedNewKey)) {
        outDifferences.push({
          path: childPath,
          type: "MISSING_FIELD",
          oldValue: oldVal[oldKey],
          newValue: "[missing]",
          message: `Field missing in New API at ${childPath} (mapped to '${mappedNewKey}')`
        });
      } else {
        processedNewKeys.add(mappedNewKey);
        recursiveDiff(oldVal[oldKey], newVal[mappedNewKey], childPath, options, outDifferences);
      }
    }

    // Find unexpected extra keys in New response
    for (const newKey of newKeys) {
      if (processedNewKeys.has(newKey)) continue;

      const childPath = currentPath === "$" ? `$.${newKey}` : `${currentPath}.${newKey}`;

      if (isPathIgnored(childPath, newKey, ignorePaths)) {
        continue;
      }

      outDifferences.push({
        path: childPath,
        type: "EXTRA_FIELD",
        oldValue: "[missing]",
        newValue: newVal[newKey],
        message: `Unexpected extra field in New API at ${childPath}`
      });
    }
  }
}

/**
 * Compares old and new HTTP responses comprehensively.
 * @param {object} oldResponse { status, headers, body, durationMs, url }
 * @param {object} newResponse { status, headers, body, durationMs, url }
 * @param {object} rules Endpoint-specific comparison rules
 * @returns {object} Comparison outcome
 */
function compareResponses(oldResponse, newResponse, rules = {}) {
  const differences = [];

  // 1. Compare HTTP status codes
  const statusMatch = oldResponse.status === newResponse.status;
  if (!statusMatch) {
    differences.push({
      path: "$status",
      type: "STATUS_MISMATCH",
      oldValue: oldResponse.status,
      newValue: newResponse.status,
      message: `HTTP Status Code mismatch: Old returned ${oldResponse.status}, but New returned ${newResponse.status}`
    });
  }

  // 2. Validate expected status code if configured
  if (rules.expectedStatusCode) {
    const expected = rules.expectedStatusCode;
    if (typeof expected === "number" && (oldResponse.status !== expected || newResponse.status !== expected)) {
      differences.push({
        path: "$status.expected",
        type: "STATUS_MISMATCH",
        oldValue: oldResponse.status,
        newValue: newResponse.status,
        message: `Expected status ${expected}, got Old=${oldResponse.status}, New=${newResponse.status}`
      });
    }
  }

  // 3. Compare Response Bodies
  let oldBodyToCompare = oldResponse.body;
  let newBodyToCompare = newResponse.body;

  // Intelligent error message normalization: If both servers returned matching HTTP error status (>= 400)
  // and the error message string references the requested route path, normalize the path
  if (
    statusMatch &&
    oldResponse.status >= 400 &&
    typeof oldBodyToCompare === "string" &&
    typeof newBodyToCompare === "string" &&
    rules.oldPath &&
    rules.newPath
  ) {
    const normOld = oldBodyToCompare.split(rules.oldPath).join("[ROUTE_PATH]");
    const normNew = newBodyToCompare.split(rules.newPath).join("[ROUTE_PATH]");
    if (normOld === normNew) {
      oldBodyToCompare = normOld;
      newBodyToCompare = normNew;
    }
  }

  const comparatorOptions = {
    ignorePaths: rules.ignorePaths || [],
    fieldMappings: rules.responseFieldMappings || {},
    numericTolerance: rules.numericTolerance ?? null,
    ignoreArrayOrder: Boolean(rules.ignoreArrayOrder),
    comparisonStrategy: rules.comparisonStrategy || "exact",
    stableFields: rules.stableFields || []
  };

  recursiveDiff(oldBodyToCompare, newBodyToCompare, "$", comparatorOptions, differences);

  const pass = statusMatch && differences.length === 0;

  return {
    pass,
    statusMatch,
    differences,
    differenceCount: differences.length
  };
}

module.exports = {
  isPathIgnored,
  resolveMappedKey,
  getTolerance,
  numbersMatchWithTolerance,
  getDetailedType,
  compareResponses
};
