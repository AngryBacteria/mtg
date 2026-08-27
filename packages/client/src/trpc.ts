import type { AppRouter } from "@mtg/server/router";
import { createTRPCReact } from "@trpc/react-query";

/** Provides typed React Query hooks and client utilities for the backend API. */
export const trpc = createTRPCReact<AppRouter>();
