const DEFAULT_WS_URL = "ws://127.0.0.1:9421";
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3100";
const REQUEST_TIMEOUT_MS = 10000;
const RUNTIME_READY_TIMEOUT_MS = 45000;
const RETRY_WAIT_MS = 1000;
const ROUTE_WAIT_MS = 3000;

const wsUrl = process.env.DEVTOOLS_AUTO_WS ?? DEFAULT_WS_URL;
const apiBaseUrl = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;

if (typeof WebSocket === "undefined") {
  throw new Error("Node.js WebSocket is unavailable. Run this script with Node 22 or newer.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class AutomatorConnection {
  constructor(websocket) {
    this.websocket = websocket;
    this.nextId = 0;
    this.pending = new Map();
    this.events = [];

    websocket.addEventListener("message", (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        this.events.push({ raw: event.data });
        return;
      }

      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);

        if (message.error) {
          pending.reject(new Error(`${pending.method}: ${message.error.message ?? JSON.stringify(message.error)}`));
          return;
        }

        pending.resolve(message.result);
        return;
      }

      this.events.push(message);
    });

    websocket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("DevTools automation WebSocket closed"));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    if (this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error("DevTools automation WebSocket is not open");
    }

    const id = `${Date.now()}-${++this.nextId}`;
    this.websocket.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  async sendWithRetry(method, params = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? RUNTIME_READY_TIMEOUT_MS;
    const description = options.description ?? method;
    const startedAt = Date.now();
    let lastError;

    while (Date.now() - startedAt < timeoutMs) {
      try {
        return await this.send(method, params);
      } catch (error) {
        lastError = error;
        await sleep(RETRY_WAIT_MS);
      }
    }

    throw new Error(`Timed out waiting for ${description}. Last error: ${lastError?.message ?? "unknown"}`);
  }

  close() {
    this.websocket.close();
  }
}

const automationConnectError = (url) =>
  `Could not connect to ${url}. Start WeChat DevTools automation with "cli auto --project /Users/kk/repos/nestful --port 9420 --auto-port 9421 --trust-project --disable-gpu" first.`;

const connect = (url) =>
  new Promise((resolve, reject) => {
    const websocket = new WebSocket(url);
    const timer = setTimeout(() => {
      websocket.close();
      reject(new Error(automationConnectError(url)));
    }, REQUEST_TIMEOUT_MS);

    websocket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(new AutomatorConnection(websocket));
    });

    websocket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(automationConnectError(url)));
    });
  });

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const normalizePagePath = (path) => (path?.startsWith("/") ? path : `/${path ?? ""}`);

const waitForRuntimeReady = async (connection) => {
  await connection.sendWithRetry("App.getCurrentPage", {}, { description: "mini-program runtime current page" });
  await connection.sendWithRetry("App.callWxMethod", {
    method: "getStorageSync",
    args: ["nestful.runtimeReadyProbe"],
  }, { description: "mini-program runtime wx method bridge" });
};

const routeTo = async (connection, url) => {
  await connection.sendWithRetry("App.callWxMethod", {
    method: "reLaunch",
    args: [{ url }],
  }, { description: `route to ${url}` });
  await sleep(ROUTE_WAIT_MS);

  const page = await connection.send("App.getCurrentPage");
  assert(page?.path, `Expected current page after routing to ${url}`);
  return page;
};

const currentPageData = async (connection, path) => {
  const page = await connection.send("App.getCurrentPage");
  const actualPath = normalizePagePath(page?.path);
  assert(actualPath === path, `Expected current page ${path}, got ${page?.path ?? "unknown"}`);

  const result = await connection.send("Page.getData", {
    pageId: page.pageId,
  });
  return { page, data: result.data };
};

const callCurrentPageMethod = async (connection, method, args = []) => {
  const page = await connection.send("App.getCurrentPage");
  return connection.send("Page.callMethod", {
    pageId: page.pageId,
    method,
    args,
  });
};

const setCurrentPageData = async (connection, data) => {
  const page = await connection.send("App.getCurrentPage");
  await connection.send("Page.setData", {
    pageId: page.pageId,
    data,
  });
};

