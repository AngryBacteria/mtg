import { initTRPC } from "@trpc/server";

const t = initTRPC.create();

/** Root tRPC router exposed by the backend. */
export const appRouter = t.router({
	greeting: t.procedure.query(() => ({
		message: "Hello from the tRPC server!",
		fetchedAt: new Date().toISOString(),
	})),
});

/** Public type used by tRPC clients to infer the backend API. */
export type AppRouter = typeof appRouter;
