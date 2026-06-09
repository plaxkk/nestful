import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import { resolve } from "node:path";

const root = resolve(".");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const devtoolsCliPath = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3100";
const devtoolsWsUrl = process.env.DEVTOOLS_AUTO_WS ?? "ws://127.0.0.1:9421";
const apiHealthUrl = new URL("/health", apiBaseUrl).href;
const apiHealthTimeoutMs = 45000;
const devtoolsTimeoutMs = 45000;
const retryWaitMs = 500;

let apiProcess;
let startedDevTools = false;
let cleanedUp = false;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const run = (label, command, args) => {
  console.log(`\n# ${label}`);
  console.log(`$ ${[command, ...args].join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
};

const isTcpListening = (port, host = "127.0.0.1", timeoutMs = 1000) =>
  new Promise((resolveListening) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolveListening(false);
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolveListening(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      resolveListening(false);
    });
  });

const fetchHealth = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(apiHealthUrl, { signal: controller.signal });
    const text = await response.text();
    return response.ok && text.includes('"ok":true');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const waitForApiHealth = async (timeoutMs) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await fetchHealth()) {
      return true;
    }

    await sleep(retryWaitMs);
  }

  return false;
};

const connectWebSocket = (url, timeoutMs) =>
  new Promise((resolveConnect) => {
    const websocket = new WebSocket(url);
    const timer = setTimeout(() => {
      websocket.close();
      resolveConnect(false);
    }, timeoutMs);

    websocket.addEventListener("open", () => {
      clearTimeout(timer);
      websocket.close();
      resolveConnect(true);
    });

    websocket.addEventListener("error", () => {
      clearTimeout(timer);
      resolveConnect(false);
    });
  });

const waitForDevToolsAutomation = async (timeoutMs) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await connectWebSocket(devtoolsWsUrl, 1500)) {
      return true;
    }

    await sleep(retryWaitMs);
  }

  return false;
};

const startApiIfNeeded = async () => {
  if (await waitForApiHealth(1500)) {
    console.log(`API is already healthy at ${apiHealthUrl}`);
    return;
  }

  console.log(`\n# start local API`);
  console.log("$ npm run dev:api");
  apiProcess = spawn(npmBin, ["run", "dev:api"], {
    cwd: root,
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit",
  });

  if (!(await waitForApiHealth(apiHealthTimeoutMs))) {
    throw new Error(`Timed out waiting for API health at ${apiHealthUrl}`);
  }
};

const startDevToolsIfNeeded = async () => {
  if (await waitForDevToolsAutomation(1500)) {
    console.log(`DevTools automation is already listening at ${devtoolsWsUrl}`);
    return;
  }

  const ideWasAlreadyListening = await isTcpListening(9420);

  run("start WeChat DevTools automation", devtoolsCliPath, [
    "auto",
    "--project",
    root,
    "--port",
    "9420",
    "--auto-port",
    "9421",
    "--trust-project",
    "--disable-gpu",
  ]);
  startedDevTools = !ideWasAlreadyListening;

  if (!(await waitForDevToolsAutomation(devtoolsTimeoutMs))) {
    throw new Error(`Timed out waiting for DevTools automation at ${devtoolsWsUrl}`);
  }
};

const stopApi = async () => {
  if (!apiProcess || apiProcess.exitCode !== null) {
    return;
  }

  const exited = once(apiProcess, "exit").then(() => "exit");

  if (process.platform === "win32") {
    apiProcess.kill("SIGTERM");
  } else {
    try {
      process.kill(-apiProcess.pid, "SIGTERM");
    } catch {
      return;
    }
  }

  const timeout = sleep(5000).then(() => "timeout");

  if ((await Promise.race([timeout, exited])) === "timeout") {
    if (process.platform === "win32") {
      apiProcess.kill("SIGKILL");
    } else {
      try {
        process.kill(-apiProcess.pid, "SIGKILL");
      } catch {
        return;
      }
    }
  }
};

const cleanup = async () => {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;

  if (startedDevTools) {
    spawnSync(devtoolsCliPath, ["quit", "--port", "9420"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
  }

  await stopApi();
};

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(143);
});

try {
  await startApiIfNeeded();
  run("acceptance smoke", npmBin, ["run", "acceptance:smoke"]);
  await startDevToolsIfNeeded();
  run("mini-program DevTools smoke", npmBin, ["run", "miniprogram:devtools-smoke"]);
  console.log("\nrelease runtime smoke passed");
} finally {
  await cleanup();
}
