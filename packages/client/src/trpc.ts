import type { AppRouter } from "@mtg/server/router";
import { createTRPCReact } from "@trpc/react-query";

/**
 * Typed React integration for the server's root tRPC router.
 *
 * Components use this singleton to create queries and mutations whose inputs and
 * results are inferred from `AppRouter`; the actual transport and shared query
 * cache are attached by the providers in the client entry point.
 */
export const trpc = createTRPCReact<AppRouter>();
