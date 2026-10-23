/**
 * Mock API Server Module
 * Uses native Node.js http module (no extra dependencies) to spin up
 * simulated Old API and New API servers for comprehensive local regression validation.
 */

const http = require("http");

/**
 * Parses JSON request body if present.
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>}
 */
function parseRequestBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch {
        resolve(body);
      }
    });
  });
}

/**
 * Sends a JSON response with status code and headers.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {any} data
 */
function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Powered-By": "RegressionMockServer"
  });
  res.end(JSON.stringify(data));
}

/**
 * Creates the mock request handler for Old API or New API.
 * @param {"old"|"new"} apiType
 * @param {object} scenarioOverrides Optional custom route overrides for test suites
 */
function createHandler(apiType, scenarioOverrides = {}) {
  return async (req, res) => {
    const host = req.headers.host || "127.0.0.1";
    const reqUrl = new URL(req.url, `http://${host}`);
    const pathname = reqUrl.pathname;
    const method = req.method.toUpperCase();
    const body = await parseRequestBody(req);

    // Check custom overrides first
    if (scenarioOverrides[pathname]) {
      const override = scenarioOverrides[pathname];
      const result = typeof override === "function" ? override(req, apiType, body) : override;
      return sendJson(res, result.status || 200, result.body);
    }

    // 1. Authentication
    if (pathname === "/api/v4/user/login" || pathname === "/api/v4/sign-in") {
      return sendJson(res, 200, {
        status: "success",
        token: apiType === "old" ? "old-session-jwt-token" : "new-session-jwt-token",
        timestamp: Date.now(),
        user: { client_id: body?.client_id || "S117027", name: "Tradelab User" }
      });
    }

    if (pathname === "/api/v4/user/password/forgot/otp" || pathname === "/api/v4/recovery/otp") {
      return sendJson(res, 200, {
        status: "success",
        message: "OTP sent successfully to registered mobile",
        request_id: "req-" + Math.random().toString(36).substring(7)
      });
    }

    if (pathname === "/api/v4/user/password/set" || pathname === "/api/v4/recovery") {
      return sendJson(res, 200, {
        status: "success",
        message: "Password updated successfully"
      });
    }

    // 2. Member Config
    if (pathname === "/api/v1/broker/settings" || pathname === "/api/v1/member/config") {
      return sendJson(res, 200, {
        status: "success",
        data: {
          broker_id: "VELORA",
          version: "1.0",
          features: { charts: true, dark_mode: true },
          timestamp: Date.now()
        }
      });
    }

    if (pathname === "/api/v2/broker/settings" || pathname === "/api/v2/member/config") {
      return sendJson(res, 200, {
        status: "success",
        data: {
          broker_id: "VELORA",
          version: "2.0",
          features: { charts: true, dark_mode: true, alerts: true },
          timestamp: Date.now()
        }
      });
    }

    // 3. Account Preferences & Profile
    if (pathname === "/api/v1/management/user/settings" || pathname === "/api/v1/account/preferences") {
      return sendJson(res, 200, {
        status: "success",
        preferences: {
          order_confirmation: false,
          default_product: "MIS",
          theme: "dark"
        }
      });
    }

    if (pathname === "/api/v1/user/profile" || pathname === "/api/v1/account") {
      return sendJson(res, 200, {
        status: "success",
        profile: {
          client_id: "S117027",
          email: "trader@velora.plus",
          kyc_status: "VERIFIED",
          exchanges: ["NSE", "BSE", "NFO"]
        },
        session_id: "sess-" + apiType
      });
    }

    if (pathname === "/api/v1/user/referrals/bonus" || pathname === "/api/v1/rewards") {
      return sendJson(res, 200, {
        status: "success",
        points: 250,
        unclaimed_bonus: 0
      });
    }

    // 4. Favorites
    if (pathname === "/api/v1/dashboard/pins" || pathname === "/api/v1/favorites") {
      return sendJson(res, 200, {
        status: "success",
        pins: [
          { symbol: "RELIANCE", token: "2885" },
          { symbol: "TCS", token: "11536" }
        ]
      });
    }

    if (/^\/api\/v1\/(dashboard\/pins|favorites)\/1$/.test(pathname)) {
      return sendJson(res, 200, {
        status: "success",
        marketwatch_id: "1",
        symbols: ["RELIANCE", "INFY", "TCS"]
      });
    }

    // 5. Symbol Lists
    if (pathname === "/api/v1/marketwatches" || pathname === "/api/v1/symbol-lists") {
      return sendJson(res, 200, {
        status: "success",
        lists: [
          { id: "1", name: "Default Watchlist", count: 3 }
        ]
      });
    }

    if (/^\/api\/v1\/(marketwatches|symbol-lists)\/1$/.test(pathname)) {
      return sendJson(res, 200, {
        status: "success",
        id: "1",
        name: "Default Watchlist",
        symbols: ["INFY", "TCS"]
      });
    }

    // 6. Orders
    if (pathname === "/api/v1/orders" || pathname === "/api/v1/order-book") {
      return sendJson(res, 200, {
        status: "success",
        orders: []
      });
    }

    if (pathname === "/api/v1/orders/bracket" || pathname === "/api/v1/bracket-orders") {
      return sendJson(res, 200, {
        status: "success",
        bracket_order_id: "BO_1001",
        status_text: "PLACED"
      });
    }

    if (pathname === "/api/v1/orders/kart" || pathname === "/api/v1/basket-orders") {
      return sendJson(res, 200, {
        status: "success",
        basket_id: "BSK_501",
        items_count: 1
      });
    }

    if (/^\/api\/v1\/(orders\/kart|basket-orders)\/OMS98765$/.test(pathname)) {
      return sendJson(res, 200, {
        status: "success",
        deleted_order_id: "OMS98765"
      });
    }

    if (pathname === "/api/v1/orders/cover" || pathname === "/api/v1/cover-orders") {
      return sendJson(res, 200, {
        status: "success",
        cancelled: true
      });
    }

    // 7. Trades & Positions
    if (pathname === "/api/v1/trades" || pathname === "/api/v1/fills") {
      return sendJson(res, 200, {
        status: "success",
        trades: []
      });
    }

    if (pathname === "/api/v1/positions" || pathname === "/api/v1/open-positions") {
      return sendJson(res, 200, {
        status: "success",
        positions: []
      });
    }

    // 8. Ledger and Margin
    if (pathname === "/api/v1/funds/transactions" || pathname === "/api/v1/ledger/movements") {
      return sendJson(res, 200, {
        status: "success",
        transactions: []
      });
    }

    if (pathname === "/api/v1/funds/view/margin" || pathname === "/api/v1/balances/margin") {
      return sendJson(res, 200, {
        status: "success",
        available_margin: 250000.50,
        used_margin: 0.0,
        cash_balance: 250000.50
      });
    }

    // 9. Market Data Ticker
    if (pathname.includes("/marketdata/") || pathname.includes("/ticker/")) {
      const isKeyQuery = pathname.endsWith("/ltp");
      if (isKeyQuery) {
        return sendJson(res, 200, {
          symbol: "NSE:26000",
          key: "ltp",
          value: apiType === "old" ? 1520.40 : 1520.45,
          timestamp: Date.now()
        });
      }

      return sendJson(res, 200, {
        exchange: "NSE",
        segment: "CM",
        token: "26000",
        ltp: apiType === "old" ? 1520.40 : 1520.45,
        volume: 45000,
        feed_time: "15:30:00"
      });
    }

    // Fallback 404
    return sendJson(res, 404, {
      error: "ENDPOINT_NOT_FOUND",
      path: pathname,
      api: apiType
    });
  };
}

