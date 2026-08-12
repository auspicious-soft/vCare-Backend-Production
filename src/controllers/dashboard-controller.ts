import type { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import {
  cached7daysOldUsers,
  cachedNewSubscriptionLast7Days,
  cachedPlanDuration,
  cachedTotalExams,
  cachedTotalModules,
  cachedTotalUsers,
  getTodayActiveUsers,
} from "../utils/helpers.js";
import { ProgressModel } from "../models/progress-schema.js";
import { MockExamResultModel } from "../models/mock-exam-result-schema.js";
import { UserDashboardModel } from "../models/user-dashboard-schema.js";
import { PurchaseModel } from "../models/purchase-schema.js";
import { getFileUrl } from "../helpers/index.js";

export const dashboard = async (req: Request, res: Response) => {
  try {
    /* -------------------------------------------------- */
    /* ✅ BASIC STATS */
    /* -------------------------------------------------- */
    const { days = 15 } = req.query;
    const [
      totalUsers,
      users7DaysOld,
      todayActiveUsers,
      totalModules,
      newSubscriptionLast7Days,
      totalExams,
      planDuration,
    ] = await Promise.all([
      cachedTotalUsers(),
      cached7daysOldUsers(),
      getTodayActiveUsers(),
      cachedTotalModules(),
      cachedNewSubscriptionLast7Days(),
      cachedTotalExams(),
      cachedPlanDuration(),
    ]);

    /* -------------------------------------------------- */
    /* ✅ EXAM PIPELINE (LAST 10) */
    /* -------------------------------------------------- */
    const examDataPipeline: any = [
      { $match: { status: "ACTIVE" } },
      { $sort: { updatedAt: -1 } },
      { $limit: 10 },

      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      {
        $lookup: {
          from: "mockexams",
          localField: "mockExamId",
          foreignField: "_id",
          as: "exam",
        },
      },
      { $unwind: "$exam" },

      {
        $lookup: {
          from: "courses",
          localField: "exam.courseId",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: "$course" },

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
                  $ifNull: ["$question.domainName", "Unknown"],
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

      {
        $project: {
          _id: 1,
          attemptNumber: 1,
          createdAt: 1,
          updatedAt: 1,
          currentStatus: 1,
          correct: 1,
          incorrect: 1,
          unanswered: 1,
          remarks: 1,
          overallPercentage: 1,
          timeTaken: 1,
          course: "$course.name",
          userName: "$user.fullName",
          examName: "$exam.name",
          domainSummary: 1,
        },
      },
    ];

    /* -------------------------------------------------- */
    /* ✅ FETCH DATA */
    /* -------------------------------------------------- */
    const [progressData, examData, dashboardData, last10examUpdates] =
      await Promise.all([
        ProgressModel.find({})
          .sort({ updatedAt: -1 })
          .limit(15)
          .populate("moduleId")
          .populate("domainId")
          .populate("userId", "fullName image")
          .lean(),

        MockExamResultModel.find({ status: "ACTIVE" })
          .sort({ updatedAt: -1 })
          .limit(15)
          .populate({
            path: "mockExamId",
            populate: { path: "courseId", select: "name" },
          })
          .populate("userId", "fullName image")
          .lean(),

        UserDashboardModel.find({})
          .sort({ updatedAt: -1 })
          .limit(15)
          .populate("courseId", "name")
          .populate("questionOfTheDay")
          .populate("userId", "fullName image")
          .lean(),

        MockExamResultModel.aggregate(examDataPipeline),
      ]);

    /* -------------------------------------------------- */
    /* ✅ ACTIVITY FEED */
    /* -------------------------------------------------- */
    const activities: any[] = [];

    progressData.forEach((item: any) => {
      if (item.moduleId) {
        activities.push({
          type: "MODULE_PROGRESS",
          userName: item.userId?.fullName,
          image: getFileUrl(item.userId?.image),
          message: `${item.userId?.fullName} completed ${item.percentage}% of module "${item.moduleId.module}"`,
          updatedAt: item.updatedAt,
        });
      }

      if (item.domainId) {
        activities.push({
          type: "DOMAIN_PROGRESS",
          userName: item.userId?.fullName,
          image: getFileUrl(item.userId?.image),
          message: `${item.userId?.fullName} completed ${item.percentage}% of domain "${item.domainId.domain}"`,
          updatedAt: item.updatedAt,
        });
      }
    });

    examData.forEach((item: any) => {
      activities.push({
        type: "MOCK_EXAM",
        userName: item.userId?.fullName,
        image: getFileUrl(item.userId?.image),
        message: `${item.userId?.fullName} attempted "${item.mockExamId?.name}" and scored ${item.overallPercentage}%`,
        updatedAt: item.updatedAt,
      });
    });

    dashboardData.forEach((item: any) => {
      if (item.examScheduled && item.examScheduledAt) {
        activities.push({
          type: "EXAM_SCHEDULED",
          userName: item.userId?.fullName,
          image: getFileUrl(item.userId?.image),
          message: `${item.userId?.fullName} scheduled an exam`,
          updatedAt: item.updatedAt,
        });
      }

      if (item.isQuestionOfTheDayAttempted) {
        activities.push({
          type: "QUESTION_OF_DAY",
          userName: item.userId?.fullName,
          image: getFileUrl(item.userId?.image),
          message: `${item.userId?.fullName} attempted question of the day`,
          updatedAt: item.updatedAt,
        });
      }
    });

    activities.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    const recentUserActivities = activities.slice(0, 10);

    /* -------------------------------------------------- */
    /* ✅ ACTIVITY GRAPH (LAST 7 DAYS) */
    /* -------------------------------------------------- */

    const getDailyCounts = async (Model: any, match: any = {}) => {
      return Model.aggregate([
        {
          $match: {
            ...match,
            purchaseDate: {
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

    const [purchaseStats] = await Promise.all([
      getDailyCounts(PurchaseModel, {
        status: "SUCCESS",
        type: { $in: ["SUBSCRIPTION", "INDIVIDUAL"] },
      }),
    ]);
    const activityMap: Record<string, number> = {};

    const merge = (arr: any[]) => {
      arr.forEach((item) => {
        activityMap[item._id] = (activityMap[item._id] || 0) + item.count;
      });
    };

    merge(purchaseStats);

    console.log("activityMap: ", activityMap);
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

    return OK(
      res,
      {
        totalUsers,
        users7DaysOld,
        todayActiveUsers,
        totalModules,
        individualDuration: planDuration?.individualDuration,
        freeTrailDuration: planDuration?.freeTrailDuration,
        newSubscriptionLast7Days,
        totalExams,
        recentUserActivities,
        examData: last10examUpdates,
        activityGraph, // ✅ NEW GRAPH DATA
      },
      "Dashboard fetched successfully",
    );
  } catch (err: any) {
    console.error("dashboard error:", err);
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
