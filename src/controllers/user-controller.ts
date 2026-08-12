import type { Request, Response } from "express";
import {
  BADREQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  OK,
  UNAUTHORIZED,
} from "../utils/responses.js";
import { CheckCourseExistUser, reportTypeMapper } from "../utils/helpers.js";
import { LessonModel } from "../models/lessons-schema.js";
import { ProgressModel } from "../models/progress-schema.js";
import { BookmarkModel } from "../models/bookmark-schema.js";
import mongoose, { Query } from "mongoose";
import { DomainModel } from "../models/domains-schema.js";
import { TaskModel } from "../models/tasks-schema.js";
import { getFileUrl, getFileUrlUser, shuffleArray } from "../helpers/index.js";
import { ApplicationSupportModel } from "../models/application-support-schema.js";
import { ExamStrategyModel } from "../models/exam-strategy-schema.js";
import { PracticeExamModel } from "../models/practice-exam-schema.js";
import { QuestionModel } from "../models/questions-schema.js";
import { PracticeExamResultModel } from "../models/practice-exam-result-schema.js";
import { MockExamModel } from "../models/mock-exam-schema.js";
import { MockExamResultModel } from "../models/mock-exam-result-schema.js";
import { MockExamQuestionModel } from "../models/mock-exam-questions.js";
import {
  ReportProblemModel,
  reportTypeEnum,
  reportTypeForUser,
} from "../models/report-problem-schema.js";
import { UserDashboardModel } from "../models/user-dashboard-schema.js";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/user-schema.js";
import { CompanyInfoModel } from "../models/company-info-schema.js";
import { Parser } from "json2csv";
import redis from "../config/redis.js";
import { CourseModel } from "../models/course-schema.js";
import { PurchaseModel } from "../models/purchase-schema.js";
import { FlashCardCategoryModel } from "../models/flash-card-category-schema.js";
import { FlashCardModel } from "../models/flash-card-schema.js";
import { IssueCertificateModel } from "../models/issue-certificate-schema.js";
import { createIssuingCertificate } from "./template-controller.js";
import { RatingModel } from "../models/ratings-schema.js";
import { AdminModel } from "../models/admin-schema.js";
import { PlanModel } from "../models/plans-schema.js";
import { DateTime } from "luxon";
import { NotificationModel } from "../models/notification-schema.js";
import { fromZonedTime } from "date-fns-tz";
import { customAlphabet } from "nanoid";
import { Readable } from "stream";
import csvParser from "csv-parser";
import {
  sendLoginCredentials,
  sendProblemReportedEmailToOwner,
} from "../utils/mail-helper.js";
import { deleteFileFromS3 } from "../config/s3.js";

