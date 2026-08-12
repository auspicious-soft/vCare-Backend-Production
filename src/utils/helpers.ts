import { configDotenv } from "dotenv";
import redis from "../config/redis.js";
import { CourseModel } from "../models/course-schema.js";
import { Resend } from "resend";
import { UserModel } from "../models/user-schema.js";
import { LessonModel } from "../models/lessons-schema.js";
import { PracticeExamModel } from "../models/practice-exam-schema.js";
import { MockExamModel } from "../models/mock-exam-schema.js";
import type { reportTypeEnum } from "../models/report-problem-schema.js";
import { PurchaseModel } from "../models/purchase-schema.js";
import { CompanyInfoModel } from "../models/company-info-schema.js";
import rateLimit from "express-rate-limit";
configDotenv();


export const enquiryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const resend = new Resend(process.env.RESEND_API_KEY);
export const CheckCourseExist = async (courseId: any) => {
  try {
    if (!courseId) {
      return "Course id is required";
    }
    // await redis.flushall();
    // const cacheKey = "COURSES:ACTIVE";
    // const cached = await redis.get(cacheKey);
    let checkExist;
    // if (cached) {
    //   checkExist = JSON.parse(cached).find((data: any) => data._id == courseId);
    // } else {
      checkExist = await CourseModel.findById(courseId);
    // }

    if (!checkExist) {
      return "Course doesn't exist";
    }

    return true;
  } catch (err: any) {
    return "Something went wrong";
  }
};
export const CheckCourseExistUser = async (courseId: any) => {
  try {
    if (!courseId) {
      return "Course id is required";
    }
    // await redis.flushall();
    // const cacheKey = "COURSES:ACTIVE";
    // const cached = await redis.get(cacheKey);
    let checkExist;
    // if (cached) {
    //   checkExist = JSON.parse(cached).find((data: any) => data._id == courseId);
    // } else {
      checkExist = await CourseModel.findOne({ _id: courseId, status: "ACTIVE" });
    // }

    if (!checkExist) {
      return "Course doesn't exist";
    }

    return true;
  } catch (err: any) {
    return "Something went wrong";
  }
};

// To Clear Cache Of Specific Key
export const clearCache = async (key: string) => {
  try {
    await redis.del(key);
    console.log(`Cache cleared for key: ${key}`);
  } catch (err) {
    console.error(`Error clearing cache for key ${key}:`, err);
  }
};

// Dashboard Data Caching

export const cachedTotalUsers = async () => {
  try {
    // const cacheKey = "DASHBOARD:TOTAL_USERS";

    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }

    const totalUsers = await UserModel.countDocuments({
      status: "ACTIVE",
    });

    // await redis.set(cacheKey, JSON.stringify(totalUsers), "EX", 60 * 60);

    return totalUsers || 0;
  } catch (err: any) {
    console.error("cachedTotalUsers error:", err);
    return 0;
  }
};

export const cached7daysOldUsers = async () => {
  try {
    // const cacheKey = "DASHBOARD:LAST_7_DAYS_USERS";

    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const totalUsers = await UserModel.countDocuments({
      status: "ACTIVE",
      createdAt: { $gte: sevenDaysAgo }, // 🔥 changed here
    });

    // await redis.set(cacheKey, JSON.stringify(totalUsers), "EX", 60 * 60);

    return totalUsers || 0;
  } catch (err: any) {
    console.error("cachedLast7DaysUsers error:", err);
    return 0;
  }
};
export const cachedPlanDuration = async () => {
  try {
    // const cacheKey = "DASHBOARD:PLAN_DURATION";

    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }

    const companyDetails = await CompanyInfoModel.findOne();
    const data = {
      individualDuration: companyDetails?.individualDuration,
      freeTrailDuration: companyDetails?.freeTrailDuration,
    };

    // await redis.set(cacheKey, JSON.stringify(data), "EX", 60 * 60);

    return data || 0;
  } catch (err: any) {
    console.error("cachedLast7DaysUsers error:", err);
    return 0;
  }
};

