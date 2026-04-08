/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Only use rewrites when NEXT_PUBLIC_API_URL is set (dev/test with separate backend port).
  // In prod, Apache reverse-proxies /api/v1/ directly so no rewrite needed.
  async rewrites() {
    if (!apiUrl) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
