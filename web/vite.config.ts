import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Root is this directory, so `vite --config web/vite.config.ts` works from anywhere.
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react()],
});
