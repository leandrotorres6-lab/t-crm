/** @type {import('next').NextConfig} */
const nextConfig = {
  // Garante que páginas client-side não são cacheadas incorretamente pelo App Router
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
}
module.exports = nextConfig
