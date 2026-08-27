import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Enables React compilation and proxies local tRPC requests to the backend server. */
export default defineConfig({
	plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
	server: {
		proxy: {
			"/trpc": "http://localhost:3000",
		},
	},
});
