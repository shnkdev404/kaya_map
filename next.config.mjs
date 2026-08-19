/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: [
    "localhost:3000",
    "127.0.0.1:3000",
    "*.local:3000",
    "192.168.*.*:3000",
    "10.*.*.*:3000",
    "172.*.*.*:3000"
  ],
};

export default nextConfig;
