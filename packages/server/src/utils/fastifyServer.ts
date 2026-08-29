import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import { appRouter } from "../routers/router.js";
import { logger } from "./logger.js";

/**
 * Creates the configured HTTP server without starting a network listener.
 *
 * The returned Fastify instance mounts the root tRPC router at `/trpc`, permits
 * long encoded route parameters used by batched tRPC requests, and records the
 * request lifecycle through the shared Pino logger. Fastify's built-in logger is
 * disabled to avoid duplicate records. Callers own listening and shutdown.
 *
 * @returns A Fastify instance ready to be listened on or injected in tests.
 */
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
			"buildFastifyServer: request received",
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
			"buildFastifyServer: request failed",
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
			"buildFastifyServer: request timed out",
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
			"buildFastifyServer: request completed",
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
