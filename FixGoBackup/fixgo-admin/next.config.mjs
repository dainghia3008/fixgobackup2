/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true }, // không dùng trình tối ưu ảnh (tránh bề mặt tấn công không cần thiết)
};
export default nextConfig;
