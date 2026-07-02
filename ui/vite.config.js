import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], server: { host: "127.0.0.1", port: 43141, proxy: { "/api": "http://127.0.0.1:43140" } }, test: { environment: "jsdom", setupFiles: "./src/test/setup.ts", css: true } });
