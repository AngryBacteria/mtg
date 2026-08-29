import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { httpBatchLink } from "@trpc/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router.tsx";
import { trpc } from "./trpc.ts";

/** Shared cache used by both direct React Query consumers and tRPC hooks. */
const queryClient = new QueryClient();

/**
 * Browser API client that batches tRPC operations through the server's `/trpc`
 * endpoint. The relative URL allows Vite's development proxy and a colocated
 * production deployment to use the same client configuration.
 */
const trpcClient = trpc.createClient({
	links: [httpBatchLink({ url: "/trpc" })],
});

/** Application-wide Mantine theme that gives controls a consistent accent color. */
const theme = createTheme({
	primaryColor: "teal",
});

/** DOM mount point provided by the client HTML entry document. */
const root = document.getElementById("root");

if (!root) {
	throw new Error("Root element not found");
}

createRoot(root).render(
	<StrictMode>
		<MantineProvider theme={theme}>
			<trpc.Provider client={trpcClient} queryClient={queryClient}>
				<QueryClientProvider client={queryClient}>
					<RouterProvider router={router} />
				</QueryClientProvider>
			</trpc.Provider>
		</MantineProvider>
	</StrictMode>,
);
