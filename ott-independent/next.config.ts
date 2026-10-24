import type { NextConfig } from "next";
import path from 'node:path';

const nextConfig: NextConfig = {
  distDir: process.env.ARENA_DEPLOYMENT === 'docker' ? '.next-docker' : process.env.ARENA_DEPLOYMENT === 'local-postgres' ? '.next-local' : '.next-vercel',
  ...(['docker', 'local-postgres'].includes(process.env.ARENA_DEPLOYMENT || '') ? { output: 'standalone' as const } : {}),
  outputFileTracingIncludes: { '/auth.css': ['./docker/auth.css'], '/api/sandbox': ['./public/sandbox/*.html'] },
  async headers() { return [{ source: '/pyodide/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }] }]; },
  webpack(config, { webpack }) {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^@\/lib\/platform$/, path.resolve(process.env.ARENA_DEPLOYMENT === 'docker' ? 'lib/platform-docker.ts' : 'lib/platform-vercel.ts')),
      ...(process.env.ARENA_DEPLOYMENT === 'docker' ? [] : [new webpack.NormalModuleReplacementPlugin(/^@\/lib\/auth-platform$/, path.resolve('lib/auth-vercel.ts'))]),
    );
    return config;
  },
};

export default nextConfig;
