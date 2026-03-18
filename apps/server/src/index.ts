import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@myagents/api/context";
import { appRouter } from "@myagents/api/routers/index";
import { auth } from "@myagents/auth";
import { env } from "@myagents/env/server";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authenticateWebSocket, createWSHandlers, startHeartbeat } from "./ws";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use(logger());

// WebSocket upgrade handler
app.get(
  "/ws",
  upgradeWebSocket(async (c) => {
    const authInfo = await authenticateWebSocket(c.req.raw);
    if (!authInfo) {
      return {
        onOpen(_event, ws) {
          ws.close(4001, "Unauthorized");
        },
      };
    }
    return createWSHandlers(authInfo);
  }),
);
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN ?? env.BETTER_AUTH_URL,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

if (process.env.NODE_ENV === "production") {
  const { serveStatic } = await import("@hono/node-server/serve-static");
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");

  app.use("/*", serveStatic({ root: "../web/dist/" }));

  const indexHtml = readFileSync(
    resolve(process.cwd(), "../web/dist/index.html"),
    "utf-8",
  );

  app.get("/*", (c) => {
    return c.html(indexHtml);
  });
} else {
  app.get("/", (c) => {
    return c.text("OK");
  });
}

const server = serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

injectWebSocket(server);

// Start WebSocket heartbeat system
startHeartbeat();
