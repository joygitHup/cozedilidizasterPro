import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
const videoServiceUrl = process.env.VIDEO_SERVICE_URL || 'http://127.0.0.1:8600';
const storageServiceUrl = process.env.STORAGE_SERVICE_URL || 'http://127.0.0.1:8700';

const nextConfig: NextConfig = {
  // 保留 API 路径末尾斜杠，避免 Django APPEND_SLASH 对 POST 报 500
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/video-api/:path*',
        destination: `${videoServiceUrl}/:path*`,
      },
      {
        source: '/storage-api/:path*',
        destination: `${storageServiceUrl}/:path*`,
      },
      {
        source: '/api/:path*/',
        destination: `${backendUrl}/api/:path*/`,
      },
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*/`,
      },
    ];
  },
};

export default nextConfig;
