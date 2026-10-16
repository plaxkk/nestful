import Fastify from "fastify";
import { registerRoutes } from "../services/api/src/routes.js";

let app: Awaited<ReturnType<typeof Fastify>> | undefined;

async function getApp() {
  if (!app) {
    app = Fastify({ logger: false });
    await registerRoutes(app);
    await app.ready();
  }

  return app;
}

export default async function handler(req, res) {
  const startedAt = performance.now();
  const fastify = await getApp();
  const rawPath = typeof req.query?.path === "string" ? req.query.path : undefined;
  const path = rawPath && rawPath.startsWith("/") ? rawPath : `/${rawPath ?? ""}`;
  // Vercel retains the original query separately from the rewritten path.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (key === "path") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") query.append(key, item);
    }
  }
  const suffix = query.toString();

  const response = await fastify.inject({
    method: req.method || "GET",
    url: suffix ? `${path}${path.includes("?") ? "&" : "?"}${suffix}` : path,
    payload: req.body ? JSON.stringify(req.body) : undefined,
    headers: req.headers,
  });
  res.setHeader("server-timing", `app;dur=${(performance.now() - startedAt).toFixed(1)}`);

  const contentType = response.headers["content-type"];

  if (contentType) {
    res.setHeader("content-type", contentType);
  }

  res.status(response.statusCode);
  res.send(response.body);
}