export const getUserCourses = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    // const cacheKey = "COURSES:ACTIVE";

    let courseData: any[] = [];

    // -------------------------------
    // Get Courses (Redis -> Mongo)
    // -------------------------------
    // const cached = await redis.get(cacheKey);

    // if (cached) {
    //   courseData = JSON.parse(cached);
    // } else {
    courseData = await CourseModel.find({ status: "ACTIVE" })
      .sort({ order: 1 })
      .lean();

    // await redis.set(cacheKey, JSON.stringify(courseData));
    // }

    // -------------------------------
    // Get Purchases
    // -------------------------------
    const purchaseData = await PurchaseModel.find({
      userId,
      purchaseType: "COURSE",
    })
      .sort({ purchaseAmount: -1 }) // newest first
      .lean();

    // -------------------------------
    // Build Purchase Map
    // SUCCESS wins.
    // Otherwise latest record wins.
    // -------------------------------
    const purchaseMap = new Map<string, any>();

    for (const purchase of purchaseData) {
      const key = purchase.purchasedProduct.toString();

      const existing = purchaseMap.get(key);

      if (!existing) {
        purchaseMap.set(key, purchase);
        continue;
      }

      // Existing SUCCESS should never be replaced
      if (existing.status === "SUCCESS") {
        continue;
      }

      // SUCCESS replaces anything else
      if (purchase.status === "SUCCESS") {
        purchaseMap.set(key, purchase);
        continue;
      }

      // Since records are already sorted newest first,
      // keep the first non-success record.
    }

    // -------------------------------
    // Build Response
    // -------------------------------
    const finalResult = courseData?.map((course: any) => {
      const purchase = purchaseMap.get(course._id.toString());

      if (!purchase) {
        return {
          ...course,
          image: getFileUrlUser(course.image),
          purchaseStatus: null,
          purchaseType: "COURSE",
          daysLeft: 0,
          status: course.price === 0 ? "ACTIVE" : course.status,
        };
      }

      let daysLeft = 0;

      if (purchase.endDate) {
        const now = new Date();
        const end = new Date(purchase.endDate);

        const diff = end.setHours(23, 59, 59, 999) - now.getTime();

        daysLeft = Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
      }

      let courseStatus = "ACTIVE";

      if (course.price !== 0) {
        if (purchase.status === "SUCCESS") {
          courseStatus = daysLeft > 0 ? "ACTIVE" : "EXPIRED";
        } else {
          courseStatus = purchase.status;
        }
      }

      return {
        ...course,
        purchaseStatus: purchase.type,
        purchaseType: purchase.purchaseType,
        daysLeft,
        status: courseStatus,
        image: getFileUrlUser(course?.image),
      };
    });

    return OK(res, finalResult, "Courses fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const userHome = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { id } = (req as any).params;

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const courseObjectId = new mongoose.Types.ObjectId(id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    /* ---------------- PARALLEL FETCH ---------------- */

    const [
      unreadNotifications,
      bookmarks,
      modules,
      progressList,
      progressData,
      examData,
      dashboardData,
      inProgress,
      completed,
      dashboard,
      subscription,
      coursePurchases,
      mockExamTimeData,
      practiceExamTimeData,
    ] = await Promise.all([
      NotificationModel.find({
        courseId: new mongoose.Types.ObjectId(id),
        isSent: true,
        isRead: {
          $nin: [userId.toString()],
        },
      }).lean(),
      BookmarkModel.find({
        type: "LESSON",
        userId: new mongoose.Types.ObjectId(userId),
        isAttempted: true,
      })
        .populate("moduleId")
        .lean(),

      LessonModel.find({ courseId: id, status: "ACTIVE" }).lean(),

      ProgressModel.find({ userId, moduleId: { $ne: null } })
        .populate("moduleId")
        .populate("userId", "fullName image")
        .lean(), // ✅ single source of truth

      ProgressModel.find({ userId })
        .populate("userId", "fullName image")
        .populate("moduleId")
        .populate("domainId")
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),

      MockExamResultModel.find({
        userId,
        status: "ACTIVE",
      })
        .populate({
          path: "mockExamId",
          populate: { path: "courseId" },
        })
        .populate("userId", "fullName image")
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),

      UserDashboardModel.find({ userId })
        .populate("userId", "fullName image")
        .populate("courseId")
        .populate("questionOfTheDay")
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),

      /* -------- AGGREGATIONS -------- */

      MockExamResultModel.aggregate([
        { $match: { userId: userObjectId, currentStatus: "PAUSED" } },
        {
          $lookup: {
            from: "mockexams",
            localField: "mockExamId",
            foreignField: "_id",
            as: "exam",
          },
        },
        { $unwind: "$exam" },
        { $match: { "exam.courseId": courseObjectId } },
        {
          $project: {
            examName: "$exam.name",
            userId: 1,
            mockExamId: 1,
            lastQuestionId: 1,
            currentStatus: 1,
            availableTime: 1,
            correct: 1,
            incorrect: 1,
            unanswered: 1,
            remarks: 1,
            overallPercentage: 1,
            scoreBreakDown: 1,
            timeTaken: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            attemptNumber: 1,
          },
        },
      ]),

      MockExamResultModel.aggregate([
        { $match: { userId: userObjectId, currentStatus: "COMPLETED" } },
        {
          $lookup: {
            from: "mockexams",
            localField: "mockExamId",
            foreignField: "_id",
            as: "exam",
          },
        },
        { $unwind: "$exam" },
        { $match: { "exam.courseId": courseObjectId } },
        { $project: { exam: 0 } },
      ]),

      /* -------- DASHBOARD UPSERT -------- */

      UserDashboardModel.findOneAndUpdate(
        { userId, courseId: id },
        { $setOnInsert: { userId } },
        { new: true, upsert: true },
      ).lean(),

      /* -------- PURCHASES -------- */

      PurchaseModel.findOne({
        purchasedProduct: { $in: [id, new mongoose.Types.ObjectId(id)] },
        userId,
        status: "SUCCESS",
      })
        .sort({ purchaseAmount: -1 })
        .populate("planId")
        .lean() as any,

      PurchaseModel.find({
        purchasedProduct: { $in: [id, new mongoose.Types.ObjectId(id)] },
        userId,
        status: "SUCCESS",
      })
        .sort({ purchaseAmount: -1 })
        .populate("planId")
        .lean() as any,

      MockExamResultModel.aggregate([
        {
          $match: {
            userId: userObjectId,
            timeTaken: { $nin: [null, "", "00:00:00"] },
          },
        },
        {
          $lookup: {
            from: "mockexams",
            localField: "mockExamId",
            foreignField: "_id",
            as: "exam",
          },
        },
        { $unwind: "$exam" },
        { $match: { "exam.courseId": courseObjectId } },
        {
          $project: {
            timeTaken: 1,
          },
        },
      ]),

      PracticeExamResultModel.aggregate([
        {
          $match: {
            userId: userObjectId,
            timeTaken: { $nin: [null, "", "00:00:00"] },
          },
        },
        {
          $lookup: {
            from: "practiceexams",
            localField: "examId",
            foreignField: "_id",
            as: "exam",
          },
        },
        { $unwind: "$exam" },
        { $match: { "exam.courseId": courseObjectId } },
        {
          $group: {
            _id: {
              examId: "$examId",
              attemptNumber: "$attemptNumber",
            },
            timeTaken: { $max: "$timeTaken" },
          },
        },
        {
          $project: {
            _id: 0,
            timeTaken: 1,
          },
        },
      ]),
    ]);

    /* ---------------- TIME SPENT (OPTIMIZED) ---------------- */

    const progressMap = new Map(
      progressList.map((p: any) => [p.moduleId?.toString(), p.percentage]),
    );

    let totalSeconds = 0;

    for (const module of modules) {
      const progress = progressMap.get(module._id.toString());
      if (!progress) continue;

      const moduleDuration = (module.lessons || []).reduce(
        (sum: number, lesson: any) => {
          if (!lesson.duration) return sum;
          const [min, sec] = lesson.duration.split(":").map(Number);
          return sum + (min || 0) * 60 + (sec || 0);
        },
        0,
      );

      totalSeconds += (moduleDuration * progress) / 100;
    }

    /* ---------------- MOCK STATS ---------------- */

    const parseLessonDuration = (duration: string) => {
      if (!duration) return 0;

      const [minutes = 0, seconds = 0] = duration.split(":").map(Number);

      return minutes + seconds / 60;
    };

    // MOCK EXAM FORMAT => HH:MM:SS
    const parseExamDuration = (duration: string) => {
      if (!duration) return 0;

      const [hours = 0, minutes = 0, seconds = 0] = duration
        .split(":")
        .map(Number);

      return hours * 60 + minutes + seconds / 60;
    };

    const mockTestAvgScore =
      completed.length > 0
        ? completed.reduce(
            (sum: number, item: any) => sum + (item.overallPercentage || 0),
            0,
          ) / completed.length
        : 0;

    let totalLearningMinutes = 0;

    // avoid duplicate lesson duration counting
    const countedLessonIds = new Set<string>();

    for (const item of bookmarks as any[]) {
      if (item.type === "LESSON" && item.lessonsId && item.moduleId) {
        const moduleData: any = item.moduleId;

        // course filter
        if (moduleData?.courseId?.toString() !== id.toString()) {
          continue;
        }

        const lesson = moduleData?.lessons?.find(
          (l: any) => l._id.toString() === item.lessonsId.toString(),
        );

        if (!lesson) continue;

        // prevent duplicate count
        if (countedLessonIds.has(lesson._id.toString())) {
          continue;
        }

        countedLessonIds.add(lesson._id.toString());

        totalLearningMinutes += parseLessonDuration(lesson.duration || "0:00");
      }
    }

    const mockExamMinutes = mockExamTimeData.reduce(
      (sum: number, item: any) => {
        return sum + parseExamDuration(item.timeTaken || "00:00:00");
      },
      0,
    );
    const practiceExamMinutes = practiceExamTimeData.reduce(
      (sum: number, item: any) => {
        return sum + parseExamDuration(item.timeTaken || "00:00:00");
      },
      0,
    );

    totalLearningMinutes += mockExamMinutes + practiceExamMinutes;

    const totalHours = Math.floor(totalLearningMinutes / 60);

    const remainingMinutes = Math.floor(totalLearningMinutes % 60);

    const formattedTimeSpent = `${totalHours}h ${remainingMinutes}m`;

    const stats = {
      inProgress: inProgress.length,
      completed: completed.length,
      timeSpent: formattedTimeSpent,
      mockTestAvgScore: Number(mockTestAvgScore.toFixed(2)),
    };

    /* ---------------- QUESTION OF THE DAY ---------------- */
    const canViewQuestionOfTheDay = coursePurchases.some((purchase: any) =>
      Boolean(purchase?.planId?.questionOfTheDay),
    );
    let questionOfTheDayResponse: any = {
      status: "NOT_ACCESSABLE",
    };
    if (coursePurchases.length === 0) {
      questionOfTheDayResponse = {
        status: "NOT_PURCHASED",
      };
    }

    if (canViewQuestionOfTheDay) {
      const lastUpdated = dashboard.questionUpdatedAt
        ? new Date(dashboard.questionUpdatedAt)
        : null;

      let questionId = dashboard.questionOfTheDay;
      let isAttempted = dashboard.isQuestionOfTheDayAttempted;

      if (!lastUpdated || lastUpdated < today) {
        const randomQuestion = await QuestionModel.aggregate([
          { $match: { courseId: courseObjectId } },
          { $sample: { size: 1 } },
        ]);

        const newQuestionId = randomQuestion?.[0]?._id;

        if (newQuestionId) {
          questionId = newQuestionId;
          isAttempted = false;

          await UserDashboardModel.updateOne(
            { userId, courseId: id },
            {
              $set: {
                questionOfTheDay: newQuestionId,
                questionUpdatedAt: today,
                isQuestionOfTheDayAttempted: false,
              },
            },
          );
        }
      }

      const questionOfTheDay =
        !isAttempted && questionId
          ? await QuestionModel.findById(questionId).lean()
          : null;

      questionOfTheDayResponse = {
        status: "ACCESSABLE",
        ...questionOfTheDay,
        attemptId: dashboard?._id,
      };
    }

    /* ---------------- EXAM SCHEDULE ---------------- */

    let daysLeftForScheduledExam: number | null = null;

    if (dashboard.examScheduled && dashboard.examScheduledAt) {
      const examDate = new Date(dashboard.examScheduledAt);
      examDate.setHours(0, 0, 0, 0);

      const diff = examDate.getTime() - today.getTime();
      daysLeftForScheduledExam = diff >= 0 ? diff / 86400000 : null;
    }

    /* ---------------- ACTIVITIES ---------------- */

    const activities: any[] = [];

    progressData.forEach((item: any) => {
      if (item.moduleId) {
        activities.push({
          type: "MODULE_PROGRESS",
          message: `Completed ${item.percentage}% of module "${item.moduleId.module}"`,
          percentage: item.percentage,
          refId: item.moduleId?._id,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          userDetails: {
            ...item.userId,
            image: item?.userId?.image
              ? getFileUrl(item.userId.image)
              : item.userId.image,
          },
        });
      }

      if (item.domainId) {
        activities.push({
          type: "DOMAIN_PROGRESS",
          message: `Completed ${item.percentage}% of domain "${item.domainId.domain}"`,
          percentage: item.percentage,
          refId: item.domainId?._id,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          userDetails: {
            ...item.userId,
            image: item?.userId?.image
              ? getFileUrl(item.userId.image)
              : item.userId.image,
          },
        });
      }
    });

    examData.forEach((item: any) => {
      activities.push({
        _id: item._id,
        currentStatus: item.currentStatus,
        type: "MOCK_EXAM",
        message: `Attempted mock exam "${item.mockExamId?.name}" and scored ${item.overallPercentage}%`,
        score: item.overallPercentage,
        correct: item.correct,
        incorrect: item.incorrect,
        examId: item.mockExamId?._id,
        courseName: item.mockExamId?.courseId?.name,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        userDetails: {
          ...item.userId,
          image: item?.userId?.image
            ? getFileUrl(item.userId.image)
            : item.userId.image,
        },
      });
    });

    dashboardData.forEach((item: any) => {
      if (item.examScheduled && item.examScheduledAt) {
        activities.push({
          type: "EXAM_SCHEDULED",
          message: `Scheduled an exam for`,
          scheduledFor: item.examScheduledAt,
          courseName: item.courseId?.name,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          userDetails: {
            ...item.userId,
            image: item?.userId?.image
              ? getFileUrl(item.userId.image)
              : item.userId.image,
          },
        });
      }

      if (item.isQuestionOfTheDayAttempted) {
        activities.push({
          type: "QUESTION_OF_DAY",
          message: `Attempted Question of the Day`,
          questionId: item.questionOfTheDay?._id,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          userDetails: item.userId,
        });
      }
    });

    activities.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );

    /* ---------------- LESSON PROGRESS (SORTED) ---------------- */

    const sortedLessonProgress = [...(progressList || [])].sort(
      (a: any, b: any) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );

    /* ---------------- RESPONSE (UNCHANGED) ---------------- */
    console.log("coursePurchases", coursePurchases);
    return OK(
      res,
      {
        stats,
        hasNotification: unreadNotifications.length > 0,
        pausedExams: inProgress,
        canViewLessons: subscription?.planId ? true : false,
        canViewExams: subscription?.planId?.mockExams ? true : false,
        examCompletedPercentage: ((completed.length / 100) * 100).toFixed(2),
        daysLeftForScheduledExam,
        examDate: dashboard?.examScheduledAt || null,
        questionOfTheDay: questionOfTheDayResponse,
        subscription:
          subscription?.type === "FREE_TRIAL"
            ? "FREE_TRIAL"
            : subscription?.planId?.planName || false,
        subscriptionData: subscription || null,
        activities,
        lessonProgress: sortedLessonProgress?.map((val: any) => {
          const data = val?.moduleId?.lessons?.map((val2: any) => {
            if (val2?.fileLink) {
              return {
                ...val2,
                fileLink: val2?.fileLink
                  ? getFileUrl(val2.fileLink)
                  : val2.fileLink,
              };
            } else {
              return val2;
            }
          });
          return {
            ...val,
            moduleId: { ...val.moduleId, lessons: data },
            userId: {
              ...val.userId,
              image: val?.userId?.image
                ? getFileUrl(val?.userId?.image)
                : val?.userId?.image,
            },
          };
        }), // ⚠️ unchanged structure assumption
      },
      "Data Fetched",
    );
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const adminUpdateUser = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      firstname,
      lastname,
      phoneNumber,
      countryCode,
      password,
      image,
    } = req.body as any;

    if (!userId) throw new Error("userId is required");

    const user: any = await UserModel.findById(userId);
    if (!user) throw new Error("User not found");

    if (firstname !== undefined) user.firstname = String(firstname).trim();
    if (lastname !== undefined) user.lastname = String(lastname).trim();
    if (firstname !== undefined || lastname !== undefined) {
      user.fullName = `${user.firstname || ""} ${user.lastname || ""}`.trim();
    }

    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (countryCode !== undefined) user.countryCode = countryCode;
    if (image !== undefined) user.image = image;

    // Handle password change
    if (password !== undefined && String(password).length > 0) {
      const plain = String(password);
      user.password = await bcrypt.hash(plain, 10);

      // Send email to user with new password
      await sendLoginCredentials(user.email, plain, user.firstname || "there");
    }

    await user.save();

    const userObj: any = user.toObject ? user.toObject() : user;
    if (userObj.password) delete userObj.password;

    return OK(res, userObj, "User updated successfully");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const scheduleExam = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { date, timeZone } = req.body;
    if (!date) {
      throw new Error("Date is required");
    }
    if (!timeZone) {
      throw new Error("Time zone is required");
    }

    const examDate = fromZonedTime(date, timeZone);
    const dashboard = await UserDashboardModel.findOneAndUpdate(
      { userId, courseId: req.query.courseId },
      {
        $set: {
          examScheduled: true,
          examScheduledAt: examDate,
        },
        $setOnInsert: {
          userId,
        },
      },
      { new: true, upsert: true },
    ).lean();

    return OK(res, dashboard, "Exam scheduled successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const attemptQuestionOfTheDay = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { id: courseId } = req.params;
    const { id } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ✅ prevent multiple attempts same day
    const existing = await UserDashboardModel.findOne({
      _id: id,
      userId,
      courseId,
      isQuestionOfTheDayAttempted: true,
      questionUpdatedAt: { $gte: today },
    });

    if (existing) {
      return BADREQUEST(res, "Already attempted today");
    }

    const dashboard = await UserDashboardModel.findOneAndUpdate(
      { _id: id, userId, courseId },
      {
        $set: {
          isQuestionOfTheDayAttempted: true,
          // ❌ DO NOT TOUCH questionUpdatedAt here
        },
      },
      { new: true },
    ).lean();

    return OK(res, dashboard, "Attempted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// Lessons & Videos
export const usersLessonsAndVideos = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as any;
    const userId = (req as any).user?._id;

    const check = await CheckCourseExistUser(id);
    if (typeof check === "string") throw new Error(check);

    /* -------------------------------------------------- */
    /* ✅ FETCH BASE DATA */
    /* -------------------------------------------------- */
    const lessons = await LessonModel.find({
      courseId: id,
      status: "ACTIVE",
    }).lean();

    const moduleIds = lessons.map((l: any) => l._id);
    const lessonIds = lessons.flatMap((l: any) =>
      l.lessons.map((ls: any) => ls._id),
    );

    /* -------------------------------------------------- */
    /* ✅ PARALLEL FETCH */
    /* -------------------------------------------------- */
    const [
      progressList,
      bookmarkList,
      questionCounts,
      planDetails,
      individualPurchase,
    ] = await Promise.all([
      ProgressModel.find({ userId, moduleId: { $in: moduleIds } }).lean(),

      BookmarkModel.find({
        userId,
        isBookmarked: true,
        lessonsId: { $in: lessonIds },
        type: "LESSON",
      }).lean(),

      QuestionModel.aggregate([
        {
          $match: {
            courseId: new mongoose.Types.ObjectId(id),
            lessonId: { $in: moduleIds },
            status: "ACTIVE",
          },
        },
        { $group: { _id: "$lessonId", count: { $sum: 1 } } },
      ]),

      PurchaseModel.findOne({
        userId,
        purchasedProduct: { $in: [id, new mongoose.Types.ObjectId(id)] },
        endDate: { $gte: new Date() },
        status: "SUCCESS",
      })
        .sort({ purchaseAmount: -1 })
        .populate("planId")
        .lean() as any,

      PurchaseModel.find({
        userId,
        purchaseType: "LESSONS",
        type: "INDIVIDUAL",
        endDate: { $gte: new Date() },
        status: "SUCCESS",
      }).lean(),
    ]);

    /* -------------------------------------------------- */
    /* ✅ FAST LOOKUPS */
    /* -------------------------------------------------- */
    const progressMap = new Map(
      progressList?.map((p: any) => [p?.moduleId?.toString(), p.percentage]),
    );

    const bookmarkSet = new Set(
      bookmarkList?.map((b: any) => b?.lessonsId?.toString()),
    );

    const questionMap = new Map(
      questionCounts?.map((q: any) => [q._id.toString(), q.count]),
    );

    const purchasedModuleSet = new Set(
      (individualPurchase || [])?.map((p: any) =>
        p.purchasedProduct?.toString(),
      ),
    );

    /* -------------------------------------------------- */
    /* ✅ ACCESS CONTROL FUNCTION */
    /* -------------------------------------------------- */
    const getLessonAccess = (
      moduleId: string,
      moduleIndex: number,
      lessonIndex: number,
      originalLink: string,
    ) => {
      // ❌ No access at all
      if (purchasedModuleSet.has(moduleId)) return getFileUrlUser(originalLink);
      // else if (moduleIndex === 0 && lessonIndex === 0) //TODO:TEST
      //   return getFileUrlUser(originalLink);
      else if (planDetails?.planId?.digitalStudyMaterial)
        return getFileUrlUser(originalLink);
      // else if (planDetails?.type === "SUBSCRIPTION") return originalLink;
      else return null;
    };

    const details = await CompanyInfoModel.findOne({}).lean();
    /* -------------------------------------------------- */
    /* ✅ FINAL TRANSFORMATION (SINGLE PASS) */
    /* -------------------------------------------------- */
    const finalResponse = lessons?.map((module: any, moduleIndex: number) => {
      const moduleIdStr = module._id.toString();

      const transformedLessons = module?.lessons?.map(
        (lesson: any, lessonIndex: number) => ({
          ...lesson,
          isBookmarked: bookmarkSet?.has(lesson?._id?.toString()),
          fileLink:
            module.price === 0
              ? getFileUrlUser(lesson?.fileLink)
              : getLessonAccess(
                  moduleIdStr,
                  moduleIndex,
                  lessonIndex,
                  lesson?.fileLink,
                ),
        }),
      );

      const isUnlocked =
        (planDetails?.type === "SUBSCRIPTION" &&
          planDetails?.planId?.digitalStudyMaterial) ||
        purchasedModuleSet.has(moduleIdStr);

      return {
        ...module,
        status: module.price === 0 || isUnlocked ? "ACTIVE" : "INACTIVE", //TODO: test this price 0
        lessons: transformedLessons,
        videos: transformedLessons.filter((l: any) => l.fileType === "VIDEO")
          .length,
        files: transformedLessons.filter((l: any) => l.fileType === "PDF")
          .length,
        progress: progressMap.get(moduleIdStr) || 0,
        questions: questionMap.get(moduleIdStr) || 0,
        freeTrailDuration: details?.freeTrailDuration,
        individualDuration: details?.individualDuration,
      };
    });

    return OK(res, finalResponse, "Data Fetched");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const bookmark = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { type, isBookmarked } = req.body;
    if (!type || typeof isBookmarked !== "boolean") {
      return BADREQUEST(res, "lessonId, type and isBookmarked are required");
    }
    if (type == "LESSON") {
      const { lessonId } = req.body;
      const checkLesson = await LessonModel.findOne({
        "lessons._id": lessonId,
      }).lean();

      await BookmarkModel.findOneAndUpdate(
        {
          userId,
          lessonsId: lessonId,
          type,
          moduleId: checkLesson?._id,
        },
        { isBookmarked, courseId: checkLesson?.courseId },
        { upsert: true, new: true },
      );
    } else if (type === "TASK") {
      const { taskId } = req.body;
      const taskDetails: any = await TaskModel.findById({
        _id: taskId,
      })
        .populate("domainId")
        .lean();
      const courseId = taskDetails?.domainId?.courseId;
      await BookmarkModel.findOneAndUpdate(
        {
          userId,
          lessonsId: null,
          taskId,
          type,
          moduleId: null,
        },
        { isBookmarked, courseId },
        { upsert: true, new: true },
      );
    } else if (type === "APPLICATION_SUPPORT") {
      const { applicationSupportId } = req.body;
      //todo: test this
      const applicationSupportDetails: any =
        await ApplicationSupportModel.findOne({
          "data._id": applicationSupportId,
        });
      await BookmarkModel.findOneAndUpdate(
        {
          userId,
          lessonsId: null,
          applicationSupportId,
          taskId: null,
          type,
          moduleId: null,
        },
        { isBookmarked, courseId: applicationSupportDetails?.courseId },
        { upsert: true, new: true },
      );
    } else if (type === "EXAM_STRATEGY") {
      const { examStrategyId } = req.body;
      const examStrategyDetails: any = await ExamStrategyModel.findOne({
        "data._id": examStrategyId,
      });
      await BookmarkModel.findOneAndUpdate(
        {
          userId,
          lessonsId: null,
          examStrategyId,
          taskId: null,
          type,
          moduleId: null,
        },
        { isBookmarked, courseId: examStrategyDetails?.courseId },
        { upsert: true, new: true },
      );
    } else {
      throw new Error("Invalid Type");
    }

    return OK(res, {}, "Updated Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const markAttempted = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const { type, isAttempted } = req.body;

    if (!["LESSON", "QUESTION", "TASK"].includes(type)) {
      throw new Error("Invalid type. Must be LESSON, QUESTION or TASK");
    }

    /* -------------------------------------------------- */
    /* ✅ LESSON */
    /* -------------------------------------------------- */

    if (type === "LESSON") {
      const { lessonId } = req.body;

      const moduleData = await LessonModel.findOne({
        "lessons._id": lessonId,
      }).lean();

      if (!moduleData) {
        throw new Error("Lesson not found");
      }

      const moduleId = moduleData._id;

      // ✅ UPSERT
      await BookmarkModel.findOneAndUpdate(
        {
          userId,
          lessonsId: lessonId,
          type: "LESSON",
        },
        {
          userId,
          lessonsId: lessonId,
          type: "LESSON",
          courseId: moduleData?.courseId,
          moduleId,
          isAttempted,
        },
        {
          upsert: true,
          new: true,
        },
      );

      /* ----------------------------- */
      /* ✅ CALCULATE PROGRESS */
      /* ----------------------------- */

      const totalLessons = moduleData?.lessons?.length || 0;

      const totalQuestions = await QuestionModel.countDocuments({
        lessonId: moduleId,
        status: "ACTIVE",
      });

      const attemptedLessons = await BookmarkModel.distinct("lessonsId", {
        userId,
        moduleId,
        type: "LESSON",
        isAttempted: true,
      });

      const attemptedQuestions = await BookmarkModel.distinct("questionId", {
        userId,
        moduleId,
        type: "QUESTION",
        isAttempted: true,
      });

      const totalItems = totalLessons + totalQuestions;

      const attemptedItems =
        attemptedLessons.length + attemptedQuestions.length;

      const percentage =
        totalItems === 0
          ? 0
          : Math.min(100, Math.round((attemptedItems / totalItems) * 100));

      const progress = await ProgressModel.findOneAndUpdate(
        {
          userId,
          moduleId,
        },
        {
          percentage,
        },
        {
          upsert: true,
          new: true,
        },
      ).lean();

      // ✅ CERTIFICATE
      if (progress?.percentage === 100) {
        await createIssuingCertificate(
          {
            userId,
            courseId: moduleData.courseId,
            moduleType: "lessons",
            completedAt: new Date(),
          },
          res,
        );
      }

      return OK(res, {}, "Updated Successfully");
    }

    /* -------------------------------------------------- */
    /* ✅ QUESTION */
    /* -------------------------------------------------- */

    if (type === "QUESTION") {
      const { questionId } = req.body;

      const question = await QuestionModel.findById(questionId).lean();

      if (!question) {
        throw new Error("Question not found");
      }

      const moduleId = question.lessonId;

      const moduleData = await LessonModel.findById(moduleId).lean();

      if (!moduleData) {
        throw new Error("Module not found");
      }

      // ✅ UPSERT
      await BookmarkModel.findOneAndUpdate(
        {
          userId,
          questionId,
          type: "QUESTION",
        },
        {
          userId,
          questionId,
          type: "QUESTION",
          moduleId,
          courseId: question.courseId,
          isAttempted,
        },
        {
          upsert: true,
          new: true,
        },
      );

      /* ----------------------------- */
      /* ✅ CALCULATE PROGRESS */
      /* ----------------------------- */

      const totalLessons = moduleData?.lessons?.length || 0;

      const totalQuestions = await QuestionModel.countDocuments({
        lessonId: moduleId,
        status: "ACTIVE",
      });

      const attemptedLessons = await BookmarkModel.distinct("lessonsId", {
        userId,
        moduleId,
        type: "LESSON",
        isAttempted: true,
      });

      const attemptedQuestions = await BookmarkModel.distinct("questionId", {
        userId,
        moduleId,
        type: "QUESTION",
        isAttempted: true,
      });

      const totalItems = totalLessons + totalQuestions;

      const attemptedItems =
        attemptedLessons.length + attemptedQuestions.length;

      const percentage =
        totalItems === 0
          ? 0
          : Math.min(100, Math.round((attemptedItems / totalItems) * 100));

      const progress = await ProgressModel.findOneAndUpdate(
        {
          userId,
          moduleId,
        },
        {
          percentage,
        },
        {
          upsert: true,
          new: true,
        },
      ).lean();

      // ✅ CERTIFICATE
      if (progress?.percentage === 100) {
        await createIssuingCertificate(
          {
            userId,
            courseId: question.courseId,
            moduleType: "lessons",
            completedAt: new Date(),
          },
          res,
        );
      }

      return OK(res, {}, "Updated Successfully");
    }

    /* -------------------------------------------------- */
    /* ✅ TASK */
    /* -------------------------------------------------- */

    if (type === "TASK") {
      const { questionId } = req.body;

      const question = await QuestionModel.findById(questionId).lean();

      if (!question) {
        throw new Error("Question not found");
      }

      const taskId = question.taskId;

      const task = await TaskModel.findById(taskId).lean();

      if (!task) {
        throw new Error("Task not found");
      }

      const domainId = task.domainId;

      // ✅ UPSERT
      await BookmarkModel.findOneAndUpdate(
        {
          userId,
          questionId,
          type: "TASK",
        },
        {
          userId,
          questionId,
          courseId: question.courseId,
          type: "TASK",
          taskId,
          domainId,
          isAttempted,
        },
        {
          upsert: true,
          new: true,
        },
      );

      // ✅ TOTAL QUESTIONS
      const totalQuestions = await QuestionModel.countDocuments({
        taskId,
        status: "ACTIVE",
      });

      // ✅ DISTINCT ATTEMPTED
      const attemptedQuestions = await BookmarkModel.distinct("questionId", {
        userId,
        type: "TASK",
        taskId,
        isAttempted: true,
      });

      const percentage =
        totalQuestions === 0
          ? 0
          : Math.min(
              100,
              Math.round((attemptedQuestions.length / totalQuestions) * 100),
            );

      await ProgressModel.findOneAndUpdate(
        {
          userId,
          domainId,
        },
        {
          percentage,
        },
        {
          upsert: true,
          new: true,
        },
      );

      return OK(res, {}, "Updated Successfully");
    }
  } catch (err: any) {
    console.error(err);

    return BADREQUEST(res, err.message || "Something went wrong");
  }
};

export const getUserQuestions = async (req: Request, res: Response) => {
  try {
    const { moduleId } = req.query;
    const userId = (req as any).user?.id;

    if (!moduleId) {
      return BADREQUEST(res, "moduleId is required");
    }

    const questions = await QuestionModel.find({
      lessonId: moduleId,
      status: "ACTIVE",
    }).lean();

    const attemptStatus = await BookmarkModel.find({
      moduleId,
      userId,
      type: "QUESTION",
    }).lean();

    const formattedQuestions = questions.map((q: any) => {
      if (q.type === "MCQ" && q.mcq?.length) {
        q.mcq = shuffleArray(q.mcq);
      }

      if (q.type === "DND" && q.dnd?.options?.length) {
        q.dnd.options = shuffleArray(q.dnd.options);
      }

      if (q.type === "FIB" && q.fib?.length) {
        q.fib = shuffleArray(q.fib);
      }

      const status = attemptStatus.find(
        (data) => data?.questionId?.toString() === q?._id?.toString(),
      );
      q.isAttempted = status?.isAttempted || false;

      return {
        ...q,
        image: q?.image ? getFileUrlUser(q.image) : null,
      };
    });

    return OK(res, formattedQuestions, "Questions fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// Domains & Tasks
export const usersDomainsAndTasks = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as any;
    const userId = (req as any).user?._id;

    const check = await CheckCourseExistUser(id);
    if (typeof check === "string") throw new Error(check);

    /* -------------------------------------------------- */
    /* 🚀 FETCH EVERYTHING IN PARALLEL */
    /* -------------------------------------------------- */
    const [domains, bookmarks, subscription, individualPurchase] =
      await Promise.all([
        DomainModel.find({ courseId: id, status: "ACTIVE" })
          .sort({ order: 1 })
          .lean(),

        BookmarkModel.find({
          userId,
          type: "TASK",
          isBookmarked: true,
        }).lean(),

        PurchaseModel.findOne({
          userId,
          purchasedProduct: { $in: [id, new mongoose.Types.ObjectId(id)] },
          endDate: { $gte: new Date() },
          status: "SUCCESS",
        })
          .sort({ purchaseAmount: -1 })
          .populate("planId")
          .lean() as any,

        PurchaseModel.find({
          userId,
          type: "INDIVIDUAL",
          purchaseType: "DOMAIN_TASK",
          endDate: { $gte: new Date() },
          status: "SUCCESS",
        }).lean(),
      ]);

    /* -------------------------------------------------- */
    /* 🔥 PREPARE LOOKUPS (O(1)) */
    /* -------------------------------------------------- */
    const bookmarkedTaskSet = new Set(
      bookmarks.map((b: any) => b.taskId?.toString()),
    );

    const purchasedDomainSet = new Set(
      individualPurchase.map((p: any) => p.purchasedProduct?.toString()),
    );

    const hasFullDomainAccess =
      subscription &&
      subscription.type === "SUBSCRIPTION" &&
      subscription.planId?.domainAndTask === true;

    /* -------------------------------------------------- */
    /* 🚀 FETCH TASKS IN SINGLE QUERY (OPTIMIZED) */
    /* -------------------------------------------------- */
    const allTasks = await TaskModel.find({
      domainId: { $in: domains.map((d) => d._id) },
      status: "ACTIVE",
    }).lean();

    const taskMap = new Map<string, any[]>();

    allTasks.forEach((task: any) => {
      const key = task.domainId.toString();
      if (!taskMap.has(key)) taskMap.set(key, []);
      taskMap.get(key)!.push(task);
    });

    /* -------------------------------------------------- */
    /* 🎯 FINAL RESPONSE BUILD */
    /* -------------------------------------------------- */
    const finalResponse = domains?.map((domain: any, domainIndex: number) => {
      let tasks = (taskMap.get(domain._id.toString()) || []).map(
        (task: any) => ({
          ...task,
          flowDiagram: getFileUrlUser(task?.flowDiagram),
          isBookmarked: bookmarkedTaskSet.has(task._id.toString()),
        }),
      );

      /* ---------------- FULL ACCESS ---------------- */
      //TODO: test this price 0
      if (hasFullDomainAccess || domain.price === 0) {
        return {
          ...domain,
          status: "ACTIVE",
          tasks,
        };
      }

      /* ---------------- INDIVIDUAL PURCHASE ---------------- */
      if (purchasedDomainSet.has(domain._id.toString())) {
        return {
          ...domain,
          status: "ACTIVE",
          tasks,
        };
      }

      /* ---------------- LIMITED ACCESS ---------------- */
      // if (domainIndex === 0) {
      //   return {
      //     ...domain,
      //     status: "INACTIVE",
      //     tasks: tasks.map((task: any, taskIndex: number) => ({
      //       ...task,
      //       status: taskIndex === 0 ? "ACTIVE" : "INACTIVE",
      //     })),
      //   };
      // } //TODO:TEST

      /* ---------------- LOCKED ---------------- */
      return {
        ...domain,
        status: "INACTIVE",
        tasks: tasks.map((task: any) => ({
          ...task,
          status: "INACTIVE",
        })),
      };
    });

    return OK(res, finalResponse, "Data Fetched");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getUserTaskQuestions = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.query;

    if (!taskId) {
      return BADREQUEST(res, "Task id is required");
    }

    const questions = await QuestionModel.find({
      taskId,
      status: "ACTIVE",
    }).lean();

    const attemptStatus = await BookmarkModel.find({
      taskId,
      type: "QUESTION",
    }).lean();

    const formattedQuestions = questions.map((q: any) => {
      if (q.type === "MCQ" && q.mcq?.length) {
        q.mcq = shuffleArray(q.mcq);
      }

      if (q.type === "DND" && q.dnd?.options?.length) {
        q.dnd.options = shuffleArray(q.dnd.options);
      }

      if (q.type === "FIB" && q.fib?.length) {
        q.fib = shuffleArray(q.fib);
      }

      const status = attemptStatus.find(
        (data) => data?.questionId?.toString() === q?._id?.toString(),
      );
      q.isAttempted = status?.isAttempted || false;

      return q;
    });
    const formattedQuestionsWithImage = formattedQuestions.map((q: any) => {
      return {
        ...q,
        image: getFileUrlUser(q.image),
      };
    });

    return OK(
      res,
      formattedQuestionsWithImage,
      "Questions fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// Application Support
export const getUserApplicationSupport = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params as any;
    const userId = (req as any).user.id;

    const check = await CheckCourseExistUser(id);
    if (typeof check === "string") throw new Error(check);

    /* -------------------------------------------------- */
    /* 🚀 FETCH IN PARALLEL */
    /* -------------------------------------------------- */
    const [supports, bookmarks, subscription, individualPurchase] =
      await Promise.all([
        ApplicationSupportModel.find({
          courseId: id,
          status: "ACTIVE",
        })
          .sort({ order: 1 }) // important
          .lean(),

        BookmarkModel.find({
          userId,
          type: "APPLICATION_SUPPORT",
          isBookmarked: true,
          applicationSupportId: { $ne: null },
        }).select("applicationSupportId"),

        PurchaseModel.findOne({
          userId,
          purchasedProduct: { $in: [id, new mongoose.Types.ObjectId(id)] },
          endDate: { $gte: new Date() },
          status: "SUCCESS",
        })
          .sort({ purchaseAmount: -1 })
          .populate("planId")
          .lean() as any,

        PurchaseModel.find({
          userId,
          type: "INDIVIDUAL",
          purchaseType: "APPLICATION_SUPPORT",
          endDate: { $gte: new Date() },
          status: "SUCCESS",
        }).lean(),
      ]);

    /* -------------------------------------------------- */
    /* 🔥 LOOKUPS */
    /* -------------------------------------------------- */
    const bookmarkedIds = new Set(
      bookmarks.map((b) => b.applicationSupportId?.toString()),
    );

    const purchasedSupportSet = new Set(
      individualPurchase.map((p: any) => p.purchasedProduct?.toString()),
    );

    const hasFullAccess =
      subscription &&
      subscription.type === "SUBSCRIPTION" &&
      subscription.planId?.applicationSupport === true;

    const isFreeTrial = subscription && subscription.type === "FREE_TRIAL";

    /* -------------------------------------------------- */
    /* 🎯 FINAL RESPONSE */
    /* -------------------------------------------------- */
    const finalResponse = supports.map((support: any, parentIndex: number) => {
      /* ---------- INDIVIDUAL PURCHASE ---------- */
      const isPurchased = purchasedSupportSet.has(support._id.toString());

      const updatedData = support.data.map((item: any, itemIndex: number) => {
        let fileLink = null;
        if (support?.price === 0) {
          fileLink = item.fileLink;
        }
        /* ---------- FULL ACCESS (SUBSCRIPTION) ---------- */
        if (hasFullAccess) {
          fileLink = item.fileLink;
        } else if (isPurchased) {
          /* ---------- INDIVIDUAL PURCHASE ---------- */
          fileLink = item.fileLink;
        } 
        // else if (isFreeTrial || !subscription) {
        //   /* ---------- FREE TRIAL / NO ACCESS ---------- */
        //   if (parentIndex === 0 && itemIndex === 0) {
        //     fileLink = item.fileLink; // preview
        //   }
        // } //TODO:TEST

        return {
          ...item,
          isBookmarked: bookmarkedIds.has(item._id.toString()),
          fileLink: getFileUrlUser(fileLink),
        };
      });

      return {
        ...support,
        status:
          support?.price === 0 || hasFullAccess || isPurchased
            ? "ACTIVE"
            : "INACTIVE", //TODO: test this price 0
        data: updatedData,
        videos: updatedData.filter((d: any) => d.fileType === "VIDEO").length,
        files: updatedData.filter((d: any) =>
          ["PDF", "DOC", "DOCX"].includes(d.fileType),
        ).length,
        images: updatedData.filter((d: any) => d.fileType === "IMAGE").length,
        totalItems: updatedData.length,
      };
    });

    return OK(res, finalResponse, "Fetched successfully");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// Exam Strategy
export const getUserExamStrategy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as any;
    const userId = (req as any).user.id;

    const check = await CheckCourseExistUser(id);
    if (typeof check === "string") throw new Error(check);

    /* -------------------------------------------------- */
    /* 🚀 FETCH IN PARALLEL */
    /* -------------------------------------------------- */
    const [strategies, bookmarks, subscription, individualPurchase] =
      await Promise.all([
        ExamStrategyModel.find({
          courseId: id,
          status: "ACTIVE",
        })
          .sort({ order: 1 }) // ⚠️ important for preview logic
          .lean(),

        BookmarkModel.find({
          userId,
          type: "EXAM_STRATEGY",
          isBookmarked: true,
          examStrategyId: { $ne: null },
        }).select("examStrategyId"),

        PurchaseModel.findOne({
          userId,
          purchasedProduct: { $in: [id, new mongoose.Types.ObjectId(id)] },
          endDate: { $gte: new Date() },
          status: "SUCCESS",
        })
          .sort({ purchaseAmount: -1 })
          .populate("planId")
          .lean() as any,

        PurchaseModel.find({
          userId,
          type: "INDIVIDUAL",
          purchaseType: "EXAM_STRATEGY",
          endDate: { $gte: new Date() },
          status: "SUCCESS",
        }).lean(),
      ]);

    /* -------------------------------------------------- */
    /* 🔥 LOOKUPS */
    /* -------------------------------------------------- */
    const bookmarkedIds = new Set(
      bookmarks.map((b) => b.examStrategyId?.toString()),
    );

    const purchasedSet = new Set(
      individualPurchase.map((p: any) => p.purchasedProduct?.toString()),
    );

    const hasFullAccess =
      subscription &&
      subscription.type === "SUBSCRIPTION" &&
      subscription.planId?.expertVideoModule === true; // ⚠️ confirm flag

    const isFreeTrial = subscription && subscription.type === "FREE_TRIAL";

    /* -------------------------------------------------- */
    /* 🎯 FINAL RESPONSE */
    /* -------------------------------------------------- */
    const finalResponse = strategies.map(
      (strategy: any, parentIndex: number) => {
        const isPurchased = purchasedSet.has(strategy._id.toString());

        let videos = 0;
        let files = 0;
        let images = 0;

        const updatedNested = strategy.data.map(
          (item: any, itemIndex: number) => {
            let fileLink = null;

            /* ---------- ACCESS CONTROL ---------- */
            if (hasFullAccess || isPurchased) {
              fileLink = item.fileLink;
            } 
            // else if (isFreeTrial || !subscription) { //TODO:TEST
            //   if (parentIndex === 0 && itemIndex === 0) {
            //     fileLink = item.fileLink; // preview
            //   }
            // }

            /* ---------- COUNTS ---------- */
            if (item.fileType === "VIDEO") videos++;
            else if (item.fileType === "IMAGE") images++;
            else files++;

            return {
              ...item,
              isBookmarked: bookmarkedIds.has(item._id.toString()),
              fileLink: getFileUrlUser(fileLink),
            };
          },
        );

        return {
          ...strategy,
          status:
            strategy?.price === 0 || hasFullAccess || isPurchased
              ? "ACTIVE"
              : "INACTIVE", //TODO: test this price 0

          data: updatedNested,
          videos,
          files,
          images,
          totalItems: updatedNested.length,
        };
      },
    );

    return OK(res, finalResponse, "Fetched successfully");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getUserFlashcardCategory = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.query as any;
    const userId = (req as any).user?._id;

    if (!courseId) {
      throw new Error("Course Id is required");
    }

    /* -------------------------------------------------- */
    /* 🚀 FETCH DATA IN PARALLEL */
    /* -------------------------------------------------- */
    const [data, subscription, individualPurchase] = await Promise.all([
      FlashCardCategoryModel.aggregate([
        {
          $match: {
            courseId: new mongoose.Types.ObjectId(courseId as string),
            status: "ACTIVE",
          },
        },
        {
          $lookup: {
            from: "flashcards",
            localField: "_id",
            foreignField: "categoryId",
            pipeline: [{ $match: { status: "ACTIVE" } }],
            as: "flashcards",
          },
        },
        {
          $addFields: {
            flashcardCount: { $size: "$flashcards" },
          },
        },
        {
          $project: {
            flashcards: 0,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ]),

      PurchaseModel.findOne({
        userId,
        purchasedProduct: {
          $in: [courseId, new mongoose.Types.ObjectId(courseId)],
        },
        endDate: { $gte: new Date() },
        status: "SUCCESS",
      })
        .sort({ purchaseAmount: -1 })
        .populate("planId")
        .lean() as any,

      PurchaseModel.find({
        userId,
        type: "INDIVIDUAL",
        purchaseType: "FLASH_CARDS",
        endDate: { $gte: new Date() },
        status: "SUCCESS",
      }).lean(),
    ]);

    /* -------------------------------------------------- */
    /* 🔥 PREPARE LOOKUPS */
    /* -------------------------------------------------- */
    const purchasedCategorySet = new Set(
      individualPurchase.map((p: any) => p.purchasedProduct?.toString()),
    );

    const hasFullAccess =
      subscription &&
      subscription.type === "SUBSCRIPTION" &&
      subscription.planId?.flashCards === true;

    /* -------------------------------------------------- */
    /* 🎯 FINAL RESPONSE */
    /* -------------------------------------------------- */
    const finalResponse = data.map((item: any) => {
      const isPurchased = purchasedCategorySet.has(item._id.toString());

      return {
        ...item,
        status:
          item.price === 0
            ? "ACTIVE"
            : hasFullAccess || isPurchased
              ? "ACTIVE"
              : "INACTIVE",
      };
    });

    return OK(res, finalResponse, "Fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getUserFlashcard = async (req: Request, res: Response) => {
  try {
    let { categoryId, search } = req.query as any;

    const checkExist = await FlashCardCategoryModel.findById(categoryId);

    if (!checkExist) {
      throw new Error("Invalid category Id");
    }

    const query: any = {
      categoryId,
      status: "ACTIVE",
    };

    if (search && search.trim() !== "") {
      query.$or = [
        { frontText: { $regex: search, $options: "i" } },
        { backText: { $regex: search, $options: "i" } },
      ];
    }

    const data = await FlashCardModel.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const finalData = data.map((val) => {
      if (val.backImage || val.frontImage) {
        return {
          ...val,
          backImage: val?.backImage ? getFileUrlUser(val.backImage) : null,
          frontImage: val.frontImage ? getFileUrlUser(val.frontImage) : null,
        };
      } else {
        return val;
      }
    });

    return OK(res, finalData, "Data fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// Practice Exam
export const getPracticeExam = async (req: Request, res: Response) => {
  try {
    const { id } = (req as any).params; // courseId
    const userId = (req as any).user.id;

    const check = await CheckCourseExistUser(id);
    if (typeof check === "string") throw new Error(check);

    const filter: any = {
      status: "ACTIVE",
      courseId: new mongoose.Types.ObjectId(id),
    };

    // 🔥 Run both queries in parallel
    const [examData, allPurchases] = await Promise.all([
      PracticeExamModel.aggregate([
        { $match: filter },
        { $sort: { order: 1 } },

        {
          $lookup: {
            from: "questions",
            localField: "_id",
            foreignField: "practiceExamId",
            as: "questions",
          },
        },

        {
          $addFields: {
            questionCount: {
              $size: {
                $filter: {
                  input: "$questions",
                  as: "q",
                  cond: { $eq: ["$$q.status", "ACTIVE"] },
                },
              },
            },
          },
        },

        {
          $project: {
            questions: 0,
          },
        },
      ]),

      PurchaseModel.find({
        userId,
        status: "SUCCESS",
        purchaseType: { $in: ["COURSE", "PRACTICE_TEST"] },
      })
        .sort({ purchaseAmount: -1 })
        .populate("planId")
        .lean(),
    ]);

    // ✅ Use Set for fast lookup
    const examAvailableSet = new Set<string>();

    allPurchases?.forEach((data: any) => {
      if (data.purchaseType === "COURSE") {
        const exams = data?.planId?.practiceExams || [];

        exams.forEach((examId: any) => {
          if (examId) {
            // handle both ObjectId and populated object
            examAvailableSet.add((examId._id ? examId._id : examId).toString());
          }
        });
      }

      if (data.purchaseType === "PRACTICE_TEST") {
        examAvailableSet.add((data?.purchasedProduct).toString());
      }
    });

    // ✅ Final mapping
    const finalResult = examData.map((data: any) => {
      const isAvailable = examAvailableSet.has(data._id.toString());

      return {
        ...data,
        status:
          data.price === 0 ? "ACTIVE" : isAvailable ? "ACTIVE" : "INACTIVE", //TODO: test this price 0
      };
    });

    return OK(res, finalResult, "Fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getPracticeExamQuestions = async (req: Request, res: Response) => {
  try {
    const { examId, courseId } = req.query;
    const userId = (req as any).user.id;

    if (!examId) {
      return BADREQUEST(res, "examId is required");
    }

    const examObjectId = new mongoose.Types.ObjectId(examId as string);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // ✅ Get distinct attempts
    const attempts = await PracticeExamResultModel.distinct("attemptNumber", {
      examId: examObjectId,
      userId: userObjectId,
    });

    const attemptNumber = attempts.length + 1;

    // ✅ Random questions
    const questions: any[] = await QuestionModel.aggregate([
      {
        $match: {
          practiceExamId: examObjectId,
          status: "ACTIVE",
          isPractice: true,
        },
      },
      { $sample: { size: 20 } }, // adjust limit if needed
    ]);

    if (!questions.length) {
      return BADREQUEST(res, "No questions found");
    }

    // ✅ Shuffle answer options
    const formattedQuestions = questions.map((q: any) => {
      if (q.type === "MCQ" && q.mcq?.length) {
        q.mcq = shuffleArray(q.mcq);
      }

      if (q.type === "DND" && q.dnd?.options?.length) {
        q.dnd.options = shuffleArray(q.dnd.options);
      }

      if (q.type === "FIB" && q.fib?.length) {
        q.fib = shuffleArray(q.fib);
      }

      if (q?.image) {
        q.image = getFileUrlUser(q.image);
      }

      return q;
    });

    // ✅ Prepare default result entries
    const bulkData = formattedQuestions.map((q: any) => ({
      userId: userObjectId,
      examId: examObjectId,
      questionId: q._id,
      attemptNumber,
      isCorrect: null,
      isAttempted: false,
      status: "ACTIVE",
    }));

    // ✅ Insert in bulk
    await PracticeExamResultModel.insertMany(bulkData);

    return OK(
      res,
      {
        attemptNumber,
        questions: formattedQuestions,
      },
      "Exam started successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const submitQuestionsResponse = async (req: Request, res: Response) => {
  try {
    const {
      examId,
      attemptNumber,
      questionId,
      isCorrect = false,
      answerJson,
    } = req.body;
    const userId = (req as any).user.id;
    if (!examId) {
      return BADREQUEST(res, "examId is required");
    }

    // const checkExist = await PracticeExamResultModel.findOne({
    // 	examId,
    // 	attemptNumber,
    // 	questionId,
    // 	isAttempted: true,
    // });
    // if (checkExist) {
    // 	return BADREQUEST(res, "Already attempted");
    // }

    await PracticeExamResultModel.updateOne(
      { userId, attemptNumber, questionId, examId },
      { $set: { isCorrect, isAttempted: true, answerJson } },
    );

    return OK(res, {}, "Submitted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getAllPracticeExamResultBoard = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = new mongoose.Types.ObjectId((req as any).user.id);
    const practiceExamCollection = PracticeExamModel.collection.name;

    const data = await PracticeExamResultModel.aggregate([
      {
        $match: { userId },
      },

      {
        $sort: { examId: 1, attemptNumber: -1, createdAt: -1 },
      },

      {
        $group: {
          _id: "$examId",
          latestAttemptNumber: { $first: "$attemptNumber" },
          docs: { $push: "$$ROOT" },
        },
      },

      {
        $project: {
          examId: "$_id",
          latestAttemptNumber: 1,
          docs: {
            $filter: {
              input: "$docs",
              as: "doc",
              cond: { $eq: ["$$doc.attemptNumber", "$latestAttemptNumber"] },
            },
          },
        },
      },

      { $unwind: "$docs" },

      {
        $group: {
          _id: {
            examId: "$examId",
            attemptNumber: "$latestAttemptNumber",
          },
          userId: { $first: "$docs.userId" },
          timeTaken: { $first: "$docs.timeTaken" },
          totalQuestions: { $sum: 1 },
          correctAnswers: {
            $sum: { $cond: [{ $eq: ["$docs.isCorrect", true] }, 1, 0] },
          },
          attemptedQuestions: {
            $sum: { $cond: [{ $eq: ["$docs.isAttempted", true] }, 1, 0] },
          },
          createdAt: { $first: "$docs.createdAt" },
        },
      },

      {
        $lookup: {
          from: practiceExamCollection,
          localField: "_id.examId",
          foreignField: "_id",
          as: "exam",
        },
      },
      { $unwind: { path: "$exam", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 0,
          userId: 1,
          // fall back to stored examId if lookup fails
          examId: { $ifNull: ["$exam._id", "$_id.examId"] },
          categoryName: "$exam.name",
          attemptNumber: "$_id.attemptNumber",
          date: "$createdAt",
          totalQuestions: 1,
          correctAnswers: 1,
          timeTaken: 1,
          answerJson: 1,

          score: {
            $multiply: [
              { $divide: ["$correctAnswers", "$totalQuestions"] },
              100,
            ],
          },

          scoreText: {
            $concat: [
              {
                $toString: {
                  $round: [
                    {
                      $multiply: [
                        { $divide: ["$correctAnswers", "$totalQuestions"] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
              },
              "% (",
              { $toString: "$correctAnswers" },
              "/",
              { $toString: "$totalQuestions" },
              ")",
            ],
          },

          status: {
            $cond: [
              { $eq: ["$attemptedQuestions", "$totalQuestions"] },
              "Completed",
              "Unfinished",
            ],
          },
        },
      },

      {
        $sort: { date: -1 },
      },
    ]);

    return OK(res, data, "Fetched successfully");
  } catch (err: any) {
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getPracticeExamResultBoard = async (
  req: Request,
  res: Response,
) => {
  try {
    const { examId, attemptNumber, timeTaken } = req.query;
    const userId = (req as any).user.id;

    if (!examId || !attemptNumber) {
      return BADREQUEST(res, "examId and attemptNumber are required");
    }

    const results = await PracticeExamResultModel.find({
      userId,
      examId: new mongoose.Types.ObjectId(examId as string),
      attemptNumber: Number(attemptNumber),
    })
      .populate("questionId")
      .sort({ createdAt: 1 });

    if (!results.length) {
      return BADREQUEST(res, "No result found");
    }

    // =============================
    // ✅ BASIC COUNTS
    // =============================

    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    const domainMap: any = {};

    results.forEach((item: any) => {
      const domain = item.questionId?.domainName || "General";

      if (!domainMap[domain]) {
        domainMap[domain] = {
          correct: 0,
          total: 0,
          percentage: 0,
        };
      }

      domainMap[domain].total += 1;

      if (!item.isAttempted) {
        unanswered++;
      } else if (item.isCorrect) {
        correct++;
        domainMap[domain].correct += 1;
      } else {
        incorrect++;
      }
    });

    const totalQuestions = results.length;

    // =============================
    // ✅ OVERALL PERCENTAGE
    // (Based on total questions)
    // =============================

    const overallPercentage =
      totalQuestions > 0
        ? Number(((correct / totalQuestions) * 100).toFixed(2))
        : 0;

    // =============================
    // ✅ DOMAIN-WISE PERCENTAGE
    // =============================

    Object.keys(domainMap).forEach((domain) => {
      const domainData = domainMap[domain];

      domainData.percentage =
        domainData.total > 0
          ? Number(((domainData.correct / domainData.total) * 100).toFixed(2))
          : 0;
    });

    // =============================
    // ✅ TIME TAKEN (hh:mm:ss)
    // =============================

    const firstTime: any = results[0]?.createdAt;
    const lastTime: any = results[results?.length - 1]?.updatedAt;

    const timeTakenMs =
      new Date(lastTime)?.getTime() - new Date(firstTime)?.getTime();

    const totalSeconds = Math.max(0, Math.floor(timeTakenMs / 1000));

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    // =============================
    // ✅ FINAL RESPONSE
    // =============================

    const response = {
      correct,
      incorrect,
      unanswered,
      overallPercentage,
      timeTaken: timeTaken || formattedTime,
      scoreBreakDown: domainMap,
    };
    await PracticeExamResultModel.findOneAndUpdate(
      {
        userId,
        examId: new mongoose.Types.ObjectId(examId as string),
        attemptNumber: Number(attemptNumber),
      },
      {
        $set: {
          timeTaken: timeTaken || formattedTime,
        },
      },
    );

    return OK(res, response, "Result fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const getPracticeExamResultQuestion = async (
  req: Request,
  res: Response,
) => {
  try {
    const { examId, attemptNumber, status = "All" } = req.query;
    const userId = (req as any).user.id;

    if (!examId || !attemptNumber) {
      return BADREQUEST(res, "examId and attemptNumber are required");
    }
    let query = {};
    if (status === "Correct") {
      query = {
        userId,
        examId: new mongoose.Types.ObjectId(examId as string),
        attemptNumber: Number(attemptNumber),
        isCorrect: true,
        isAttempted: true,
      };
    } else if (status === "Incorrect") {
      query = {
        userId,
        examId: new mongoose.Types.ObjectId(examId as string),
        attemptNumber: Number(attemptNumber),
        isCorrect: false,
        isAttempted: true,
      };
    } else if (status === "Unattempted") {
      query = {
        userId,
        examId: new mongoose.Types.ObjectId(examId as string),
        attemptNumber: Number(attemptNumber),
        isAttempted: false,
      };
    } else {
      query = {
        userId,
        examId: new mongoose.Types.ObjectId(examId as string),
        attemptNumber: Number(attemptNumber),
      };
    }

    const results = await PracticeExamResultModel.find({
      ...query,
    })
      .populate("questionId")
      .sort({ createdAt: 1 });

    return OK(res, results, "Result fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getUserMockExam = async (req: Request, res: Response) => {
  try {
    const { id } = (req as any).params; // courseId
    const userId = (req as any).user.id;

    const check = await CheckCourseExistUser(id);
    if (typeof check === "string") throw new Error(check);

    const [examData, allPurchases, attemptCount] = await Promise.all([
      MockExamModel.find({
        courseId: new mongoose.Types.ObjectId(id),
        status: "ACTIVE",
      })
        .select("order courseId name numberOfQuestions timeInMin price")
        .lean(),

      PurchaseModel.find({
        userId,
        status: "SUCCESS",
        purchaseType: { $in: ["COURSE", "MOCK_EXAM"] },
      })
        .sort({ purchaseAmount: -1 })
        .populate("planId")
        .lean(),

      MockExamResultModel.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
          },
        },

        {
          $sort: {
            mockExamId: 1,
            attemptNumber: -1,
            updatedAt: -1,
            createdAt: -1,
          },
        },

        {
          $group: {
            _id: "$mockExamId",
            latestAttempt: { $first: "$$ROOT" },
            totalAttempts: { $sum: 1 },
            averageCorrectPercentage: {
              $avg: { $ifNull: ["$overallPercentage", 0] },
            },
          },
        },

        {
          $project: {
            _id: 0,
            mockExamId: "$_id",
            attemptNumber: "$latestAttempt.attemptNumber",
            currentStatus: "$latestAttempt.currentStatus",
            totalAttempts: 1,
            completedAt: "$latestAttempt.completedAt",
            correctPercentage: {
              $round: ["$averageCorrectPercentage", 2],
            },
          },
        },
      ]),
    ]);

    let pausedExams: any = await MockExamResultModel.find({
      userId,
      currentStatus: "PAUSED",
    })
      .populate("mockExamId")
      .lean();

    pausedExams = pausedExams.map((exam: any) => {
      const totalMinutes = exam.mockExamId?.timeInMin || "00:00:00";
      const [h1, m1, s1] = totalMinutes.split(":").map(Number);
      const totalSeconds = h1 * 3600 + m1 * 60 + s1;

      const timeTaken = exam.timeTaken || "00:00:00";
      const [h, m, s] = timeTaken.split(":").map(Number);

      const takenSeconds = h * 3600 + m * 60 + s;

      const remainingSeconds = Math.max(0, totalSeconds - takenSeconds);

      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);
      const seconds = remainingSeconds % 60;

      const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      delete exam.availableTime;
      return {
        ...exam,
        examName: exam.mockExamId?.name || null,
        timeLeft: formattedTime,
      };
    });
    const pausedExamIds = new Set(
      pausedExams.map((exam: any) => exam.mockExamId?._id.toString()),
    );

    let filteredExamData = examData.filter(
      (exam: any) => !pausedExamIds.has(exam._id.toString()),
    );

    const examAvailableSet = new Set<string>();

    allPurchases.forEach((data: any) => {
      if (data.purchaseType === "COURSE") {
        const exams = data?.planId?.mockExams || [];

        exams.forEach((examId: any) => {
          if (examId) {
            // handle both ObjectId and populated object
            examAvailableSet.add((examId._id ? examId._id : examId).toString());
          }
        });
      }

      if (data.purchaseType === "MOCK_EXAM") {
        examAvailableSet.add((data?.purchasedProduct).toString());
      }
    });

    // ✅ Final mapping
    const finalResult = filteredExamData.map((data: any) => {
      const isAvailable = examAvailableSet.has(data._id.toString());
      const attemptData = attemptCount?.find(
        (val: any) => val.mockExamId.toString() === data._id.toString(),
      );

      return {
        ...data,
        status: data.price === 0 || isAvailable ? "ACTIVE" : "INACTIVE", //TODO: test this price 0
        totalAttempt: attemptData ? attemptData?.totalAttempts : 0,
        correctPercentage: attemptData ? attemptData?.correctPercentage : 0,
        currentStatus: attemptData ? attemptData?.currentStatus : null,
        completedAt: attemptData ? attemptData?.completedAt : null,
      };
    });

    return OK(
      res,
      {
        pausedExams,
        examData: finalResult,
      },
      "Fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// export const getUserMockExamQuestions = async (req: Request, res: Response) => {
// 	try {
// 		const { id } = (req as any).params;
// 		const userId = (req as any).user.id;
// 		const { type = "NEW" } = req.query;

// 		const examObjectId = new mongoose.Types.ObjectId(id);
// 		const userObjectId = new mongoose.Types.ObjectId(userId);

// 		/* ---------------------------------- */
// 		/* 1️⃣ Get Exam */
// 		/* ---------------------------------- */

// 		let examData: any = await MockExamModel.findById(id).lean();

// 		let isResultMode = false;

// 		if (!examData) {
// 			examData = await MockExamResultModel.findById(id)
// 				.populate({
// 					path: "mockExamId",
// 					select: "numberOfQuestions timeInMin syllabus courseId isRandom",
// 				})
// 				.lean();

// 			if (!examData) {
// 				return BADREQUEST(res, "Mock exam not found");
// 			}

// 			isResultMode = true;
// 		}

// 		const baseExam = isResultMode ? examData.mockExamId : examData;

// 		const { numberOfQuestions, timeInMin, syllabus, courseId, isRandom } = baseExam;
// 		const courseObjectId = new mongoose.Types.ObjectId(courseId);
// 		const allowedDomains = new Set((Array.isArray(syllabus) ? syllabus : []).map((item: any) => String(item?.domain ?? "").trim()).filter(Boolean));

// 		const fetchAllowedQuestions = async (size: number, excludedQuestionIds: mongoose.Types.ObjectId[] = []) => {
// 			if (size <= 0 || !allowedDomains.size) return [];

// 			const matchStage: any = {
// 				courseId: courseObjectId,
// 				domainName: { $in: Array.from(allowedDomains) },
// 				status: "ACTIVE",
// 				isPractice: false,
// 			};

// 			if (excludedQuestionIds.length) {
// 				matchStage._id = { $nin: excludedQuestionIds };
// 			}

// 			return QuestionModel.aggregate([{ $match: matchStage }, { $sample: { size } }]);
// 		};

// 		/* ---------------------------------- */
// 		/* 🔁 PAUSED FLOW (NO DEDUCTION) */
// 		/* ---------------------------------- */

// 		if (type === "PAUSED") {
// 			const previousAttempt = await MockExamResultModel.findOneAndUpdate(
// 				{
// 					userId: userObjectId,
// 					_id: examObjectId,
// 					currentStatus: "PAUSED",
// 				},
// 				{ $set: { currentStatus: "STARTED" } },
// 				{ new: true },
// 			);

// 			if (!previousAttempt) {
// 				return BADREQUEST(res, "Paused exam not found");
// 			}

// 			const examQuestions = await MockExamQuestionModel.find({
// 				examId: examObjectId,
// 			})
// 				.sort({ createdAt: 1 })
// 				.lean();

// 			const questionIds = examQuestions.map((q) => q.questionId);
// 			const attemptMap = new Map(examQuestions.map((entry: any) => [entry.questionId.toString(), entry]));

// 			let questions: any[] = await QuestionModel.find({
// 				_id: { $in: questionIds },
// 				courseId: courseObjectId,
// 				domainName: { $in: Array.from(allowedDomains) },
// 				status: "ACTIVE",
// 				isPractice: false,
// 			}).lean();

// 			const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));

// 			questions = questionIds.map((id) => questionMap.get(id.toString())).filter(Boolean);

// 			const formattedQuestions = questions.map((q: any) => {
// 				const attempt = attemptMap.get(q?._id?.toString());

// 				if (q?.type === "MCQ" && q.mcq?.length) q.mcq = shuffleArray(q.mcq);

// 				if (q?.type === "DND" && q.dnd?.options?.length) q.dnd.options = shuffleArray(q.dnd.options);

// 				if (q?.type === "FIB" && q.fib?.length) q.fib = shuffleArray(q.fib);

// 				return {
// 					...q,
// 					isAttempted: attempt?.isAttempted ?? false,
// 					answerJson: attempt?.answerJson ?? null,
// 					isCorrect: attempt?.isCorrect ?? null,
// 					image: q?.image ? getFileUrlUser(q.image) : null,
// 				};
// 			});

// 			return OK(
// 				res,
// 				{
// 					lastQuestionId: previousAttempt?.lastQuestionId || null,
// 					timeInMin: previousAttempt.availableTime,
// 					timeTaken: previousAttempt.timeTaken,
// 					examId: previousAttempt._id,
// 					totalQuestions: formattedQuestions.length,
// 					questions: formattedQuestions,
// 				},
// 				"Mock exam resumed successfully",
// 			);
// 		}

// 		/* ---------------------------------- */
// 		/* 2️⃣ Attempt Number */
// 		/* ---------------------------------- */

// 		const previousAttempts = await MockExamResultModel.countDocuments({
// 			userId: userObjectId,
// 			mockExamId: examObjectId,
// 		});

// 		const attemptNumber = previousAttempts + 1;

// 		const newExam = await MockExamResultModel.create({
// 			userId: userObjectId,
// 			attemptNumber,
// 			mockExamId: examObjectId,
// 			currentStatus: "STARTED",
// 			availableTime: timeInMin.toString(),
// 		});

// 		/* ---------------------------------- */
// 		/* 3️⃣ Pick Questions */
// 		/* ---------------------------------- */

// 		let finalQuestions: any[] = [];

// 		const shouldReusePreviousAttempt = !isRandom && previousAttempts > 0;

// 		if (shouldReusePreviousAttempt) {
// 			const lastAttempt = await MockExamResultModel.findOne({
// 				userId: userObjectId,
// 				mockExamId: examObjectId,
// 				attemptNumber: attemptNumber - 1,
// 			}).lean();

// 			if (lastAttempt) {
// 				const previousQuestionEntries = await MockExamQuestionModel.find({
// 					examId: lastAttempt._id,
// 				}).lean();

// 				const questionIds = previousQuestionEntries.map((q) => q.questionId);
// 				if (questionIds.length > 0) {
// 					const questions = await QuestionModel.find({
// 						_id: { $in: questionIds },
// 						courseId: courseObjectId,
// 						domainName: { $in: Array.from(allowedDomains) },
// 						status: "ACTIVE",
// 						isPractice: false,
// 					}).lean();

// 					const questionMap = new Map(questions.map((q: any) => [q._id.toString(), q]));

// 					finalQuestions = questionIds.map((id) => questionMap.get(id.toString())).filter(Boolean);

// 					if (finalQuestions.length) {
// 						finalQuestions = shuffleArray(finalQuestions);
// 					}
// 				}
// 			}
// 		}

// 		if (!finalQuestions.length) {
// 			for (const item of syllabus) {
// 				const domainName = String(item?.domain ?? "").trim();
// 				const count = Math.round((item.percentage / 100) * numberOfQuestions);

// 				if (!domainName || count <= 0) continue;

// 				const questions = await QuestionModel.aggregate([
// 					{
// 						$match: {
// 							courseId: courseObjectId,
// 							domainName,
// 							status: "ACTIVE",
// 							isPractice: false,
// 						},
// 					},
// 					{ $sample: { size: count } },
// 				]);

// 				finalQuestions.push(...questions);
// 			}

// 			/* ---------------------------------- */
// 			/* 4️⃣ Fill Missing */
// 			/* ---------------------------------- */

// 			if (finalQuestions.length < numberOfQuestions) {
// 				const remaining = numberOfQuestions - finalQuestions.length;
// 				const excludedQuestionIds = finalQuestions.map((question: any) => question._id).filter(Boolean);
// 				const extra = await fetchAllowedQuestions(remaining, excludedQuestionIds);
// 				finalQuestions.push(...extra);
// 			}

// 			if (!finalQuestions.length) {
// 				return BADREQUEST(res, "No questions found");
// 			}
// 		}

// 		if (isRandom && finalQuestions.length > 1) {
// 			finalQuestions = shuffleArray(finalQuestions);
// 		}

// 		finalQuestions = finalQuestions.filter((question: any) => {
// 			const domainName = String(question?.domainName ?? "").trim();
// 			return allowedDomains.has(domainName);
// 		});

// 		/* ---------------------------------- */
// 		/* 5️⃣ Shuffle */
// 		/* ---------------------------------- */

// 		if (finalQuestions.length < numberOfQuestions) {
// 			const remaining = numberOfQuestions - finalQuestions.length;
// 			const excludedQuestionIds = finalQuestions.map((question: any) => question._id).filter(Boolean);
// 			const extra = await fetchAllowedQuestions(remaining, excludedQuestionIds);
// 			finalQuestions.push(...extra);
// 		}

// 		if (!finalQuestions.length) {
// 			return BADREQUEST(res, "No questions found");
// 		}

// 		const formattedQuestions = finalQuestions.map((q: any) => {
// 			if (q.type === "MCQ" && q.mcq?.length) q.mcq = shuffleArray(q.mcq);

// 			if (q.type === "DND" && q.dnd?.options?.length) q.dnd.options = shuffleArray(q.dnd.options);

// 			if (q.type === "FIB" && q.fib?.length) q.fib = shuffleArray(q.fib);

// 			return {
// 				...q,
// 				isAttempted: false,
// 				answerJson: null,
// 				isCorrect: null,
// 				image: q.image ? getFileUrlUser(q.image) : null,
// 			};
// 		});

// 		/* ---------------------------------- */
// 		/* 6️⃣ Save Questions */
// 		/* ---------------------------------- */
// 		/* ---------------------------------- */
// 		/* 7️⃣ Insert Mock Exam Result Entries */
// 		/* ---------------------------------- */

// 		await MockExamQuestionModel.insertMany(
// 			formattedQuestions.map((q: any) => ({
// 				examId: newExam._id,
// 				questionId: q._id,
// 				isCorrect: null,
// 			})),
// 		);

// 		/* ---------------------------------- */
// 		/* 8️⃣ Send Response */
// 		/* ---------------------------------- */

// 		return OK(
// 			res,
// 			{
// 				lastQuestionId: null,
// 				timeInMin,
// 				examId: newExam._id,
// 				totalQuestions: formattedQuestions.length,
// 				questions: formattedQuestions,
// 			},
// 			"Mock exam started successfully",
// 		);
// 	} catch (err: any) {
// 		console.error("Mock Exam Error:", err);

// 		if (err.message) return BADREQUEST(res, err.message);

// 		return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
// 	}
// };
export const getUserMockExamQuestions = async (req: Request, res: Response) => {
  try {
    const { id } = (req as any).params;
    const userId = (req as any).user.id;
    const { type = "NEW" } = req.query;

    const examObjectId = new mongoose.Types.ObjectId(id);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    /* ---------------------------------- */
    /* 1️⃣ Get Exam */
    /* ---------------------------------- */

    let examData: any = await MockExamModel.findById(id).lean();

    let isResultMode = false;

    if (!examData) {
      examData = await MockExamResultModel.findById(id)
        .populate({
          path: "mockExamId",
          select: "numberOfQuestions timeInMin syllabus courseId isRandom",
        })
        .lean();

      if (!examData) {
        return BADREQUEST(res, "Mock exam not found");
      }

      isResultMode = true;
    }

    const baseExam = isResultMode ? examData.mockExamId : examData;

    const { numberOfQuestions, timeInMin, syllabus, courseId, isRandom } =
      baseExam;
    const courseObjectId = new mongoose.Types.ObjectId(courseId);
    const allowedDomains = new Set(
      (Array.isArray(syllabus) ? syllabus : [])
        .map((item: any) => String(item?.domain ?? "").trim())
        .filter(Boolean),
    );

    const dedupeQuestionsById = (questions: any[]): any[] => {
      const seenQuestionIds = new Set<string>();
      return questions.filter((question: any) => {
        const questionId = question?._id?.toString();
        if (!questionId || seenQuestionIds.has(questionId)) return false;
        seenQuestionIds.add(questionId);
        return true;
      });
    };
    const fetchAllowedQuestions = async (
      size: number,
      excludedQuestionIds: mongoose.Types.ObjectId[] = [],
    ) => {
      if (size <= 0 || !allowedDomains.size) return [];

      const matchStage: any = {
        courseId: courseObjectId,
        domainName: { $in: Array.from(allowedDomains) },
        status: "ACTIVE",
        isPractice: false,
      };

      if (excludedQuestionIds.length) {
        matchStage._id = { $nin: excludedQuestionIds };
      }

      return QuestionModel.aggregate([
        { $match: matchStage },
        { $sample: { size } },
      ]);
    };

    /* ---------------------------------- */
    /* 🔁 PAUSED FLOW (NO DEDUCTION) */
    /* ---------------------------------- */

    if (type === "PAUSED") {
      const previousAttempt = await MockExamResultModel.findOneAndUpdate(
        {
          userId: userObjectId,
          _id: examObjectId,
          currentStatus: "PAUSED",
        },
        { $set: { currentStatus: "STARTED" } },
        { new: true },
      );

      if (!previousAttempt) {
        return BADREQUEST(res, "Paused exam not found");
      }

      const examQuestions = await MockExamQuestionModel.find({
        examId: examObjectId,
      })
        .sort({ createdAt: 1 })
        .lean();

      const questionIds = [
        ...new Set(examQuestions.map((q) => q.questionId.toString())),
      ];
      const attemptMap = new Map(
        examQuestions.map((entry: any) => [entry.questionId.toString(), entry]),
      );

      let questions: any[] = await QuestionModel.find({
        _id: { $in: questionIds },
        courseId: courseObjectId,
        domainName: { $in: Array.from(allowedDomains) },
        status: "ACTIVE",
        isPractice: false,
      }).lean();

      const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));

      questions = questionIds
        .map((id) => questionMap.get(id.toString()))
        .filter(Boolean);

      const formattedQuestions = questions.map((q: any) => {
        const attempt = attemptMap.get(q?._id?.toString());

        if (q?.type === "MCQ" && q.mcq?.length) q.mcq = shuffleArray(q.mcq);

        if (q?.type === "DND" && q.dnd?.options?.length)
          q.dnd.options = shuffleArray(q.dnd.options);

        if (q?.type === "FIB" && q.fib?.length) q.fib = shuffleArray(q.fib);

        return {
          ...q,
          isAttempted: attempt?.isAttempted ?? false,
          answerJson: attempt?.answerJson ?? null,
          isCorrect: attempt?.isCorrect ?? null,
          image: q?.image ? getFileUrlUser(q.image) : null,
        };
      });

      return OK(
        res,
        {
          lastQuestionId: previousAttempt?.lastQuestionId || null,
          timeInMin: previousAttempt.availableTime,
          timeTaken: previousAttempt.timeTaken,
          examId: previousAttempt._id,
          totalQuestions: formattedQuestions.length,
          questions: formattedQuestions,
        },
        "Mock exam resumed successfully",
      );
    }

    /* ---------------------------------- */
    /* 2️⃣ Attempt Number */
    /* ---------------------------------- */

    const previousAttempts = await MockExamResultModel.countDocuments({
      userId: userObjectId,
      mockExamId: examObjectId,
    });

    const attemptNumber = previousAttempts + 1;

    const newExam = await MockExamResultModel.create({
      userId: userObjectId,
      attemptNumber,
      mockExamId: examObjectId,
      currentStatus: "STARTED",
      availableTime: timeInMin.toString(),
    });

    /* ---------------------------------- */
    /* 3️⃣ Pick Questions */
    /* ---------------------------------- */

    let finalQuestions: any[] = [];

    const shouldReusePreviousAttempt = !isRandom && previousAttempts > 0;

    if (shouldReusePreviousAttempt) {
      const lastAttempt = await MockExamResultModel.findOne({
        userId: userObjectId,
        mockExamId: examObjectId,
        attemptNumber: attemptNumber - 1,
      }).lean();

      if (lastAttempt) {
        const previousQuestionEntries = await MockExamQuestionModel.find({
          examId: lastAttempt._id,
        }).lean();

        const questionIds = previousQuestionEntries.map((q) => q.questionId);
        if (questionIds.length > 0) {
          const questions = await QuestionModel.find({
            _id: { $in: questionIds },
            courseId: courseObjectId,
            domainName: { $in: Array.from(allowedDomains) },
            status: "ACTIVE",
            isPractice: false,
          }).lean();

          const questionMap = new Map(
            questions.map((q: any) => [q._id.toString(), q]),
          );

          finalQuestions = questionIds
            .map((id) => questionMap.get(id.toString()))
            .filter(Boolean);

          if (finalQuestions.length) {
            finalQuestions = shuffleArray(finalQuestions);
          }
        }
      }
    }

    if (!finalQuestions.length) {
      for (const item of syllabus) {
        const domainName = String(item?.domain ?? "").trim();
        const count = Math.round((item.percentage / 100) * numberOfQuestions);

        if (!domainName || count <= 0) continue;

        const questions = await QuestionModel.aggregate([
          {
            $match: {
              courseId: courseObjectId,
              domainName,
              status: "ACTIVE",
              isPractice: false,
            },
          },
          { $sample: { size: count } },
        ]);

        finalQuestions.push(...questions);
      }

      finalQuestions = dedupeQuestionsById(finalQuestions);

      /* ---------------------------------- */
      /* 4️⃣ Fill Missing */
      /* ---------------------------------- */

      if (finalQuestions.length < numberOfQuestions) {
        const remaining = numberOfQuestions - finalQuestions.length;
        const excludedQuestionIds = finalQuestions
          .map((question: any) => question._id)
          .filter(Boolean);
        const extra = await fetchAllowedQuestions(
          remaining,
          excludedQuestionIds,
        );
        finalQuestions.push(...extra);
      }

      if (!finalQuestions.length) {
        return BADREQUEST(res, "No questions found");
      }
    }

    if (isRandom && finalQuestions.length > 1) {
      finalQuestions = shuffleArray(finalQuestions);
    }

    finalQuestions = finalQuestions.filter((question: any) => {
      const domainName = String(question?.domainName ?? "").trim();
      return allowedDomains.has(domainName);
    });

    /* ---------------------------------- */
    /* 5️⃣ Shuffle */
    /* ---------------------------------- */

    if (finalQuestions.length < numberOfQuestions) {
      const remaining = numberOfQuestions - finalQuestions.length;
      const excludedQuestionIds = finalQuestions
        .map((question: any) => question._id)
        .filter(Boolean);
      const extra = await fetchAllowedQuestions(remaining, excludedQuestionIds);
      finalQuestions.push(...extra);
    }

    finalQuestions = dedupeQuestionsById(finalQuestions);

    if (!finalQuestions.length) {
      return BADREQUEST(res, "No questions found");
    }

    const formattedQuestions = finalQuestions.map((q: any) => {
      if (q.type === "MCQ" && q.mcq?.length) q.mcq = shuffleArray(q.mcq);

      if (q.type === "DND" && q.dnd?.options?.length)
        q.dnd.options = shuffleArray(q.dnd.options);

      if (q.type === "FIB" && q.fib?.length) q.fib = shuffleArray(q.fib);

      return {
        ...q,
        isAttempted: false,
        answerJson: null,
        isCorrect: null,
        image: q.image ? getFileUrlUser(q.image) : null,
      };
    });

    /* ---------------------------------- */
    /* 6️⃣ Save Questions */
    /* ---------------------------------- */
    /* ---------------------------------- */
    /* 7️⃣ Insert Mock Exam Result Entries */
    /* ---------------------------------- */

    await MockExamQuestionModel.insertMany(
      formattedQuestions.map((q: any) => ({
        examId: newExam._id,
        questionId: q._id,
        isCorrect: null,
      })),
    );

    /* ---------------------------------- */
    /* 8️⃣ Send Response */
    /* ---------------------------------- */

    return OK(
      res,
      {
        lastQuestionId: null,
        timeInMin,
        examId: newExam._id,
        totalQuestions: formattedQuestions.length,
        questions: formattedQuestions,
      },
      "Mock exam started successfully",
    );
  } catch (err: any) {
    console.error("Mock Exam Error:", err);

    if (err.message) return BADREQUEST(res, err.message);

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const pauseMockExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { timeTaken = "00:00:00" } = req.query;
    const unansaweredQuestions = await MockExamQuestionModel.countDocuments({
      examId: id,
      isAttempted: false,
    });
    await MockExamResultModel.findByIdAndUpdate(id, {
      currentStatus: "PAUSED",
      timeTaken,
      unanswered: unansaweredQuestions || 0,
    });

    return OK(res, {}, "Submitted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const submitMockQuestionsResponse = async (
  req: Request,
  res: Response,
) => {
  try {
    const {
      questionId,
      isCorrect = false,
      examId,
      isAttempted = true,
      answerJson,
    } = req.body;
    const result = await MockExamQuestionModel.findOneAndUpdate(
      { questionId, examId },
      { $set: { isCorrect, isAttempted, answerJson } },
      { new: true },
    );

    if (!result) {
      return BADREQUEST(res, "Questons not submitted");
    }

    await MockExamResultModel.findByIdAndUpdate(examId, {
      $set: { lastQuestionId: questionId },
    });

    return OK(res, {}, "Submitted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getAllMockExamsResult = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const data = await MockExamResultModel.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      // sort first so $first in the group gives the latest attempt
      { $sort: { updatedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: { userId: "$userId", mockExamId: "$mockExamId" },
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
      {
        $lookup: {
          from: "mockexams",
          localField: "mockExamId",
          foreignField: "_id",
          as: "mockExamId",
        },
      },
      { $unwind: { path: "$mockExamId", preserveNullAndEmptyArrays: true } },
    ]);

    const formatted = data.map((item: any) => {
      const totalQuestions = item?.mockExamId?.numberOfQuestions || 0;
      const correct = item?.correct || 0;
      const percentage =
        item?.overallPercentage ??
        (totalQuestions > 0
          ? Number(((correct / totalQuestions) * 100).toFixed(2))
          : 0);

      return {
        ...item,
        score: `${percentage}% (${correct}/${totalQuestions})`,
      };
    });

    return OK(res, formatted, "Fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getMockExamResultBoard = async (req: Request, res: Response) => {
  try {
    const { examId, timeTaken } = req.query;
    const results: any = await MockExamQuestionModel.find({
      examId,
    })
      .populate("questionId")
      .sort({ createdAt: 1 });

    const mainTable = await MockExamResultModel.findById(examId).lean();

    if (!results.length) {
      return BADREQUEST(res, "No result found");
    }

    // =============================
    // ✅ BASIC COUNTS
    // =============================

    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    const domainMap: any = {};

    results.forEach((item: any) => {
      const domain = item.questionId?.domainName || "General";

      if (!domainMap[domain]) {
        domainMap[domain] = {
          correct: 0,
          total: 0,
          percentage: 0,
        };
      }

      domainMap[domain].total += 1;

      if (item.isAttempted === false) {
        unanswered++;
      } else if (item.isAttempted === true && item.isCorrect) {
        correct++;
        domainMap[domain].correct += 1;
      } else if (item.isAttempted === true && item.isCorrect === false) {
        incorrect++;
      }
    });

    const totalQuestions = results.length;

    // =============================
    // ✅ OVERALL PERCENTAGE
    // (Based on total questions)
    // =============================

    const overallPercentage =
      totalQuestions > 0
        ? Number(((correct / totalQuestions) * 100).toFixed(2))
        : 0;

    // =============================
    // ✅ DOMAIN-WISE PERCENTAGE
    // =============================

    Object.keys(domainMap).forEach((domain) => {
      const domainData = domainMap[domain];

      domainData.percentage =
        domainData.total > 0
          ? Number(((domainData.correct / domainData.total) * 100).toFixed(2))
          : 0;
    });

    // =============================
    // ✅ FINAL RESPONSE
    // =============================

    const examData = await MockExamModel.findById(mainTable?.mockExamId).lean();
    if (!examData) {
      return BADREQUEST(res, "No mock-exam found");
    }
    const remarks =
      examData?.remarks.find(
        (val: any) => Number(val.start) === overallPercentage,
      ) ??
      examData?.remarks.find(
        (val: any) =>
          Number(val.start) <= overallPercentage &&
          Number(val.end) >= overallPercentage,
      );

    const response = {
      correct,
      incorrect,
      unanswered,
      remarks: remarks?.remarks || null,
      overallPercentage,
      timeTaken: timeTaken,
      scoreBreakDown: domainMap,
      remarksArr: examData?.remarks,
    };

    const result = await MockExamResultModel.findByIdAndUpdate(examId, {
      $set: {
        currentStatus: "COMPLETED",
        correct,
        incorrect,
        unanswered,
        remarks: remarks?.remarks,
        overallPercentage,
        timeTaken: timeTaken,
        scoreBreakDown: domainMap,
        completedAt: new Date(),
      },
    });
    await createIssuingCertificate(
      {
        userId: mainTable?.userId,
        courseId: examData?.courseId,
        moduleType: "mockexam",
        moduleTypeId: result?._id,
        completedAt: new Date(),
      },
      res,
    );
    return OK(
      res,
      { ...response, _id: result?._id },
      "Result fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const examReport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const response = await MockExamResultModel.find({
      userId,
      currentStatus: "COMPLETED",
    })
      .populate("mockExamId")
      .sort({ updatedAt: -1 });
    return OK(res, response, "Submitted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const examReportQuestion = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { reportId, status } = req.query;
    if (!reportId) {
      throw new Error("Report Id is required");
    }
    let query = {};
    if (status === "Correct") {
      query = {
        isCorrect: true,
        isAttempted: true,
        examId: reportId,
      };
    } else if (status === "Incorrect") {
      query = {
        isCorrect: false,
        isAttempted: true,
        examId: reportId,
      };
    } else if (status === "Unattempted") {
      query = {
        isAttempted: false,
        isCorrect: null,
        examId: reportId,
      };
    } else {
      query = {
        examId: reportId,
      };
    }
    const response = await MockExamQuestionModel.find({
      ...query,
    }).populate("questionId");

    return OK(res, response, "Submitted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getDropdownOfReport = async (req: Request, res: Response) => {
  try {
    const data = reportTypeForUser;
    return OK(res, data, "Fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const reportAProblem = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      courseId,
      emailSent,
      type,
      relevantId = null,
      comments = null,
    } = req.body;
    const check = await CheckCourseExistUser(courseId);
    if (typeof check === "string") throw new Error(check);
    const [courseDetails, reporterDetails, ownerDetails] = await Promise.all([
      CourseModel.findById(courseId).select("name").lean(),
      UserModel.findById(userId)
        .select("fullName firstname lastname email")
        .lean(),
      AdminModel.findOne({ role: "OWNER" })
        .select("fullName email sendReportEmail")
        .lean(),
    ]);
    const identifier = customAlphabet("0123456789", 5);
    const report = await ReportProblemModel.create({
      identifier: identifier(),
      userId,
      courseId,
      type,
      relevantId,
      emailSent,
      comments,
    });

    const ownerEmail =
    process.env.ADMIN_RESEND_GMAIL_ACCOUNT ||
    process.env.COMPANY_RESEND_GMAIL_ACCOUNT;
    if (ownerEmail) {
      const reporterName =
        reporterDetails?.fullName?.trim() ||
        [reporterDetails?.firstname, reporterDetails?.lastname]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        reporterDetails?.email ||
        "User";
      const reportTypeLabel = (reportTypeMapper[
        type as keyof typeof reportTypeMapper
      ] ||
        type ||
        "Problem") as string;

      const problemReportedEmailPayload = {
        ownerEmail,
        reportId: report.identifier,
        courseName: courseDetails?.name || "Selected course",
        reportType: reportTypeLabel,
        reporterName,
        reportedAt: report.createdAt || new Date(),
        ...(ownerDetails?.fullName ? { ownerName: ownerDetails.fullName } : {}),
        ...(reporterDetails?.email
          ? { reporterEmail: reporterDetails.email }
          : {}),
        ...(relevantId !== undefined && relevantId !== null
          ? { relevantId }
          : {}),
        ...(comments !== undefined && comments !== null ? { comments } : {}),
      };

      await sendProblemReportedEmailToOwner(problemReportedEmailPayload).catch(
        (emailErr) => {
          console.error("Failed to send problem reported email:", emailErr);
        },
      );
    } else {
      console.warn(
        "Problem reported email skipped: owner email not available or notifications disabled.",
      );
    }

    return OK(res, {}, "Submitted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const profileStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { id } = req.params as any;

    /* -------------------------------------------------- */
    /* ✅ FETCH DATA */
    /* -------------------------------------------------- */

    const [completedExams, bookmarks] = await Promise.all([
      MockExamResultModel.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            currentStatus: "COMPLETED",
          },
        },
        {
          $lookup: {
            from: "mockexams",
            localField: "mockExamId",
            foreignField: "_id",
            as: "exam",
          },
        },
        {
          $unwind: "$exam",
        },
        {
          $match: {
            "exam.courseId": new mongoose.Types.ObjectId(id),
          },
        },
      ]),

      BookmarkModel.find({
        type: "LESSON",
        userId: new mongoose.Types.ObjectId(userId),
        isAttempted: true,
      })
        .populate("moduleId")
        .lean(),
    ]);

    /* -------------------------------------------------- */
    /* ✅ HELPERS */
    /* -------------------------------------------------- */

    // LESSON FORMAT => MM:SS
    const parseLessonDuration = (duration: string) => {
      if (!duration) return 0;

      const [minutes = 0, seconds = 0] = duration.split(":").map(Number);

      return minutes + seconds / 60;
    };

    // MOCK EXAM FORMAT => HH:MM:SS
    const parseExamDuration = (duration: string) => {
      if (!duration) return 0;

      const [hours = 0, minutes = 0, seconds = 0] = duration
        .split(":")
        .map(Number);

      return hours * 60 + minutes + seconds / 60;
    };

    /* -------------------------------------------------- */
    /* ✅ MOCK TEST AVG SCORE */
    /* -------------------------------------------------- */

    const mockTestAvgScore =
      completedExams.length > 0
        ? completedExams.reduce(
            (sum, item: any) => sum + (item.overallPercentage || 0),
            0,
          ) / completedExams.length
        : 0;

    /* -------------------------------------------------- */
    /* ✅ LESSON TIME */
    /* -------------------------------------------------- */

    let totalLearningMinutes = 0;

    // avoid duplicate lesson duration counting
    const countedLessonIds = new Set<string>();

    for (const item of bookmarks as any[]) {
      if (item.type === "LESSON" && item.lessonsId && item.moduleId) {
        const moduleData: any = item.moduleId;

        // course filter
        if (moduleData?.courseId?.toString() !== id.toString()) {
          continue;
        }

        const lesson = moduleData?.lessons?.find(
          (l: any) => l._id.toString() === item.lessonsId.toString(),
        );

        if (!lesson) continue;

        // prevent duplicate count
        if (countedLessonIds.has(lesson._id.toString())) {
          continue;
        }

        countedLessonIds.add(lesson._id.toString());

        totalLearningMinutes += parseLessonDuration(lesson.duration || "0:00");
      }
    }

    /* -------------------------------------------------- */
    /* ✅ MOCK EXAM TIME */
    /* -------------------------------------------------- */

    const mockExamMinutes = completedExams.reduce((sum: number, item: any) => {
      return sum + parseExamDuration(item.timeTaken || "00:00:00");
    }, 0);

    totalLearningMinutes += mockExamMinutes;

    /* -------------------------------------------------- */
    /* ✅ FINAL FORMAT */
    /* -------------------------------------------------- */

    const totalHours = Math.floor(totalLearningMinutes / 60);

    const remainingMinutes = Math.floor(totalLearningMinutes % 60);

    const formattedTimeSpent = `${totalHours}h ${remainingMinutes}m`;

    /* -------------------------------------------------- */
    /* ✅ RESPONSE */
    /* -------------------------------------------------- */

    return OK(
      res,
      {
        timeSpentLearning: formattedTimeSpent,

        totalLearningMinutes: Math.round(totalLearningMinutes),

        mockTestAvgScore: Number(mockTestAvgScore.toFixed(2)),

        fullName: (req as any).user.fullName,
        firstname: (req as any).user.firstname,
        lastname: (req as any).user.lastname,
        email: (req as any).user.email,
        image: (req as any).user.image,
        phoneNumber: (req as any).user.phoneNumber,
        countryCode: (req as any).user.countryCode,

        activePlans: [],
      },
      "Data Fetched",
    );
  } catch (err: any) {
    console.log(err);

    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { firstname, lastname, image, phoneNumber, countryCode } = req.body;

    // if (!countryCode || !phoneNumber) {
    //   throw new Error("Phone number and country code is required");
    // }

    const checkExist = await UserModel.find({
      _id: { $ne: userId },
      // phoneNumber,
      // countryCode,
    });

    // if (checkExist.length) {
    //   throw new Error("Phone number already exist");
    // }

    await UserModel.findByIdAndUpdate(userId, {
      $set: {
        firstname,
        lastname,
        fullName: `${firstname} ${lastname}`,
        image,
        phoneNumber,
        countryCode,
      },
    });

    return OK(res, {}, "Updated Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteProfileImage = async(req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const user = await UserModel.findById(userId);
    if (!user) {
      return BADREQUEST(res, "User not found");
    }
    if(!user.image) {
      return BADREQUEST(res, "No profile image to delete");
    }
    await deleteFileFromS3(user?.image);
    user.image = null;
    await user.save();
    return OK(res, {}, "Profile image deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateUserName = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { firstname, lastname } = req.body;

    await UserModel.findByIdAndUpdate(userId, {
      $set: {
        firstname,
        lastname,
        fullName: `${firstname} ${lastname}`,
      },
    });

    return OK(res, {}, "Updated Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getCertificates = async (req: Request, res: Response) => {
  try {
    const userIdRaw = (req as any).user?._id;
    const search = req.query.search as string;

    if (!userIdRaw || !mongoose.Types.ObjectId.isValid(userIdRaw)) {
      return BADREQUEST(res, "Valid userId is required");
    }

    const userId = new mongoose.Types.ObjectId(userIdRaw);

    const courseId = req.query.courseId as string;

    // courseId is required
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return BADREQUEST(res, "Valid courseId is required");
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const matchQuery = {
      userId,
      courseId: new mongoose.Types.ObjectId(courseId),
      status: "ISSUED",
    };
    const searchFilter = search
      ? {
          $or: [
            { "courseId.name": { $regex: search, $options: "i" } },
            { "templateId.templateName": { $regex: search, $options: "i" } },
            { moduleType: { $regex: search, $options: "i" } },
          ],
        }
      : null;

    const pipeline: any[] = [
      // filter by userId + courseId + ISSUED
      {
        $match: matchQuery,
      },

      // populate courseId
      {
        $lookup: {
          from: "courses",
          localField: "courseId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                status: 1,
              },
            },
          ],
          as: "courseId",
        },
      },

      {
        $unwind: {
          path: "$courseId",
          preserveNullAndEmptyArrays: true,
        },
      },

      // populate templateId with selected fields only
      {
        $lookup: {
          from: "certificatetemplates",
          localField: "templateId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                templateName: 1,
                status: 1,
                defaults: 1,
              },
            },
          ],
          as: "templateId",
        },
      },

      {
        $unwind: {
          path: "$templateId",
          preserveNullAndEmptyArrays: true,
        },
      },
      ...(searchFilter ? [{ $match: searchFilter }] : []),

      // MongoDB requires $lookup.from to be a static collection name.
      // So we join each possible collection conditionally and then collapse.
      {
        $lookup: {
          from: "mockexamresults",
          let: { moduleTypeId: "$moduleTypeId", moduleType: "$moduleType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$moduleType", "MockExamResult"] },
                    { $eq: ["$_id", "$$moduleTypeId"] },
                  ],
                },
              },
            },
          ],
          as: "mockExamResultDoc",
        },
      },
      {
        $lookup: {
          from: "assignments",
          let: { moduleTypeId: "$moduleTypeId", moduleType: "$moduleType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$moduleType", "Assignment"] },
                    { $eq: ["$_id", "$$moduleTypeId"] },
                  ],
                },
              },
            },
          ],
          as: "assignmentDoc",
        },
      },
      {
        $lookup: {
          from: "quizzes",
          let: { moduleTypeId: "$moduleTypeId", moduleType: "$moduleType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$moduleType", "Quiz"] },
                    { $eq: ["$_id", "$$moduleTypeId"] },
                  ],
                },
              },
            },
          ],
          as: "quizDoc",
        },
      },
      {
        $addFields: {
          moduleTypeId: {
            $ifNull: [
              { $arrayElemAt: ["$mockExamResultDoc", 0] },
              {
                $ifNull: [
                  { $arrayElemAt: ["$assignmentDoc", 0] },
                  { $arrayElemAt: ["$quizDoc", 0] },
                ],
              },
            ],
          },
        },
      },
      {
        $project: {
          mockExamResultDoc: 0,
          assignmentDoc: 0,
          quizDoc: 0,
        },
      },

      {
        $sort: {
          createdAt: -1,
        },
      },

      {
        $skip: skip,
      },

      {
        $limit: limit,
      },
    ];

    const countPipeline = [
      {
        $match: matchQuery,
      },
      {
        $lookup: {
          from: "courses",
          localField: "courseId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
              },
            },
          ],
          as: "courseId",
        },
      },
      {
        $unwind: {
          path: "$courseId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "certificatetemplates",
          localField: "templateId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                templateName: 1,
              },
            },
          ],
          as: "templateId",
        },
      },
      {
        $unwind: {
          path: "$templateId",
          preserveNullAndEmptyArrays: true,
        },
      },
      ...(searchFilter ? [{ $match: searchFilter }] : []),
      {
        $count: "total",
      },
    ];

    const [data, totalResult] = await Promise.all([
      IssueCertificateModel.aggregate(pipeline),
      IssueCertificateModel.aggregate(countPipeline),
    ]);

    const total = totalResult[0]?.total || 0;

    return res.status(200).json({
      success: true,
      message: "Data Fetched Successfully",
      data: data?.map((val) => {
        if (val.certificatePng || val.certificatePdf) {
          return {
            ...val,
            certificatePng: val?.certificatePng
              ? getFileUrlUser(val?.certificatePng)
              : null,
            certificatePdf: val?.certificatePdf
              ? getFileUrlUser(val?.certificatePdf)
              : null,
          };
        } else {
          return val;
        }
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    return INTERNAL_SERVER_ERROR(res, err.message || "Internal Server Error");
  }
};

export const getSupport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { id } = req.params;
    return OK(res, {}, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getBookmarks = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const data = await BookmarkModel.find({
      userId,
      type: { $in: ["LESSON", "EXAM_STRATEGY", "APPLICATION_SUPPORT", "TASK"] },
    });
    return OK(res, data, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { oldPassword, newPassword } = req.body;
    const user = (await UserModel.findById(userId)) as any;
    if (!user) {
      throw new Error("User does not exist");
    }
    const isMatch = await bcrypt.compare(oldPassword, user?.password);

    if (!isMatch) {
      throw new Error("Incorrect Password");
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.save();

    return OK(res, {}, "Password Changed Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const logout = async (req: Request, res: Response) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      throw new Error("fcmToken is required");
    }

    const userId = (req as any).user?.id;
    const user = (await UserModel.findById(userId)) as any;
    if (!user) {
      throw new Error("User does not exist");
    }

    await UserModel.findByIdAndUpdate(userId, {
      $pull: {
        fcmToken: { token: fcmToken },
      },
    });

    return OK(res, {}, "Logged out successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    await UserModel.findByIdAndUpdate(userId, {
      $set: { status: "DELETED", deletedAt: new Date() },
    });
    return OK(res, {}, "Account Deleted");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getPlatformInfo = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    if (!type) {
      throw new Error("Type is required");
    }

    const data = (await CompanyInfoModel.findOne({})) || ({} as any);

    if (type === "PRIVACY_POLICY") {
      return OK(res, data?.privacyPolicy, "Data Fetched");
    }
    if (type === "TERM_AND_CONDITION") {
      return OK(res, data?.termAndConditions, "Data Fetched");
    }
    if (type === "REFUND_POLICY") {
      return OK(res, data?.refuncPolicy, "Data Fetched");
    }
    if (type === "SUPPORT") {
      return OK(
        res,
        {
          title: data?.title || "",
          description: data?.description || "",
          address: data?.address || "",
          primaryEmail: data?.primaryEmail || "",
          secondaryEmail: data?.secondaryEmail || "",
          primaryContact: data?.primaryContact || "",
          secondaryContact: data?.secondaryContact || "",
        },
        "Data Fetched",
      );
    }

    throw new Error("Invalid Type");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const {
      type = "ACTIVE",
      search,
      page = "1",
      limit = "10",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;


    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.max(Number(limit), 1);
    const skip = (pageNumber - 1) * pageSize;


    let sortQuery: any = {};


    // Mapping frontend fields with database fields
    switch (sortBy) {

      case "name":
        sortQuery.fullName = sortOrder === "desc" ? -1 : 1;
        break;


      case "email":
        sortQuery.email = sortOrder === "desc" ? -1 : 1;
        break;


      case "startDate":
        sortQuery.createdAt = sortOrder === "desc" ? -1 : 1;
        break;


      case "channel":
        sortQuery["fcmToken.deviceType"] =
          sortOrder === "desc" ? -1 : 1;
        break;


      default:
        sortQuery[sortBy as string] =
          sortOrder === "desc" ? -1 : 1;

    }



    let query: any = {};


    if (search && (search as string).trim() !== "") {
      query = {
        $or: [
          {
            firstname: {
              $regex: search,
              $options: "i"
            }
          },
          {
            lastname: {
              $regex: search,
              $options: "i"
            }
          },
          {
            fullName: {
              $regex: search,
              $options: "i"
            }
          },
          {
            email: {
              $regex: search,
              $options: "i"
            }
          },
          {
            phoneNumber: {
              $regex: search,
              $options: "i"
            }
          },
        ],
      };
    }


    const userQuery = {
      role: "USER",
      status: type,
      ...query,
    };


    const [data, totalData] = await Promise.all([

      UserModel.find(userQuery)
        .sort(sortQuery)
        .skip(skip)
        .limit(pageSize)
        .lean(),


      UserModel.countDocuments(userQuery)

    ]);



    return OK(
      res,
      {
        data: data.map((val) => {

          if (val.image) {
            return {
              ...val,
              image: getFileUrl(val.image)
            };
          }

          return val;

        }),

        pagination: {
          total: totalData,
          page: pageNumber,
          limit: pageSize,
          totalPages: Math.ceil(totalData / pageSize),
        },

      },
      "Users fetched successfully",
    );


  } catch (err: any) {

    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(
      res,
      "Internal Server Error"
    );
  }
};
// export const getUsers = async (req: Request, res: Response) => {
//   try {
//     const { type = "ACTIVE", search, page = "1", limit = "10", sortBy = "createdAt", sortOrder = "asc" } = req.query;

//     const pageNumber = Math.max(Number(page), 1);
//     const pageSize = Math.max(Number(limit), 1);
//     const skip = (pageNumber - 1) * pageSize;
// const sortQuery: any = {
//       [sortBy as string]: sortOrder === "desc" ? -1 : 1
//     };
//     let query = {};

//     if (search && (search as any)?.trim() !== "") {
//       query = {
//         $or: [
//           { firstname: { $regex: search, $options: "i" } },
//           { lastname: { $regex: search, $options: "i" } },
//           { fullName: { $regex: search, $options: "i" } },
//           { email: { $regex: search, $options: "i" } },
//           { phoneNumber: { $regex: search, $options: "i" } },
//         ],
//       };
//     }

//     const [data, totalData] = await Promise.all([
//       UserModel.find({
//         role: "USER",
//         status: type,
//         ...query,
//       })
//         .sort(sortQuery)
//         .skip(skip)
//         .limit(pageSize)
//         .lean(),

//       UserModel.countDocuments({
//         role: "USER",
//         status: type,
//         ...query,
//       }),
//     ]);

//     return OK(
//       res,
//       {
//         data: data?.map((val) => {
//           if (val.image) {
//             return { ...val, image: getFileUrl(val?.image) };
//           } else {
//             return val;
//           }
//         }),
//         pagination: {
//           total: totalData,
//           page: pageNumber,
//           limit: pageSize,
//           totalPages: Math.ceil(totalData / pageSize),
//         },
//       },
//       "Users fetched successfully",
//     );
//   } catch (err: any) {
//     if (err.message) {
//       return BADREQUEST(res, err.message);
//     }
//     return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
//   }
// };

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { type = "OVERVIEW", userId, days = 7 } = req.query as any;

    if (
      ![
        "EXAMS",
        "CERTIFICATES",
        "PURCASES",
        "ACTIVITY",
        "PROFILE",
        "OVERVIEW",
      ].includes(type)
    ) {
      throw new Error("Invalid type");
    }

    const pipeline: any = [
      {
        $match: {
          status: "ACTIVE",
          userId: new mongoose.Types.ObjectId(userId), // ✅ filter specific user
        },
      },

      // ✅ Join user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      // ✅ Join mock exam
      {
        $lookup: {
          from: "mockexams",
          localField: "mockExamId",
          foreignField: "_id",
          as: "exam",
        },

      },
      { $unwind: "$exam" },

      // ✅ Join course (NEW)
      {
        $lookup: {
          from: "courses",
          localField: "exam.courseId",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: "$course" },

      // ✅ Domain summary
      {
        $lookup: {
          from: "mockexamquestions",
          let: { resultId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$examId", "$$resultId"] },
              },
            },
            {
              $lookup: {
                from: "questions",
                localField: "questionId",
                foreignField: "_id",
                as: "question",
              },
            },
            { $unwind: "$question" },

            {
              $group: {
                _id: {
                  $ifNull: ["$question.domainName", "General"],
                },
                total: { $sum: 1 },
                correct: {
                  $sum: {
                    $cond: [{ $eq: ["$isCorrect", true] }, 1, 0],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                domain: "$_id",
                total: 1,
                correct: 1,
                successRate: {
                  $round: [
                    {
                      $multiply: [{ $divide: ["$correct", "$total"] }, 100],
                    },
                    2,
                  ],
                },
              },
            },
          ],
          as: "domainSummary",
        },
      },

      // ✅ Final projection
      {
        $project: {
          _id: 1,
          attemptNumber: 1,
          createdAt: 1,
          currentStatus: 1,
          correct: 1,
          incorrect: 1,
          unanswered: 1,
          remarks: 1,
          overallPercentage: 1,
          timeTaken: 1,
          exam: {_id: "$exam _id", name: "$exam.name",remarks: "$exam.remarks"},
          userName: "$user.fullName",
          examName: "$exam.name",
          courseName: "$course.name", 
          completedAt: 1,
          domainSummary: 1,
        },
      },

      // ✅ Sort (optional but recommended)
      {
        $sort: { createdAt: -1 },
      },
    ];

    if (type == "EXAMS") {
      const result = await MockExamResultModel.aggregate(pipeline);
      return OK(res, result, "Data fetched successfully");
    }
    if (type == "CERTIFICATES") {
      let certificate = await IssueCertificateModel.find({
        userId,
        status: "ISSUED",
      })
        .populate({
          path: "templateId",
          select: "templateName createdAt defaults",
        })
        .sort({ createdAt: -1 })
        .lean();

      const result = certificate?.map((val) => {
        if (val.certificatePng || val.certificatePdf) {
          return {
            ...val,
            certificatePng: getFileUrl(val.certificatePng),
            certificatePdf: getFileUrl(val.certificatePdf),
          };
        } else {
          return val;
        }
      });
      return OK(res, result, "Data fetched successfully");
    }
    if (type == "PURCASES") {
      const { userId } = req.query as any;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return BADREQUEST(res, "Invalid userId");
      }

      const objectUserId = new mongoose.Types.ObjectId(userId);

      /* -------------------------------------------------- */
      /* ✅ FETCH PURCHASES */
      /* -------------------------------------------------- */
      const purchases = await PurchaseModel.find({
        userId: objectUserId,
        status: { $in: ["SUCCESS", "EXPIRED"] },
      })
        .sort({ purchaseDate: -1 })
        .populate("purchasedProduct")
        .populate("planId", "planName courseName")
        .lean();

      if (!purchases.length) {
        return OK(res, [], "No purchases found");
      }

      /* -------------------------------------------------- */
      /* ✅ MODEL MAPPER */
      /* -------------------------------------------------- */
      const individualModelMap: Record<string, any> = {
        LESSONS: LessonModel,
        PRACTICE_TEST: PracticeExamModel,
        MOCK_EXAM: MockExamModel,
        DOMAIN_TASK: DomainModel,
        APPLICATION_SUPPORT: ApplicationSupportModel,
        FLASH_CARDS: FlashCardCategoryModel,
        COURSE: CourseModel,
      };

      /* -------------------------------------------------- */
      /* ✅ GROUP IDS BY purchaseType */
      /* -------------------------------------------------- */
      const groupedIds: Record<string, any[]> = {};

      purchases.forEach((item: any) => {
        const type = item.purchaseType;
        if (!type) return;

        if (!groupedIds[type]) groupedIds[type] = [];

        let id = null;

        if (
          typeof item.purchasedProduct === "string" ||
          item.purchasedProduct instanceof mongoose.Types.ObjectId
        ) {
          id = item.purchasedProduct;
        } else if (item.purchasedProduct?._id) {
          id = item.purchasedProduct._id;
        }

        if (id) groupedIds[type].push(id);
      });

      /* -------------------------------------------------- */
      /* ✅ FETCH DATA FROM RESPECTIVE MODELS */
      /* -------------------------------------------------- */
      const dataMap: Record<string, Map<string, any>> = {};

      await Promise.all(
        Object.keys(groupedIds).map(async (purchaseType) => {
          const model = individualModelMap[purchaseType];
          if (!model) return;

          let query = model
            .find({ _id: { $in: groupedIds[purchaseType] } })
            .select("name categoryName module domain courseId price"); // adjust per schema

          if (model !== CourseModel) {
            query = query.populate("courseId", "name");
          }

          const docs = await query.lean();

          const map = new Map();
          docs.forEach((doc: any) => {
            map.set(doc._id.toString(), doc);
          });

          dataMap[purchaseType] = map;
        }),
      );

      /* -------------------------------------------------- */
      /* ✅ BUILD FINAL RESPONSE */
      /* -------------------------------------------------- */
      const result = purchases.map((item: any) => {
        const purchaseType = item.purchaseType;

        let productId: any = null;

        if (
          typeof item.purchasedProduct === "string" ||
          item.purchasedProduct instanceof mongoose.Types.ObjectId
        ) {
          productId = item.purchasedProduct.toString();
        } else if (item.purchasedProduct?._id) {
          productId = item.purchasedProduct._id.toString();
        }

        const modelMap = dataMap[purchaseType];
        const product = modelMap?.get(productId);

        const purchasedItem =
          product?.name ||
          product?.module ||
          product?.domain ||
          product?.categoryName ||
          item?.planId?.courseName ||
          item?.planId?.planName ||
          "N/A";
        const planName = item?.planId?.planName || "N/A";
        const courseName = product?.courseId?.name || "N/A";
        return {
          purchaseId: item._id,
          purchaseType: item.purchaseType,
          courseName,
          planName,
          type: item.type,
          purchasedItem, // <-- same field as first API
          mode: item.mode,
          purchaseDate: item.purchaseDate,
          amount: item.purchaseAmount,
          currency: item.currency,
          status: item.status,
          endDate: item.endDate,
        };
      });

      return OK(res, result, "Data fetched successfully");
    }
    if (type == "ACTIVITY") {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      if (!userId) {
        return BADREQUEST(res, "User not found");
      }

      const objectUserId = new mongoose.Types.ObjectId(userId);

      /* -------------------------------------------------- */
      /* ✅ FETCH ALL DATA IN PARALLEL */
      /* -------------------------------------------------- */
      const [progressData, examData, dashboardData] = await Promise.all([
        ProgressModel.find({ userId: objectUserId })
          .populate("moduleId")
          .populate("userId", "fullName image")
          .populate("domainId")
          .lean(),

        MockExamResultModel.find({
          userId: objectUserId,
          status: "ACTIVE",
        })
          .populate({
            path: "mockExamId",
            populate: { path: "courseId" },
          })
          .populate("userId", "fullName image")
          .lean(),

        UserDashboardModel.find({ userId: objectUserId })
          .populate("courseId")
          .populate("questionOfTheDay")
          .populate("userId", "fullName image")
          .lean(),
      ]);

      /* -------------------------------------------------- */
      /* ✅ TRANSFORM INTO COMMON ACTIVITY FORMAT */
      /* -------------------------------------------------- */
      const activities: any[] = [];

      /* ---------- 📘 Progress Activities ---------- */
      progressData.forEach((item: any) => {
        if (item.moduleId) {
          activities.push({
            type: "MODULE_PROGRESS",
            message: `Completed ${item.percentage}% of module "${item.moduleId.module}"`,
            percentage: item.percentage,
            refId: item.moduleId?._id,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            userDetails: item.userId,
          });
        }

        if (item.domainId) {
          activities.push({
            type: "DOMAIN_PROGRESS",
            message: `Completed ${item.percentage}% of domain "${item.domainId.domain}"`,
            percentage: item.percentage,
            refId: item.domainId?._id,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            userDetails: item.userId,
          });
        }
      });

      /* ---------- 📝 Mock Exam Activities ---------- */
      examData.forEach((item: any) => {
        activities.push({
          _id: item._id,
          currentStatus: item.currentStatus,
          type: "MOCK_EXAM",
          message: `Attempted mock exam "${item.mockExamId?.name}" and scored ${item.overallPercentage}%`,
          score: item.overallPercentage,
          correct: item.correct,
          incorrect: item.incorrect,
          examId: item.mockExamId?._id,
          courseName: item.mockExamId?.courseId?.name,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          userDetails: item.userId,
        });
      });

      /* ---------- 📅 Dashboard Activities ---------- */
      dashboardData.forEach((item: any) => {
        if (item.examScheduled && item.examScheduledAt) {
          activities.push({
            type: "EXAM_SCHEDULED",
            message: `Scheduled an exam for ${new Date(item.examScheduledAt).toLocaleString()}`,
            courseName: item.courseId?.name,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            userDetails: item.userId,
          });
        }

        if (item.isQuestionOfTheDayAttempted) {
          activities.push({
            type: "QUESTION_OF_DAY",
            message: `Attempted Question of the Day`,
            questionId: item.questionOfTheDay?._id,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            userDetails: item.userId,
          });
        }
      });

      /* -------------------------------------------------- */
      /* ✅ SORT BY LATEST ACTIVITY */
      /* -------------------------------------------------- */
      activities.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      );

      /* -------------------------------------------------- */
      /* ✅ PAGINATION */
      /* -------------------------------------------------- */
      const total = activities.length;
      const paginatedData = activities.slice(skip, skip + limit);

      return OK(
        res,
        {
          data: paginatedData.map((val) => {
            if (val?.userDetails?.image) {
              return {
                ...val,
                userDetails: {
                  ...val.userDetails,
                  image: getFileUrl(val.userDetails.image),
                },
              };
            } else {
              return val;
            }
          }),
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        },
        "Activity fetched successfully",
      );
    }
    if (type == "OVERVIEW") {
      const objectUserId = new mongoose.Types.ObjectId(userId);

      const [userData, recentExams, progressData] = await Promise.all([
        UserModel.findById(userId).lean(),

        // ✅ Last 5 exams
        MockExamResultModel.find({
          userId: objectUserId,
          status: "ACTIVE",
          currentStatus: "COMPLETED",
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate({
            path: "mockExamId",
            select: "name courseId remarks",
            populate: {
              path: "courseId",
              select: "name",
            },
          })
          .lean(),

        // ✅ All progress (module + domain)
        ProgressModel.find({ userId: objectUserId })
          .populate({
            path: "moduleId",
            select: "module courseId",
            populate: {
              path: "courseId",
              select: "name",
            },
          })
          .populate({
            path: "domainId",
            select: "domain courseId",
            populate: {
              path: "courseId",
              select: "name",
            },
          })
          .lean(),
      ]);

      /* -------------------------------------------------- */
      /* ✅ FORMAT RECENT EXAMS */
      /* -------------------------------------------------- */
      const formattedExams = recentExams.map((item: any) => ({
        examName: item?.mockExamId?.name || null,
        courseName: item?.mockExamId?.courseId?.name || null,
        score: item?.overallPercentage || 0,
        correct: item?.correct || 0,
        incorrect: item?.incorrect || 0,
        unanswered: item?.unanswered || 0,
        createdAt: item?.createdAt,
        timeSpent: item?.timeTaken || 0,
        scoreBreakdown: item?.scoreBreakDown || [],
        overallPercentage: item?.overallPercentage || 0,
        exam: {
          _id: item?.mockExamId?._id || null,
          name: item?.mockExamId?.name || null,
          remarks: item?.mockExamId?.remarks || null,     },
        completedAt: item?.completedAt || null,
      }));

      /* -------------------------------------------------- */
      /* ✅ BUILD COURSE PROGRESS */
      /* -------------------------------------------------- */
      const courseMap: any = {};

      progressData.forEach((item: any) => {
        let courseId = null;
        let courseName = null;

        // ✅ Detect course from module
        if (item.moduleId?.courseId) {
          courseId = item.moduleId.courseId._id.toString();
          courseName = item.moduleId.courseId.name;
        }

        // ✅ Detect course from domain
        if (item.domainId?.courseId) {
          courseId = item.domainId.courseId._id.toString();
          courseName = item.domainId.courseId.name;
        }

        if (!courseId) return;

        if (!courseMap[courseId]) {
          courseMap[courseId] = {
            courseId,
            courseName,
            modules: [],
            domains: [],
          };
        }

        // ✅ Module progress
        if (item.moduleId) {
          courseMap[courseId].modules.push({
            moduleId: item.moduleId._id,
            moduleName: item.moduleId.module,
            percentage: item.percentage,
          });
        }

        // ✅ Domain progress
        if (item.domainId) {
          courseMap[courseId].domains.push({
            domainId: item.domainId._id,
            domainName: item.domainId.domain,
            percentage: item.percentage,
          });
        }
      });

      const courseProgress = Object.values(courseMap);
      const subscriptions = await PurchaseModel.find({
        userId: objectUserId,
        type: { $in: ["FREE_TRIAL", "SUBSCRIPTION"] },
        endDate: { $gte: new Date() },
        status: "SUCCESS",
      })
        .populate("planId")
        .sort({ purchaseDate: 1 })
        .lean();

      // ✅ Extract product IDs
      const productIds = subscriptions
        .map((item: any) => {
          if (!item.purchasedProduct) return null;

          if (
            typeof item.purchasedProduct === "string" ||
            item.purchasedProduct instanceof mongoose.Types.ObjectId
          ) {
            return item.purchasedProduct;
          }

          if (item.purchasedProduct._id) {
            return item.purchasedProduct._id;
          }

          return null;
        })
        .filter(Boolean);

      const products = await CourseModel.find({
        _id: { $in: productIds },
      });

      // ✅ Create map
      const productMap = new Map();
      products.forEach((p: any) => {
        productMap.set(p._id.toString(), p);
      });

      // ✅ Active Since
      const activeSince = subscriptions.length
        ? subscriptions?.[0]?.purchaseDate
        : null;

      // ✅ Build subscription response
      const subscriptionResult = subscriptions.map((item: any) => {
        let productId: any = null;

        if (
          typeof item.purchasedProduct === "string" ||
          item.purchasedProduct instanceof mongoose.Types.ObjectId
        ) {
          productId = item.purchasedProduct.toString();
        } else if (item.purchasedProduct?._id) {
          productId = item.purchasedProduct._id.toString();
        }

        const product = productMap.get(productId);

        return {
          subscriptionId: item._id,
          planName: item?.planId?.planName || null,
          courseName: product?.name || null,
          purchaseDate: item.purchaseDate,
          endDate: item.endDate,
        };
      });

      const subscriptionDetails = {
        activeSince,
        subscriptions: subscriptionResult,
      };
      const getDailyCounts = async (Model: any, match: any = {}) => {
        return Model.aggregate([
          {
            $match: {
              ...match,
              updatedAt: {
                $gte: new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000),
              },
            },
          },
          {
            $project: {
              date: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$updatedAt",
                },
              },
            },
          },
          {
            $group: {
              _id: "$date",
              count: { $sum: 1 },
            },
          },
        ]);
      };
      const [progressStats, examStats, dashboardStats] = await Promise.all([
        getDailyCounts(ProgressModel),
        getDailyCounts(MockExamResultModel, { status: "ACTIVE" }),
        getDailyCounts(UserDashboardModel, {
          isQuestionOfTheDayAttempted: true, // avoid noise
        }),
      ]);
      const activityMap: Record<string, number> = {};

      const merge = (arr: any[]) => {
        arr.forEach((item) => {
          activityMap[item._id] = (activityMap[item._id] || 0) + item.count;
        });
      };

      merge(progressStats);
      merge(examStats);
      merge(dashboardStats);

      const activityGraph = [];

      for (let i = Number(days); i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);

        const key = d.toISOString().split("T")[0];

        activityGraph.push({
          date: key,
          count: activityMap[key as any] || 0,
        });
      }

      /* -------------------------------------------------- */
      /* ✅ FINAL RESPONSE */
      /* -------------------------------------------------- */
      const response = {
        fullName: userData?.fullName || null,
        image: getFileUrl(userData?.image) || null,
        countryCode: userData?.countryCode || null,
        phoneNumber: userData?.phoneNumber || null,
        email: userData?.email || null,
        status: userData?.status || null,

        courseProgress, // ✅ FILLED
        recentExamActivity: formattedExams,
        coursesEnrolled: subscriptionResult || [],
        subscriptionDetails: subscriptionDetails || [],
        activityGraph,
      };

      return OK(res, response, "Data fetched successfully");
    }
    if (type == "PROFILE") {
      const userData = await UserModel.findById(userId).lean();

      return OK(
        res,
        { ...userData, image: getFileUrl(userData?.image) },
        "Data fetched successfully",
      );
    }
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const blockUser = async (req: Request, res: Response) => {
  try {
    const { status = "BLOCKED", userId } = req.query;

    if (status !== "BLOCKED" && status !== "ACTIVE") {
      throw new Error("Invalid status");
    }

    const checkUser = await UserModel.findOne({
      _id: userId,
      status: { $ne: status },
    });

    if (!checkUser) {
      throw new Error(`Status is already ${status} or user does not exist`);
    }

    await UserModel.findByIdAndUpdate(userId, { $set: { status } });

    return OK(res, {}, "Users updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const userExamResult = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;

    const checkData = await MockExamResultModel.findById(id);

    return OK(res, checkData, "Data fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const exportUsersCSV = async (req: Request, res: Response) => {
  try {
    const { type = "ALL", search } = req.query;

    let query: any = {
      role: "USER",
    };

    if (type !== "ALL") {
      query.status = type;
    }

    // 🔍 Search filter
    if (search && (search as string).trim() !== "") {
      query.$or = [
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    // ❗ Fetch ALL data (no pagination)
    const users = await UserModel.find(query).sort({ createdAt: -1 }).lean();

    if (!users.length) {
      return BADREQUEST(res, "No users found");
    }

    // ✅ Fields you want in CSV
    const fields = [
      { label: "First Name", value: "firstname" },
      { label: "Last Name", value: "lastname" },
      { label: "Full Name", value: "fullName" },
      { label: "Email", value: "email" },
      { label: "Phone", value: "phoneNumber" },
      { label: "Status", value: "status" },
      {
        label: "Channel",
        value: (row: any) =>
          row.deviceType || row.fcmToken?.[0]?.deviceType || "",
      },
      {
        label: "Start Date",
        value: (row: any) =>
          row.createdAt ? new Date(row.createdAt).toLocaleString() : "",
      },
      {
        label: "End Date",
        value: (row: any) =>
          row.deletedAt ? new Date(row.deletedAt).toLocaleString() : "",
      },
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(users);

    // ✅ Set headers for download
    res.header("Content-Type", "text/csv");
    res.attachment(`users-${Date.now()}.csv`);

    return res.send(csv);
  } catch (err: any) {
    console.error(err);
    return INTERNAL_SERVER_ERROR(res, "Failed to export users");
  }
};

export const importUser = async (req: Request, res: Response) => {
  try {
    if (!req?.files?.length) {
      return BADREQUEST(res, "CSV file is required");
    }

    const fileData = (req as any)?.files[0];

    const users: any[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from(fileData.buffer as any)
        .pipe(csvParser())
        .on("data", (row) => users.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    if (!users.length) {
      return BADREQUEST(res, "CSV is empty");
    }

    const bulkData = [];

    for (const row of users) {
      console.log("row: ", row);
      if (!row.email || !row.password) {
        continue;
      }

      const alreadyExist = await UserModel.findOne({
        email: row.email.toLowerCase(),
      });

      if (alreadyExist) {
        continue;
      }

      const hashedPassword = await bcrypt.hash(row.password, 10);

      bulkData.push({
        firstname: row.firstname?.trim(),
        lastname: row.lastname?.trim(),
        fullName: row.fullName?.trim() || `${row.firstname} ${row.lastname}`,
        email: row.email.toLowerCase(),
        countryCode: row.countryCode,
        emailVerified: true,
        phoneNumber: row.phoneNumber,
        password: hashedPassword,
        deviceType: row.channel.trim(),
        status: row.status || "ACTIVE",
        role: "USER",
        deletedAt: row.status === "DELETED" ? new Date() : null,
      });
    }

    console.log("bulkData: ", bulkData);
    if (bulkData.length) {
      await UserModel.insertMany(bulkData);
    }

    return OK(
      res,
      {
        imported: bulkData.length,
        skipped: users.length - bulkData.length,
      },
      "Users imported successfully",
    );
  } catch (err: any) {
    console.error(err);
    return INTERNAL_SERVER_ERROR(res, "Failed to export users");
  }
};

export const downloadSample = async (req: Request, res: Response) => {
  try {
    const headers = [
      "firstname",
      "lastname",
      "email",
      "countryCode",
      "phoneNumber",
      "password",
      "channel",
      "status",
    ];

    const rows = [
      [
        "John",
        "Doe",
        "john@yopmail.com",
        "+1",
        "9876543210",
        "Password@123",
        "IOS",
        "ACTIVE",
      ],
      [
        "Jane",
        "Smith",
        "jane@yopmail.com",
        "+91",
        "9876543211",
        "Password@123",
        "ANDROID",
        "DELETED",
      ],
      [
        "Mansi",
        "Bhandari",
        "bhandari@yopmail.com.com",
        "+91",
        "9876543211",
        "Password@123",
        "WEB",
        "BLOCKED",
      ],
    ];

    const escapeCSV = (value: any) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv =
      headers.map(escapeCSV).join(",") +
      "\n" +
      rows.map((row) => row.map(escapeCSV).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=User_Sample.csv",
    );

    return res.send(csv);
  } catch (err: any) {
    console.error(err);
    return INTERNAL_SERVER_ERROR(res, "Failed to export users");
  }
};

export const saveRating = async (req: Request, res: Response) => {
  try {
    const { courseId, company, title, feedback, stars, source } = req.body;

    const checkCourseId = await CheckCourseExistUser(courseId as string);

    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    const { _id, fullName } = (req as any).user;

    if (![1, 2, 3, 4, 5].includes(Number(stars))) {
      throw new Error("Invalid Rating");
    }

    // ✅ Update if already exists, otherwise create new
    await RatingModel.findOneAndUpdate(
      {
        courseId,
        userId: _id,
      },
      {
        $set: {
          userName: fullName,
          company,
          title,
          source,
          feedback,
          stars,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    return OK(res, {}, "Rating saved successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const addAccess = async (req: Request, res: Response) => {
  try {
    let {
      courseId,
      type,
      purchasedProduct,
      startDate,
      endDate,
      userId,
      timeZone,
      planId,
    } = req.body;

    if (
      !courseId ||
      !type ||
      !purchasedProduct ||
      !startDate ||
      !endDate ||
      !userId ||
      !timeZone ||
      ![
        "LESSONS",
        "DOMAIN_TASK",
        "PRACTICE_TEST",
        "MOCK_EXAM",
        "EXAM_STRATEGY",
        "APPLICATION_SUPPORT",
        "FLASH_CARDS",
        "COURSE",
      ].includes(type)
    ) {
      throw new Error("All fields are mandatory");
    }
    purchasedProduct = Array.isArray(purchasedProduct)
      ? purchasedProduct
      : [purchasedProduct];
    planId = Array.isArray(planId) ? planId : [planId];
    const checkCourseId = await CheckCourseExistUser(courseId as string);

    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    const findObject: any = {
      COURSE: PlanModel.find({
        _id: planId,
        status: "ACTIVE",
      }).select("_id stripePrice"),

      LESSONS: LessonModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id module price"),

      DOMAIN_TASK: DomainModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id domain price"),

      PRACTICE_TEST: PracticeExamModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id price name"),

      MOCK_EXAM: MockExamModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id name price"),

      EXAM_STRATEGY: ExamStrategyModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id name price"),

      APPLICATION_SUPPORT: ApplicationSupportModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id name price"),

      FLASH_CARDS: FlashCardCategoryModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id categoryName price"),
    };

    const startUTC = DateTime.fromFormat(startDate, "yyyy-MM-dd", {
      zone: timeZone,
    })
      .startOf("day")
      .toUTC();

    const endUTC = DateTime.fromFormat(endDate, "yyyy-MM-dd", {
      zone: timeZone,
    })
      .endOf("day")
      .toUTC();

    if (type === "COURSE" && planId) {
      for (purchasedProduct of purchasedProduct) {
        // const data = await findObject[type];
        const data = PlanModel.findOne({
          _id: purchasedProduct,
          status: "ACTIVE",
        })
          .select("_id stripePrice")
          .lean() as any;
        if (!data) {
          throw new Error("Invalid plan id");
        }
        await PurchaseModel.create({
          userId,
          type: "SUBSCRIPTION",
          planId: purchasedProduct,
          purchasedProduct,
          purchaseType: type,
          purchaseDate: startUTC,
          transactionId: "MANUAL",
          paymentIntentId: "MANUAL",
          endDate: endUTC,
          purchaseAmount: data?.stripePrice || 0,
          currency: "usd",
          mode: "MANUAL",
          status: "SUCCESS",
        });
      }
    } else if ((planId != undefined || planId != null) && type) {
      const data = await findObject[type];
      for (purchasedProduct of purchasedProduct) {
        await PurchaseModel.create({
          userId,
          type: "INDIVIDUAL",
          purchasedProduct: purchasedProduct,
          purchaseType: type,
          purchaseDate: startUTC,
          transactionId: "MANUAL",
          paymentIntentId: "MANUAL",
          endDate: endUTC,
          purchaseAmount: data?.price,
          currency: "usd",
          mode: "MANUAL",
          status: "SUCCESS",
        });
      }
    } else {
      throw new Error("Invalid type");
    }

    return OK(res, {}, "Access saved successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const getAccessDropdown = async (req: Request, res: Response) => {
  try {
    const types = [
      "LESSONS",
      "DOMAIN_TASK",
      "PRACTICE_TEST",
      "MOCK_EXAM",
      "EXAM_STRATEGY",
      "APPLICATION_SUPPORT",
      "FLASH_CARDS",
      "COURSE",
    ];

    const { courseId, type = null } = req.query;

    const plans =
      type === "COURSE"
        ? await PlanModel.find({
            type: process.env.MODE,
            status: "ACTIVE",
            courseId,
          })
        : null;

    const findObject: any = {
      LESSONS: LessonModel.find({
        courseId,
        status: "ACTIVE",
      })
        .select("_id module price")
        .lean()
        .then((data) =>
          data.map((item: any) => ({
            _id: item._id,
            name: item.module,
            price: item.price,
          })),
        ),

      DOMAIN_TASK: DomainModel.find({
        courseId,
        status: "ACTIVE",
      })
        .select("_id domain price")
        .lean()
        .then((data) =>
          data.map((item: any) => ({
            _id: item._id,
            name: item.domain,
            price: item.price,
          })),
        ),

      PRACTICE_TEST: PracticeExamModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id price name"),

      MOCK_EXAM: MockExamModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id name price"),

      EXAM_STRATEGY: ExamStrategyModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id name price"),

      APPLICATION_SUPPORT: ApplicationSupportModel.find({
        courseId,
        status: "ACTIVE",
      }).select("_id name price"),

      FLASH_CARDS: FlashCardCategoryModel.find({
        courseId,
        status: "ACTIVE",
      })
        .select("_id categoryName price")
        .lean()
        .then((data) =>
          data.map((item: any) => ({
            _id: item._id,
            name: item.categoryName,
            price: item.price,
          })),
        ),

      // ✅ FIXED
      COURSE: CourseModel.find({
        _id: courseId,
        status: "ACTIVE",
      }).select("_id name price"),
    };

    // ✅ return only types initially
    if (!type) {
      return OK(
        res,
        {
          types,
          data: [],
        },
        "Fetched successfully",
      );
    }

    const selectedType = type as string;

    // ✅ validate type
    if (!types.includes(selectedType)) {
      throw new Error("Invalid type");
    }

    const data = await findObject[selectedType];

    return OK(
      res,
      {
        plans,
        types,
        data,
      },
      "Fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateAccess = async (req: Request, res: Response) => {
  try {
    const { endDate, id, timeZone } = req.body;

    const checkEntries = await PurchaseModel.findById(id);

    if (!checkEntries) {
      throw new Error("Purchase not found.");
    }

    const endUTC = DateTime.fromFormat(endDate, "yyyy-MM-dd", {
      zone: timeZone,
    })
      .endOf("day")
      .toUTC();

    await PurchaseModel.findByIdAndUpdate(id, {
      endDate: endUTC,
    });

    return OK(res, {}, "Updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteAccess = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;

    const checkEntries = await PurchaseModel.findById(id);

    if (!checkEntries || checkEntries.mode !== "MANUAL") {
      throw new Error("This cannot be deleted");
    }

    await PurchaseModel.findByIdAndUpdate(id, {
      $set: { status: "CANCELLED", endDate: new Date() },
    });

    return OK(res, {}, "Deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getNotificationsUser = async (req: Request, res: Response) => {
  try {
    let { page = 1, limit = 10, courseId, search, type } = req.query;
    const { _id, fullName } = (req as any).user;
    const checkCourseId = await CheckCourseExistUser(courseId as string);
    if (typeof checkCourseId === "string") {
      throw new Error("Invalid course id");
    }

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    // ✅ Build dynamic filter
    const filter: any = {
      // courseId,
      isSent: true,
    };

    // ✅ Add search condition
    if (search && typeof search === "string") {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const [data, totalCount] = await Promise.all([
      NotificationModel.find({ ...filter, type })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(), // optional but recommended
      NotificationModel.countDocuments({ ...filter, type }),
    ]);

    const finalData = data.map((item) => {
      if (item.isRead?.includes(_id.toString())) {
        return { ...item, isRead: true };
      }
      return { ...item, isRead: false };
    });

    const totalPages = Math.ceil(totalCount / limit);

    return OK(
      res,
      {
        data: finalData,
        pagination: {
          totalCount,
          totalPages,
          page,
          limit,
          next: page < totalPages,
          previous: page > 1,
        },
      },
      "Data Fetched",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const putNotificationsUser = async (req: Request, res: Response) => {
  try {
    const { id, courseId } = req.query;
    const { _id, fullName } = (req as any).user;
    if (!id || !courseId) {
      throw new Error("Required fields are missing");
    }

    const data = await NotificationModel.findOneAndUpdate(
      {
        _id: id,
        courseId: courseId,
      },
      { $addToSet: { isRead: _id.toString() } },
      { new: true },
    );

    return OK(res, { data }, "Updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
