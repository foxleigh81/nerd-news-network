/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static HTML/CSS/JS export — no Node server at runtime.
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: {
    // Static export cannot run the Next image optimizer, so images are served
    // as-is. We compensate with explicit dimensions, lazy loading and
    // responsive sizes at the component level.
    unoptimized: true,
  },
  // Surface accessibility / quality issues early.
  poweredByHeader: false,
  // Native / heavy build-time-only deps must not be bundled into RSC output.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
