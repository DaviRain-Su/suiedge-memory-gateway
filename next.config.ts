import type { NextConfig } from 'next';

/**
 * Source uses explicit `.js` extensions on every relative import so it
 * works under Node's `--experimental-strip-types` (used by the MCP
 * server and the publish/migrate scripts). Next 16's Turbopack bundler
 * does not treat `./foo.js` as a request for `./foo.ts` by default, so
 * we have to tell its resolver: ".js" can also be satisfied by ".ts".
 * `webpack.resolve.extensionAlias` covers the same case for the legacy
 * webpack fallback.
 */
const nextConfig: NextConfig = {
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
