import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const target=process.env.CAPACITY_API_TARGET || "http://127.0.0.1:4102";
const headers={ Origin: process.env.CAPACITY_SERVER_ORIGIN || "http://127.0.0.1:4101" };
export default defineConfig({
  base: "/", plugins: [react()],
  server: { host: "127.0.0.1", port: 4251, strictPort: true,
    proxy: {
      "/api": { target, headers, changeOrigin: true },
      "/socket.io": { target, headers, ws: true, changeOrigin: true }
    }
  }
});
