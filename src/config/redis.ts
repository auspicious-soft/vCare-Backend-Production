import Redis from "ioredis";

const redis = new (Redis as any)({
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
});

redis.on("connect", () => {
  console.log("✅ Redis connected successfully");
});

redis.on("error", (err: any) => {
  console.error("❌ Redis error:", err);
});

export const isRedisAvailable = async (): Promise<boolean> => {
  try {
    await redis.ping();
    console.log("\x1b[32m%s\x1b[0m", "✅ Redis is working"); // green text
    return true;
  } catch (err) {
    console.warn(
      "\x1b[33m%s\x1b[0m",
      "⚠️ Redis unavailable! Features like IP-blocking, rate-limits, and caching will be skipped.",
    ); // yellow text
    return false;
  }
};

(async () => {
  try {
    await redis.ping();
    console.log("Redis ping successful");
  } catch {
    console.warn("Redis unavailable, running without rate-limit");
  }
})();

export default redis;
