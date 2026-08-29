import {
	createRootRoute,
	createRoute,
	createRouter,
	Navigate,
} from "@tanstack/react-router";
import App from "./App.tsx";
import { PrintBleedUploader } from "./components/PrintBleedUploader.tsx";
import { DecklistParserPage } from "./pages/DecklistParserPage.tsx";

/** Root route that owns the navigation shell shared by all tools. */
const rootRoute = createRootRoute({ component: App });

/** Redirects the legacy root URL to the existing image-formatting tool. */
const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: () => <Navigate replace to="/images" />,
});

/** Route for preparing card images with print bleed. */
const imagesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/images",
	component: PrintBleedUploader,
});

/** Route for resolving custom-text and CSV decklists against the card database. */
const decklistRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/decklist",
	component: DecklistParserPage,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	imagesRoute,
	decklistRoute,
]);

/** Client-side router for the MTG utility pages. */
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