export const trackDailyActiveUser = async (userId: string) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const key = `DAU:${today}`;

    // ✅ Add user to set (auto unique)
    await redis.sadd(key, userId);

    // ✅ Set expiry only if not already set
    const ttl = await redis.ttl(key);
    if (ttl === -1) {
      await redis.expire(key, 60 * 60 * 24 * 2); // ⏱️ 2 days buffer
    }
  } catch (err) {
    console.error("DAU tracking error:", err);
  }
};

export const getTodayActiveUsers = async () => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const key = `DAU:${today}`;

    const count = await redis.scard(key); // ✅ set count

    return count || 0;
  } catch (err) {
    console.error("Get DAU error:", err);
    return 0;
  }
};

export const cachedTotalModules = async () => {
  try {
    // const cacheKey = "DASHBOARD:TOTAL_MODULES";

    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }

    const totalModules = await LessonModel.countDocuments({
      status: "ACTIVE",
    });

    // await redis.set(cacheKey, JSON.stringify(totalModules), "EX", 60 * 60);

    return totalModules || 0;
  } catch (err: any) {
    console.error("cachedTotalModules error:", err);
    return 0;
  }
};
export const cachedNewSubscriptionLast7Days = async () => {
  try {
    // const cacheKey = "DASHBOARD:NEW_SUBSCRIPTION_LAST_7_DAYS";

    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const totalModules = await PurchaseModel.countDocuments({
      status: "SUCCESS",
      type: "SUBSCRIPTION",
      purchaseDate: {
        $gte: sevenDaysAgo,
        $lte: today,
      },
    });
    // await redis.set(cacheKey, JSON.stringify(totalModules), "EX", 60 * 60);

    return totalModules;
  } catch (err: any) {
    console.error("cachedTotalModules error:", err);
    return 0;
  }
};

export const cachedTotalExams = async () => {
  try {
    // const cacheKey = "DASHBOARD:TOTAL_EXAMS";

    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }

    const [practiceExamCount, mockExamCount] = await Promise.all([
      PracticeExamModel.countDocuments({ status: "ACTIVE" }),
      MockExamModel.countDocuments({ status: "ACTIVE" }),
    ]);

    // await redis.set(
    //   cacheKey,
    //   JSON.stringify(practiceExamCount + mockExamCount),
    //   "EX",
    //   60 * 60,
    // );

    return practiceExamCount + mockExamCount || 0;
  } catch (err: any) {
    console.error("cachedTotalExams error:", err);
    return 0;
  }
};

// utils/s3.ts

export const getS3Url = (path?: string): string => {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base =
    process.env.AWS_BUCKET_PATH ||
    process.env.NEXT_PUBLIC_AWS_BUCKET_PATH ||
    "";

  if (!base) {
    return path;
  }

  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");

  return `${cleanBase}/${cleanPath}`;
};

export const getEndDateFromMonths = (
  months: number,
): {
  endDate: Date;
  endDateISO: string;
} => {
  if (!months || months <= 0) {
    throw new Error("Months must be a positive number");
  }

  const now = new Date();
  const endDate = new Date(now);

  // add months safely
  endDate.setMonth(endDate.getMonth() + Number(months));

  // normalize time (end of day)
  endDate.setHours(23, 59, 59, 999);

  return {
    endDate,
    endDateISO: endDate.toISOString(),
  };
};

export const reportTypeMapper: Record<(typeof reportTypeEnum)[number], string> =
  {
    "MOCK-EXAM": "Mock Exam",
    "PRACTICE-EXAM": "Practice Exam",
    "DOMAIN-TASK": "Domain Task",
    "LESSON-VIDEO": "Lesson Video",
    "QUESTION-OF-THE-DAY": "Question of the Day",
    "FLASH-CARD": "Flash Card",
    "APPLICATION-SUPPORT": "Application Support",
    "EXAM-STRATEGY": "Exam Strategy",
    SUBSCRIPTION: "Subscription",
    "EXAM-REPORTS": "Exam Reports",
    CERTIFICATES: "Certificates",
    "CHANGE-PASSWORD": "Change Password",
    OTHERS: "Others",
  };
