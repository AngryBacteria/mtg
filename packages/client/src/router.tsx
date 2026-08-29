import {
	createRootRoute,
	createRoute,
	createRouter,
	Navigate,
} from "@tanstack/react-router";
import App from "./App.tsx";
import { PrintBleedUploader } from "./components/PrintBleedUploader.tsx";
import { DecklistParserPage } from "./pages/DecklistParserPage.tsx";

/**
 * Root of the client route tree, which keeps the application shell mounted while
 * users move between individual MTG tools.
 */
const rootRoute = createRootRoute({ component: App });

/**
 * Default entry route for the application.
 *
 * Navigation to `/` is replaced with `/images`, avoiding an extra history entry
 * while preserving the image formatter as the default tool.
 */
const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: () => <Navigate replace to="/images" />,
});

/** Route that mounts the browser-only print-bleed image workflow at `/images`. */
const imagesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/images",
	component: PrintBleedUploader,
});

/**
 * Route that mounts the text and CSV decklist matching workflow at `/decklist`.
 */
const decklistRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/decklist",
	component: DecklistParserPage,
});

/**
 * Complete route hierarchy supplied to TanStack Router.
 *
 * Each tool is a direct child of the shared shell so future route additions can
 * inherit the same navigation and content layout.
 */
const routeTree = rootRoute.addChildren([
	indexRoute,
	imagesRoute,
	decklistRoute,
]);

/**
 * Client-side router instance used by the React provider and registered below
 * so links, navigation, and route hooks retain this route tree's inferred types.
 */
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	/** Associates TanStack Router's global type registry with this application. */
	interface Register {
		router: typeof router;
	}
}
