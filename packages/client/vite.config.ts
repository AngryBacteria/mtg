import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Builds the React client with Vite and the React Compiler transformation.
 *
 * During local development, relative `/trpc` requests are forwarded to the
 * Fastify server on port 3000. Production routing is intentionally left to the
 * deployment environment so the browser client can continue using a relative
 * endpoint.
 */
export default defineConfig({
	plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
	server: {
		proxy: {
			"/trpc": "http://localhost:3000",
		},
	},
});
