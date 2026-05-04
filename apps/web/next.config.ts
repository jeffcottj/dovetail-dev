import type { NextConfig } from 'next';

// API_URL is read at BUILD time and baked into the rewrite below.
// In Docker, set it via the API_URL build arg (see apps/web/Dockerfile).
const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    middlewareClientMaxBodySize: 104857600, // 100MB — needed for ZIP import uploads
  },
  env: {
    API_URL: process.env.API_URL ?? 'http://localhost:3001',
  },
  rewrites: async () => ({
    fallback: [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ],
  }),
};

export default nextConfig;
