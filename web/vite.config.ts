import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Root is this directory, so `vite --config web/vite.config.ts` works from anywhere.
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react()],
  server: {
    // The devbox tunnel forwards a *.tunnel.runloop.ai host to this port, and
    // Vite's host check rejects it by default. Allow the whole tunnel domain
    // (the subdomain changes between sessions) rather than one specific host.
    allowedHosts: [".tunnel.runloop.ai"],
  },
});
