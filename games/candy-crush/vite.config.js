import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174
  },
  preview: {
    host: "127.0.0.1",
    port: 4174
  },
  build: {
    rollupOptions: {
      output: {
        // Phaser is only fetched once a level is actually opened (see
        // GameScreen.jsx's dynamic import), so keep it in its own chunk
        // instead of bloating the Home/Map screens' initial bundle.
        manualChunks: {
          phaser: ["phaser"]
        }
      }
    }
  }
});
