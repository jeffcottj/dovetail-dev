import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL ?? 'http://localhost:3001',
  },
  rewrites: async () => [
    { source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://localhost:3001'}/api/:path*` },
  ],
};

export default nextConfig;
