import type { NextConfig } from 'next';

// The browser only ever talks to this site; /api/* is proxied to the backend.
// That keeps the session cookie first-party and means no CORS setup.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
