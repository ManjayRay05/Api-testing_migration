/**
 * Velora Authentication Helper
 * Utility to test sign-in flow and retrieve session tokens for UAT testing.
 */

require("dotenv").config();
const axios = require("axios");
const { redactSensitiveData } = require("./request-client");

/**
 * Attempts authentication on the specified base URL.
 * @param {string} baseUrl Target API host
 * @param {"old"|"new"} apiVersion Whether to use old (/api/v4/user/login) or new (/api/v4/sign-in)
 * @param {object} credentials { client_id, password, pin }
 * @returns {Promise<object>}
 */
async function authenticate(baseUrl, apiVersion = "new", credentials = {}) {
  const cleanBase = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) {
    throw new Error("Base URL is required for authentication.");
  }

  const endpointPath = apiVersion === "old" ? "/api/v4/user/login" : "/api/v4/sign-in";
  const url = `${cleanBase}${endpointPath}`;

  const clientId = credentials.client_id || process.env.VELORA_CLIENT_ID || "S117027";
  const password = credentials.password || process.env.VELORA_PASSWORD || "Live@0987";
  const pin = credentials.pin || process.env.VELORA_PIN || "123456";
  const channelId = credentials.channel_id || process.env.VELORA_CHANNEL_ID || "WEB";

  const payload = {
    client_id: clientId,
    login_id: clientId,
    password: password,
    pin: pin,
    channel_id: channelId
  };

  console.log(`Authenticating against [${apiVersion.toUpperCase()}] ${url} as client_id="${clientId}"...`);

  try {
    const response = await axios({
      method: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      data: payload,
      timeout: 15000,
      validateStatus: () => true
    });

    console.log(`HTTP Status: ${response.status} (${response.statusText})`);

    const token = response.data?.token || 
                  response.data?.access_token || 
                  response.data?.data?.token || 
                  response.data?.data?.access_token;

    if (token) {
      console.log("✅ Authentication Succeeded!");
      console.log(`Retrieved Token: ${token.substring(0, 10)}...[REDACTED]`);
    } else {
      console.log("ℹ️  Server responded without explicit token field. Response data:");
      console.log(JSON.stringify(redactSensitiveData(response.data), null, 2));
    }

    return {
      status: response.status,
      token,
      data: redactSensitiveData(response.data)
    };
  } catch (err) {
    console.error(`❌ Authentication Request Failed: ${err.message}`);
    return {
      error: err.code || "AUTH_FAILED",
      message: err.message
    };
  }
}

if (require.main === module) {
  const targetBase = process.env.NEW_BASE_URL || process.env.OLD_BASE_URL || "https://web-uat.velora.plus";
  authenticate(targetBase, "new").then(() => {
    console.log("\nAuth helper complete.");
  });
}

module.exports = {
  authenticate
};
