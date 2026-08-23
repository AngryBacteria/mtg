import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import { logger } from "../logger.js";
import { appRouter } from "../router.js";

export function buildFastifyServer() {
  const fastifyServer = Fastify({
    logger: false,
    routerOptions: {
      maxParamLength: 5_000,
    },
  });

  fastifyServer.addHook("onRequest", (request, _reply, done) => {
    logger.debug(
      {
        id: request.id,
        method: request.method,
        url: request.url,
        host: request.host,
        remoteAddress: request.ip,
        userAgent: request.headers["user-agent"],
      },
      "Request received",
    );
    done();
  });

  fastifyServer.addHook("onError", (request, reply, error, done) => {
    logger.error(
      {
        id: request.id,
        method: request.method,
        url: request.url,
        err: error,
        statusCode: reply.statusCode,
      },
      "Request failed",
    );
    done();
  });

  fastifyServer.addHook("onTimeout", (request, reply, done) => {
    logger.warn(
      {
        id: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "Request timed out",
    );
    done();
  });

  fastifyServer.addHook("onResponse", (request, reply, done) => {
    logger.debug(
      {
        id: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "Request completed",
    );
    done();
  });

  void fastifyServer.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: () => ({}),
    },
  });

  return fastifyServer;
}
