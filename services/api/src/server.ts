import Fastify from "fastify";
import { registerRoutes } from "./routes.js";

const server = Fastify({ logger: true });

await registerRoutes(server);

const port = Number(process.env.API_PORT ?? 3100);

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
