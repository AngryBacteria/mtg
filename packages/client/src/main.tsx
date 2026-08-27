import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { trpc } from "./trpc.ts";

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
	links: [httpBatchLink({ url: "/trpc" })],
});

/** Defines application-wide Mantine component defaults and design tokens. */
const theme = createTheme({});

const root = document.getElementById("root");

if (!root) {
	throw new Error("Root element not found");
}

createRoot(root).render(
	<StrictMode>
		<MantineProvider theme={theme}>
			<trpc.Provider client={trpcClient} queryClient={queryClient}>
				<QueryClientProvider client={queryClient}>
					<App />
				</QueryClientProvider>
			</trpc.Provider>
		</MantineProvider>
	</StrictMode>,
);
