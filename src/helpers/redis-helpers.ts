import redis from "../config/redis.js";

const MAX_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS) || 3;
const BLOCK_TTL = (Number(process.env.BLOCK_TTL) || 15) * 60; // in seconds

const emailKey = (email: string) => `login_fail:email:${email.toLowerCase()}`;
const ipKey = (ip: string) => `login_fail:ip:${ip}`;

export const recordFailedLogin = async (email: string, ip: string) => {
  try {
    const pipeline = redis.pipeline();

    pipeline.incr(emailKey(email));
    pipeline.expire(emailKey(email), BLOCK_TTL);

    pipeline.incr(ipKey(ip));
    pipeline.expire(ipKey(ip), BLOCK_TTL);

    await pipeline.exec();
  } catch {
    console.warn("⚠️ Redis unavailable → skipping failed login tracking");
  }
};

export const clearLoginFailures = async (email: string, ip: string) => {
  try {
    await redis.del(emailKey(email), ipKey(ip));
  } catch {
    // silent fail
  }
};

export interface LoginBlockStatus {
  blocked: boolean;
  reason?: "EMAIL" | "IP";
  emailLeft: number;
  ipLeft: number;
  retryAfterSeconds?: number;
}

export const isLoginBlocked = async (
  email: string,
  ip: string
): Promise<LoginBlockStatus> => {
  try {
    const emailRedisKey = emailKey(email);
    const ipRedisKey = ipKey(ip);

    const [
      emailFails,
      ipFails,
      emailTTL,
      ipTTL
    ] = await Promise.all([
      redis.get(emailRedisKey),
      redis.get(ipRedisKey),
      redis.ttl(emailRedisKey),
      redis.ttl(ipRedisKey),
    ]);

    const emailCount = Number(emailFails || 0);
    const ipCount = Number(ipFails || 0);

    console.log(
      `🔐 Login attempts → email: ${emailCount}/${MAX_ATTEMPTS}, ip: ${ipCount}/${MAX_ATTEMPTS}`
    );

    if (emailCount >= MAX_ATTEMPTS) {
      return {
        blocked: true,
        reason: "EMAIL",
        emailLeft: 0,
        ipLeft: Math.max(0, MAX_ATTEMPTS - ipCount),
        retryAfterSeconds: emailTTL > 0 ? emailTTL : undefined,
      };
    }

    if (ipCount >= MAX_ATTEMPTS) {
      return {
        blocked: true,
        reason: "IP",
        emailLeft: Math.max(0, MAX_ATTEMPTS - emailCount),
        ipLeft: 0,
        retryAfterSeconds: ipTTL > 0 ? ipTTL : undefined,
      };
    }

    return {
      blocked: false,
      emailLeft: MAX_ATTEMPTS - emailCount,
      ipLeft: MAX_ATTEMPTS - ipCount,
    };
  } catch {
    console.warn("⚠️ Redis unavailable → skipping login block check");
    return {
      blocked: false,
      emailLeft: MAX_ATTEMPTS,
      ipLeft: MAX_ATTEMPTS,
    };
  }
};

