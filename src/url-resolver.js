/**
 * URL Resolver Module
 * Resolves path parameters and query strings for Old and New API routes.
 */

class MissingPathParameterError extends Error {
  constructor(paramName, template) {
    super(`Missing required path parameter "${paramName}" for path template "${template}"`);
    this.name = "MissingPathParameterError";
    this.paramName = paramName;
    this.template = template;
    this.code = "MISSING_PATH_PARAM";
  }
}

/**
 * Extracts parameter names from a path template (e.g. :marketwatch_id -> 'marketwatch_id')
 * @param {string} template 
 * @returns {string[]}
 */
function extractParamNames(template) {
  if (!template || typeof template !== "string") return [];
  const matches = template.match(/:([A-Za-z0-9_]+)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1));
}

/**
 * Resolves path parameters in a route template.
 * @param {string} template e.g. "/api/v1/marketdata/:exchange/:segment"
 * @param {Record<string, any>} params e.g. { exchange: "NSE", segment: "CM" }
 * @returns {string} e.g. "/api/v1/marketdata/NSE/CM"
 */
function resolvePath(template, params = {}) {
  if (!template || typeof template !== "string") {
    throw new Error(`Invalid path template: ${template}`);
  }

  return template.replace(/:([A-Za-z0-9_]+)/g, (match, key) => {
    const val = params ? params[key] : undefined;
    if (val === undefined || val === null || val === "") {
      throw new MissingPathParameterError(key, template);
    }
    return encodeURIComponent(String(val));
  });
}

/**
 * Appends query parameters to a URL safely.
 * @param {string} url 
 * @param {Record<string, any>} query 
 * @returns {string}
 */
function appendQueryParams(url, query = {}) {
  if (!query || typeof query !== "object" || Object.keys(query).length === 0) {
    return url;
  }

  const urlObj = new URL(url);
  for (const [key, val] of Object.entries(query)) {
    if (val !== undefined && val !== null) {
      if (Array.isArray(val)) {
        val.forEach(item => urlObj.searchParams.append(key, String(item)));
      } else {
        urlObj.searchParams.append(key, String(val));
      }
    }
  }
  return urlObj.toString();
}

/**
 * Builds a full target URL from base URL, path template, path parameters, and query parameters.
 * @param {string} baseUrl e.g. "https://api.example.com"
 * @param {string} pathTemplate e.g. "/api/v1/ticker/:exchange"
 * @param {Record<string, any>} pathParams e.g. { exchange: "NSE" }
 * @param {Record<string, any>} queryParams e.g. { details: true }
 * @returns {string}
 */
function buildFullUrl(baseUrl, pathTemplate, pathParams = {}, queryParams = {}) {
  const cleanBase = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) {
    throw new Error("Base URL is required to resolve full URL.");
  }
  const resolvedPath = resolvePath(pathTemplate, pathParams);
  const cleanPath = resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`;
  const fullUrl = `${cleanBase}${cleanPath}`;

  return appendQueryParams(fullUrl, queryParams);
}

module.exports = {
  MissingPathParameterError,
  extractParamNames,
  resolvePath,
  appendQueryParams,
  buildFullUrl
};
