import type { NextConfig } from "next";

const backendInternalUrl = (
  process.env.BACKEND_INTERNAL_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "105mb",
  },
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.133.130",
  ],
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${backendInternalUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
