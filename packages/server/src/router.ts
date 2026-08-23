import { initTRPC } from "@trpc/server";

const t = initTRPC.create();

export const appRouter = t.router({
  greeting: t.procedure.query(() => ({
    message: "Hello from the tRPC server!",
    fetchedAt: new Date().toISOString(),
  })),
});

export type AppRouter = typeof appRouter;
