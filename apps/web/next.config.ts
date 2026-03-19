import type { NextConfig } from 'next';

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