/**
 * Starts Old and New Mock API servers.
 * @param {number} portOld Port for Old API (default: 4001)
 * @param {number} portNew Port for New API (default: 4002)
 * @param {object} [scenarioOverrides] Custom mock scenario handlers
 * @returns {Promise<{ oldServer: http.Server, newServer: http.Server, oldUrl: string, newUrl: string, close: Function }>}
 */
function startMockServers(portOld = 4001, portNew = 4002, scenarioOverrides = {}) {
  return new Promise((resolve, reject) => {
    const oldServer = http.createServer(createHandler("old", scenarioOverrides));
    const newServer = http.createServer(createHandler("new", scenarioOverrides));

    let oldStarted = false;
    let newStarted = false;

    function checkReady() {
      if (oldStarted && newStarted) {
        resolve({
          oldServer,
          newServer,
          oldUrl: `http://127.0.0.1:${portOld}`,
          newUrl: `http://127.0.0.1:${portNew}`,
          close: () => Promise.all([
            new Promise(res => oldServer.close(res)),
            new Promise(res => newServer.close(res))
          ])
        });
      }
    }

    oldServer.listen(portOld, "127.0.0.1", () => {
      oldStarted = true;
      checkReady();
    });

    newServer.listen(portNew, "127.0.0.1", () => {
      newStarted = true;
      checkReady();
    });

    oldServer.on("error", reject);
    newServer.on("error", reject);
  });
}

// Standalone execution
if (require.main === module) {
  const PORT_OLD = parseInt(process.env.MOCK_PORT_OLD || "4001", 10);
  const PORT_NEW = parseInt(process.env.MOCK_PORT_NEW || "4002", 10);

  startMockServers(PORT_OLD, PORT_NEW)
    .then(({ oldUrl, newUrl }) => {
      console.log(`🚀 Mock Servers Running:`);
      console.log(`   - OLD API: ${oldUrl}`);
      console.log(`   - NEW API: ${newUrl}`);
      console.log(`Press Ctrl+C to terminate.`);
    })
    .catch(err => {
      console.error("Failed to start mock servers:", err);
      process.exit(1);
    });
}

module.exports = {
  startMockServers
};
