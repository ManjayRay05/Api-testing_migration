/**
 * Configuration Validator Module
 * Validates endpoints.json schema, route parameters, and environment settings.
 */

const { extractParamNames } = require("./url-resolver");

const VALID_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

/**
 * Validates a single endpoint definition.
 * @param {object} endpoint
 * @param {number} index
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateEndpoint(endpoint, index = 0) {
  const errors = [];
  const warnings = [];
  const prefix = `Endpoint #${index + 1} (${endpoint.name || "unnamed"})`;

  if (!endpoint.name || typeof endpoint.name !== "string" || !endpoint.name.trim()) {
    errors.push(`${prefix}: "name" is required and must be a non-empty string.`);
  }

  if (!endpoint.method || !VALID_METHODS.has(endpoint.method.toUpperCase())) {
    errors.push(`${prefix}: "method" must be one of [${[...VALID_METHODS].join(", ")}]. Got: ${endpoint.method}`);
  }

  if (!endpoint.oldPath || typeof endpoint.oldPath !== "string" || !endpoint.oldPath.startsWith("/")) {
    errors.push(`${prefix}: "oldPath" is required and must start with "/". Got: ${endpoint.oldPath}`);
  }

  if (!endpoint.newPath || typeof endpoint.newPath !== "string" || !endpoint.newPath.startsWith("/")) {
    errors.push(`${prefix}: "newPath" is required and must start with "/". Got: ${endpoint.newPath}`);
  }

  // Check required path params if endpoint is enabled
  if (endpoint.enabled) {
    const oldParams = extractParamNames(endpoint.oldPath || "");
    const newParams = extractParamNames(endpoint.newPath || "");
    const allRequiredParams = new Set([...oldParams, ...newParams]);

    const providedParams = endpoint.pathParams || {};
    for (const param of allRequiredParams) {
      const val = providedParams[param];
      if (val === undefined || val === null || val === "") {
        warnings.push(`${prefix}: Path parameter ":${param}" is required for route execution but not configured in "pathParams".`);
      }
    }

    const method = (endpoint.method || "").toUpperCase();
    if (["POST", "PUT", "PATCH"].includes(method) && (endpoint.body === null || endpoint.body === undefined)) {
      warnings.push(`${prefix}: Write method ${method} does not have a "body" defined in endpoints.json.`);
    }
  }

  return { errors, warnings };
}

/**
 * Validates the entire endpoints configuration file.
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[], warnings: string[], stats: object }}
 */
function validateEndpointsConfig(config) {
  const allErrors = [];
  const allWarnings = [];

  if (!config || typeof config !== "object") {
    return {
      valid: false,
      errors: ["Configuration root must be an object with an 'endpoints' array."],
      warnings: [],
      stats: { total: 0, enabled: 0 }
    };
  }

  if (!Array.isArray(config.endpoints)) {
    return {
      valid: false,
      errors: ["Property 'endpoints' must be an array."],
      warnings: [],
      stats: { total: 0, enabled: 0 }
    };
  }

  const seenNames = new Set();
  let enabledCount = 0;

  config.endpoints.forEach((ep, idx) => {
    if (ep.name) {
      if (seenNames.has(ep.name)) {
        allErrors.push(`Duplicate endpoint name detected: "${ep.name}". Endpoint names must be unique.`);
      }
      seenNames.add(ep.name);
    }

    if (ep.enabled) enabledCount++;

    const { errors, warnings } = validateEndpoint(ep, idx);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    stats: {
      total: config.endpoints.length,
      enabled: enabledCount
    }
  };
}

/**
 * Validates environment variables.
 * @param {Record<string, any>} env
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];

  const oldBase = (env.OLD_BASE_URL || "").trim();
  const newBase = (env.NEW_BASE_URL || "").trim();

  if (!oldBase) {
    errors.push("OLD_BASE_URL is missing in environment variables.");
  } else if (oldBase.includes("your-old-uat-host.example")) {
    errors.push("OLD_BASE_URL is still set to placeholder 'https://your-old-uat-host.example'.");
  }

  if (!newBase) {
    errors.push("NEW_BASE_URL is missing in environment variables.");
  } else if (newBase.includes("your-new-uat-host.example")) {
    errors.push("NEW_BASE_URL is still set to placeholder 'https://your-new-uat-host.example'.");
  }

  if (!env.OLD_TOKEN && !env.NEW_TOKEN) {
    warnings.push("No OLD_TOKEN or NEW_TOKEN configured in environment. Secured endpoints may return 401/403.");
  }

  const timeout = Number(env.REQUEST_TIMEOUT_MS);
  if (env.REQUEST_TIMEOUT_MS && (isNaN(timeout) || timeout <= 0)) {
    warnings.push("REQUEST_TIMEOUT_MS is invalid; fallback default of 20000ms will be used.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Standalone CLI runner
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  require("dotenv").config();

  console.log("🔍 Validating API Migration Regression Configuration...\n");

  const configPath = path.join(__dirname, "..", "endpoints.json");
  if (!fs.existsSync(configPath)) {
    console.error(`❌ endpoints.json not found at ${configPath}`);
    process.exit(1);
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const configResult = validateEndpointsConfig(config);
    const envResult = validateEnvironment(process.env);

    console.log(`Endpoints Analyzed: ${configResult.stats.total} total (${configResult.stats.enabled} enabled)`);

    if (configResult.warnings.length > 0) {
      console.log(`\n⚠️  Config Warnings (${configResult.warnings.length}):`);
      configResult.warnings.forEach(w => console.log(`   - ${w}`));
    }

    if (envResult.warnings.length > 0) {
      console.log(`\n⚠️  Environment Warnings (${envResult.warnings.length}):`);
      envResult.warnings.forEach(w => console.log(`   - ${w}`));
    }

    if (configResult.errors.length > 0 || envResult.errors.length > 0) {
      console.log(`\n❌ Validation Failed:`);
      configResult.errors.forEach(e => console.error(`   - [Config] ${e}`));
      envResult.errors.forEach(e => console.error(`   - [Env] ${e}`));
      process.exit(1);
    }

    console.log("\n✅ All configurations are structurally valid!");
  } catch (err) {
    console.error(`❌ Failed to parse endpoints.json: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  validateEndpoint,
  validateEndpointsConfig,
  validateEnvironment
};
