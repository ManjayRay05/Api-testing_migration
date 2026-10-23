/**
 * Playwright Request Client Module
 * Manages Playwright APIRequestContext instances for Old and New APIs,
 * executing requests with precise timing, error handling, and sensitive data redaction.
 */

const { request: playwrightRequest } = require("@playwright/test");
const { buildHeaders, redactSensitiveData } = require("./request-client");
const { buildFullUrl } = require("./url-resolver");

/**
 * Creates Playwright APIRequestContext for a target base URL and token.
 * @param {string} baseUrl Target host URL
 * @param {string} token Auth token
 * @param {Record<string, string>} defaultHeaders
 * @param {number} timeoutMs Request timeout in ms
 * @returns {Promise<import('@playwright/test').APIRequestContext>}
 */
async function createRequestContext(baseUrl, token = "", defaultHeaders = {}, timeoutMs = 20000) {
  const headers = buildHeaders(token, defaultHeaders);
  return await playwrightRequest.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: headers,
    timeout: timeoutMs,
    ignoreHTTPSErrors: true
  });
}

/**
 * Executes an HTTP request using Playwright's APIRequestContext.
 * @param {import('@playwright/test').APIRequestContext} context Playwright context
 * @param {object} options
 * @param {string} options.url Relative or full target URL
 * @param {string} options.method HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param {Record<string, string>} [options.headers] Custom endpoint headers
 * @param {any} [options.body] Request payload
 * @param {Record<string, any>} [options.params] Query parameters
 * @param {number} [options.timeoutMs]
 * @returns {Promise<object>} Standardized response object
 */
async function executePlaywrightRequest(context, {
  url,
  method = "GET",
  headers = {},
  body = null,
  params = {},
  timeoutMs = 20000
}) {
  const httpMethod = method.toUpperCase();
  const requestOptions = {
    headers: { ...headers },
    params,
    timeout: timeoutMs,
    failOnStatusCode: false // Do not throw on 4xx/5xx HTTP statuses
  };

  if (body !== null && body !== undefined && !["GET", "HEAD"].includes(httpMethod)) {
    requestOptions.data = body;
    if (!requestOptions.headers["Content-Type"] && !requestOptions.headers["content-type"]) {
      requestOptions.headers["Content-Type"] = "application/json";
    }
  }

  const startTime = Date.now();
  try {
    let response;
    switch (httpMethod) {
      case "GET":
        response = await context.get(url, requestOptions);
        break;
      case "POST":
        response = await context.post(url, requestOptions);
        break;
      case "PUT":
        response = await context.put(url, requestOptions);
        break;
      case "DELETE":
        response = await context.delete(url, requestOptions);
        break;
      case "PATCH":
        response = await context.patch(url, requestOptions);
        break;
      case "HEAD":
        response = await context.head(url, requestOptions);
        break;
      default:
        response = await context.fetch(url, { ...requestOptions, method: httpMethod });
    }

    const durationMs = Date.now() - startTime;
    const status = response.status();
    const statusText = response.statusText();
    const resHeaders = response.headers();

    let resBody;
    const contentType = resHeaders["content-type"] || "";
    try {
      if (contentType.includes("application/json")) {
        resBody = await response.json();
      } else {
        const text = await response.text();
        try {
          resBody = text ? JSON.parse(text) : text;
        } catch {
          resBody = text;
        }
      }
    } catch {
      resBody = await response.text();
    }

    return {
      success: true,
      status,
      statusText,
      headers: resHeaders,
      body: resBody,
      durationMs,
      url,
      requestSummary: {
        method: httpMethod,
        url,
        headers: redactSensitiveData(requestOptions.headers),
        body: redactSensitiveData(body)
      }
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: err.name || "REQUEST_ERROR",
      message: err.message,
      durationMs,
      url,
      requestSummary: {
        method: httpMethod,
        url,
        headers: redactSensitiveData(requestOptions.headers),
        body: redactSensitiveData(body)
      }
    };
  }
}

module.exports = {
  createRequestContext,
  executePlaywrightRequest
};
