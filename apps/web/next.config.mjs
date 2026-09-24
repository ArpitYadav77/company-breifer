/** @type {import('next').NextConfig} */
// Server-side proxy target. In Docker, reach the API by its compose service name
// (`api`), not localhost — each container has its own localhost.
const API = process.env.API_URL || "http://localhost:8000";

const nextConfig = {
  async rewrites() {
    // Proxy API + webhooks to the FastAPI backend so the browser hits one origin.
    return [
      { source: "/api/:path*", destination: `${API}/api/:path*` },
      { source: "/health", destination: `${API}/health` },
    ];
  },
};

export default nextConfig;