const waitForData = async (connection, path, predicate, description, timeoutMs = 15000) => {
  const startedAt = Date.now();
  let lastData;
  let lastPath;

  while (Date.now() - startedAt < timeoutMs) {
    const page = await connection.send("App.getCurrentPage");
    lastPath = normalizePagePath(page?.path);

    if (lastPath !== path) {
      await sleep(500);
      continue;
    }

    const { data } = await currentPageData(connection, path);
    lastData = data;

    if (predicate(data)) {
      return data;
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${description}. Last path: ${lastPath}. Last data: ${JSON.stringify(lastData)}`);
};

const openPageAndGetData = async (connection, path) => {
  await routeTo(connection, path);
  return waitForData(connection, path, () => true, `${path} data`);
};

const verifyFeaturePage = async (connection, path, predicate, description) => {
  await routeTo(connection, path);
  await waitForData(connection, path, predicate, description);
};

let connection;

try {
  connection = await connect(wsUrl);
  const info = await connection.send("Tool.getInfo");
  await waitForRuntimeReady(connection);

  await connection.sendWithRetry("App.callWxMethod", {
    method: "setStorageSync",
    args: ["nestful.apiBaseUrl", apiBaseUrl],
  }, { description: "set API base URL override" });
  await connection.sendWithRetry("App.callWxMethod", {
    method: "removeStorageSync",
    args: ["currentFamily"],
  }, { description: "clear current family storage" });
  await connection.sendWithRetry("App.callWxMethod", {
    method: "removeStorageSync",
    args: ["currentMember"],
  }, { description: "clear current member storage" });
  await connection.sendWithRetry("App.callWxMethod", {
    method: "removeStorageSync",
    args: ["appSessionToken"],
  }, { description: "clear app session token storage" });

  const homeData = await openPageAndGetData(connection, "/pages/home/index");
  assert(homeData.primaryText === "创建我的家庭", "Home page did not render the create-family CTA");

  await routeTo(connection, "/pages/create-family/index");
  await setCurrentPageData(connection, {
    familyNameInput: `自动验收家庭 ${Date.now()}`,
  });
  await callCurrentPageMethod(connection, "onCreateFamily");

  const familyData = await waitForData(
    connection,
    "/pages/family/index",
    (data) => Boolean(data.familyName) && Array.isArray(data.members) && data.members.length >= 1,
    "family page to load created family",
  );
  assert(Array.isArray(familyData.nextActions) && familyData.nextActions.length === 4, "Family page next actions missing");

  await callCurrentPageMethod(connection, "onCreateInvitation");
  const familyWithInvite = await waitForData(
    connection,
    "/pages/family/index",
    (data) => typeof data.inviteCode === "string" && data.inviteCode.length > 0,
    "family invitation code",
  );

  await routeTo(connection, `/pages/join/index?code=${familyWithInvite.inviteCode}`);
  await waitForData(
    connection,
    "/pages/join/index",
    (data) => data.codeInput === familyWithInvite.inviteCode && data.invitationStatus === "邀请有效",
    "join page invitation validation",
  );

  await verifyFeaturePage(
    connection,
    "/pages/reminders/index",
    (data) => Array.isArray(data.members) && data.members.length >= 1 && Array.isArray(data.reminderTypes),
    "reminders page member and type data",
  );
  await callCurrentPageMethod(connection, "onCreateReminder");
  await waitForData(
    connection,
    "/pages/reminders/index",
    (data) => Array.isArray(data.reminders) && data.reminders.length >= 1,
    "reminder creation through mini-program page",
  );

  await verifyFeaturePage(
    connection,
    "/pages/ledger/index",
    (data) => Array.isArray(data.members) && data.members.length >= 1 && data.summary?.recordCountText,
    "ledger page summary data",
  );
  await callCurrentPageMethod(connection, "onCreateLedgerEntry");
  await waitForData(
    connection,
    "/pages/ledger/index",
    (data) => Array.isArray(data.ledgerEntries) && data.ledgerEntries.length >= 1,
    "ledger entry creation through mini-program page",
  );
  await callCurrentPageMethod(connection, "onCreateGoalFund");
  await waitForData(
    connection,
    "/pages/ledger/index",
    (data) => Array.isArray(data.summary?.goalFunds) && data.summary.goalFunds.length >= 1,
    "goal fund creation through mini-program page",
  );

  await verifyFeaturePage(
    connection,
    "/pages/digital-space/index",
    (data) => Array.isArray(data.members) && data.members.length >= 1 && Array.isArray(data.filterKinds),
    "digital-space page data",
  );
  await callCurrentPageMethod(connection, "onCreateItem");
  await waitForData(
    connection,
    "/pages/digital-space/index",
    (data) => Array.isArray(data.items) && data.items.length >= 1,
    "digital-space item creation through mini-program page",
  );

  await verifyFeaturePage(
    connection,
    "/pages/activities/index",
    (data) => Array.isArray(data.members) && data.members.length >= 1 && Array.isArray(data.activities),
    "activities page data",
  );
  await callCurrentPageMethod(connection, "onCreateActivity");
  await waitForData(
    connection,
    "/pages/activities/index",
    (data) => Array.isArray(data.activities) && data.activities.length >= 1 && data.latestSharePath,
    "activity creation through mini-program page",
  );

  console.log("miniprogram devtools smoke passed");
  console.log(
    JSON.stringify(
      {
        sdkVersion: info?.SDKVersion,
        apiBaseUrl,
        familyName: familyData.familyName,
        invitationCode: familyWithInvite.inviteCode,
      },
      null,
      2,
    ),
  );
} finally {
  connection?.close();
}
