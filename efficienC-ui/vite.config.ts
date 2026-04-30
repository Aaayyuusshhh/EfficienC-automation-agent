import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/tasks":      "http://localhost:5000",
      "/command":    "http://localhost:5000",
      "/complete":   "http://localhost:5000",
      "/delete":     "http://localhost:5000",
      "/logs":       "http://localhost:5000",
      "/transcribe": "http://localhost:5000",
      "/contacts":   "http://localhost:5000",
      "/scheduled":  "http://localhost:5000",
      "/events":     { target: "http://localhost:5000", changeOrigin: true },
    },
  },
});
