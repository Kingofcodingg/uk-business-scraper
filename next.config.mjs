/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => {
    return [
      {
        source: "/api/scrape",
        destination:
          process.env.NODE_ENV === "development"
            ? "http://127.0.0.1:8000/api/scrape"
            : "/api/scrape",
      },
    ];
  },
};

export default nextConfig;
