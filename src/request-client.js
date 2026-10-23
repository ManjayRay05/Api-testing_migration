/**
 * Request Client Module
 * Executes HTTP requests for Old and New endpoints with precise timing,
 * credential management, network error handling, and sensitive data redaction.
 */

const axios = require("axios");

const SENSITIVE_KEYS = new Set([
  "authorization",
  "password",
  "pin",
  "token",
  "secret",
  "access_token",
  "refresh_token",
  "otp",
  "client_secret",
  "apikey",
  "x-auth-token"
]);

/**
 * Recursively redacts sensitive fields from objects (headers, params, body).
 * @param {any} data
 * @returns {any} Sanitized clone of the data
 */
function redactSensitiveData(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // If string looks like a JWT or Bearer token, mask it
    if (/^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i.test(data)) {
      return "Bearer [REDACTED_TOKEN]";
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }

  if (typeof data === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = redactSensitiveData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Builds HTTP headers with authentication tokens and custom endpoint headers.
 * @param {string} token Bearer or custom token
 * @param {Record<string, string>} customHeaders Endpoint-specific custom headers
 * @param {string} authHeaderName Header name for auth (default: "Authorization")
 * @param {string} authPrefix Header prefix for token (default: "Bearer ")
 * @returns {Record<string, string>}
 */
function buildHeaders(token, customHeaders = {}, authHeaderName = "Authorization", authPrefix = "Bearer ") {
  const headers = {
    Accept: "application/json, text/plain, */*",
    ...customHeaders
  };

  const hasAuthHeader = Object.keys(headers).some(k => k.toLowerCase() === authHeaderName.toLowerCase());

  if (token && !hasAuthHeader) {
    const prefix = authPrefix ? authPrefix.trim() + " " : "";
    headers[authHeaderName] = `${prefix}${token}`.trim();
  }

  return headers;
}

/**
 * Executes a single API request against either the Old or New endpoint.
 * @param {object} config
 * @param {string} config.url Full target URL
 * @param {string} config.method HTTP Method (GET, POST, PUT, DELETE, etc.)
 * @param {string} [config.token] Auth token for this environment
 * @param {Record<string, string>} [config.headers] Custom headers
 * @param {any} [config.body] Request payload
 * @param {number} [config.timeoutMs] Request timeout
 * @param {string} [config.authHeaderName] Auth header key
 * @param {string} [config.authPrefix] Auth header prefix
 * @returns {Promise<object>} Standardized execution result
 */
async function executeRequest({
  url,
  method = "GET",
  token = "",
  headers = {},
  body = null,
  timeoutMs = 20000,
  authHeaderName = "Authorization",
  authPrefix = "Bearer "
}) {
  const httpMethod = method.toUpperCase();
  const requestHeaders = buildHeaders(token, headers, authHeaderName, authPrefix);

  const axiosOptions = {
    method: httpMethod,
    url,
    headers: requestHeaders,
    timeout: timeoutMs,
    // Do not throw on 4xx/5xx responses; treat them as valid HTTP responses to compare
    validateStatus: () => true,
    maxRedirects: 5
  };

  if (body !== null && body !== undefined && !["GET", "HEAD"].includes(httpMethod)) {
    axiosOptions.data = body;
    if (!axiosOptions.headers["Content-Type"] && !axiosOptions.headers["content-type"]) {
      axiosOptions.headers["Content-Type"] = "application/json";
    }
  }

  const startTime = Date.now();
  try {
    const response = await axios(axiosOptions);
    const durationMs = Date.now() - startTime;

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.data,
      durationMs,
      url,
      requestSummary: {
        method: httpMethod,
        url,
        headers: redactSensitiveData(requestHeaders),
        body: redactSensitiveData(body)
      }
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;

    return {
      success: false,
      error: err.code || "REQUEST_ERROR",
      message: err.message,
      durationMs,
      url,
      requestSummary: {
        method: httpMethod,
        url,
        headers: redactSensitiveData(requestHeaders),
        body: redactSensitiveData(body)
      }
    };
  }
}

module.exports = {
  SENSITIVE_KEYS,
  redactSensitiveData,
  buildHeaders,
  executeRequest
};
