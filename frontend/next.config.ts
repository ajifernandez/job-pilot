import type { NextConfig } from "next";

// Export estático: lo sirve FastAPI en producción (mismo origen que /api)
const nextConfig: NextConfig = { output: "export", trailingSlash: true };

export default nextConfig;
