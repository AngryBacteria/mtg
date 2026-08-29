import { initTRPC } from "@trpc/server";
import { cardsRouter } from "./cards.js";

/** tRPC factory shared by the procedures declared in this root router. */
const t = initTRPC.create();

/**
 * Root API contract mounted by Fastify at `/trpc`.
 *
 * Card parsing and matching procedures are namespaced under `cards`; `greeting`
 * provides a lightweight connectivity check whose timestamp is generated for
 * each request.
 */
export const appRouter = t.router({
	cards: cardsRouter,
	greeting: t.procedure.query(() => ({
		message: "Hello from the tRPC server!",
		fetchedAt: new Date().toISOString(),
	})),
});

/** Complete backend contract consumed by the client for end-to-end type inference. */
export type AppRouter = typeof appRouter;
