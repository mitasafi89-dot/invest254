/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @printpesa/shared ships raw TypeScript (ESM with .js specifiers); let Next
  // transpile it and resolve the .js specifiers back to the .ts sources.
  transpilePackages: ['@printpesa/shared'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
