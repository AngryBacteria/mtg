import { initTRPC } from "@trpc/server";
import { cardsRouter } from "./cards.js";

const t = initTRPC.create();

/** Combines the backend's card lookup and health-check-style greeting procedures. */
export const appRouter = t.router({
	cards: cardsRouter,
	greeting: t.procedure.query(() => ({
		message: "Hello from the tRPC server!",
		fetchedAt: new Date().toISOString(),
	})),
});

/** Describes the complete backend API for end-to-end tRPC type inference. */
export type AppRouter = typeof appRouter;
