import cron, { type ScheduledTask } from "node-cron";
import { PurchaseModel } from "../models/purchase-schema.js";
import {
  sendPlanEndedEmail,
  sendPurchaseExpiryReminderEmail,
} from "../utils/mail-helper.js";
import { NotificationModel } from "../models/notification-schema.js";
import { NotificationService } from "../config/fcm.js";
import mongoose from "mongoose";
import { UserModel } from "../models/user-schema.js";
import { LessonModel } from "../models/lessons-schema.js";
import { DomainModel } from "../models/domains-schema.js";
import { ApplicationSupportModel } from "../models/application-support-schema.js";
import { ExamStrategyModel } from "../models/exam-strategy-schema.js";
import { PracticeExamModel } from "../models/practice-exam-schema.js";
import { MockExamModel } from "../models/mock-exam-schema.js";
import { FlashCardCategoryModel } from "../models/flash-card-category-schema.js";

let isReminderCronRunning = false;
let isNotificationCronRunning = false;
let isNotificationGarbageCollectionRunning = false;

// Individual purchases have no planId; resolve the item name from purchasedProduct instead.
const individualProductLookup: Record<string, { model: any; nameField: string }> = {
  LESSONS: { model: LessonModel, nameField: "module" },
  DOMAIN_TASK: { model: DomainModel, nameField: "domain" },
  PRACTICE_TEST: { model: PracticeExamModel, nameField: "name" },
  MOCK_EXAM: { model: MockExamModel, nameField: "name" },
  EXAM_STRATEGY: { model: ExamStrategyModel, nameField: "name" },
  APPLICATION_SUPPORT: { model: ApplicationSupportModel, nameField: "name" },
  FLASH_CARDS: { model: FlashCardCategoryModel, nameField: "categoryName" },
};

const getPurchaseDisplayName = async (purchase: any): Promise<string> => {
  const planData = purchase?.planId;
  const planLabel = [planData?.courseName, planData?.planName]
    .filter(Boolean)
    .join(" - ");
  if (planLabel) return `the course ${planLabel}`;

  const lookup = individualProductLookup[purchase?.purchaseType];
  const productId = purchase?.purchasedProduct;
  if (lookup && productId && mongoose.Types.ObjectId.isValid(String(productId))) {
    try {
      const product = await lookup.model
        .findById(productId)
        .select(lookup.nameField)
        .lean();
      const productName = product?.[lookup.nameField];
      if (typeof productName === "string" && productName.trim()) {
        return productName.trim();
      }
    } catch (err) {
      console.error("Failed to resolve purchased product name", err);
    }
  }

  return purchase?.type === "FREE_TRIAL"
    ? "your free trial"
    : "your subscription plan";
};

const sendReminderEmail = async (): Promise<void> => {
  try {
    const now = new Date();

    const reminderStart = new Date(now);
    reminderStart.setDate(reminderStart.getDate() + 2);
    reminderStart.setHours(0, 0, 0, 0);

    const reminderEnd = new Date(reminderStart);
    reminderEnd.setDate(reminderEnd.getDate() + 1);

    const purchaseDetails = await PurchaseModel.find({
      status: "SUCCESS",
      endDate: { $gte: reminderStart, $lt: reminderEnd },
    })
      .sort({ purchaseAmount: -1 })
      .populate("userId", "fullName email")
      .populate("planId", "planName courseName");

    for (const purchase of purchaseDetails) {
      const userData = purchase.userId as any;
      if (!userData?.email || !purchase.endDate) continue;
      const purchaseType =
        (purchase.type as "FREE_TRIAL" | "SUBSCRIPTION" | string) ||
        "SUBSCRIPTION";
      const subscriptionName = await getPurchaseDisplayName(purchase);

      await sendPurchaseExpiryReminderEmail({
        email: userData.email,
        name: userData.fullName,
        type: purchaseType,
        endDate: purchase.endDate,
        subscriptionName,
      });
    }
  } catch (err) {
    console.error("Reminder cron error", err);
  }
};

export const updateExpiredPurchaseStatus = async (): Promise<void> => {
  try {
    const now = new Date();
    const expiredPurchases = await PurchaseModel.find({
      type: { $in: ["FREE_TRIAL", "SUBSCRIPTION"] },
      status: "SUCCESS",
      endDate: { $lt: now },
    })
      .sort({ purchaseAmount: -1 })
      .populate("userId", "fullName email")
      .populate("planId", "planName courseName")
      .lean();

    for (const purchase of expiredPurchases as any[]) {
      const userData = purchase?.userId;
      if (!userData?.email) continue;

      const planName = await getPurchaseDisplayName(purchase);

      await sendPlanEndedEmail({
        email: userData.email,
        fullName: userData.fullName,
        subscriptionName: planName,
      });
    }

    if (expiredPurchases.length > 0) {
      await PurchaseModel.updateMany(
        { _id: { $in: expiredPurchases.map((item: any) => item._id) } },
        { $set: { status: "EXPIRED" } },
      );
    }
  } catch (err) {
    console.error("Expiry update cron error", err);
  }
};

// ---------- TEMP TEST: remove after verifying the reminder email ----------
// Sends ONE "Your Access Plan is Ending Soon" email per minute, only to the test
// user, alternating between their subscription and an individual purchase.
// const REMINDER_TEST_EMAIL = "vtest292@gmail.com";
// let reminderTestRun = 0;

// const sendReminderEmailTest = async (): Promise<void> => {
//   try {
//     const user: any = await UserModel.findOne({ email: REMINDER_TEST_EMAIL })
//       .select("fullName email")
//       .lean();
//     if (!user) {
//       console.warn(`[reminder-test] user ${REMINDER_TEST_EMAIL} not found`);
//       return;
//     }

//     const purchaseKind = reminderTestRun++ % 2 === 0 ? "SUBSCRIPTION" : "INDIVIDUAL";
//     const purchase: any = await PurchaseModel.findOne({
//       userId: user._id,
//       status: "SUCCESS",
//       type: purchaseKind,
//       endDate: { $gte: new Date() },
//     })
//       .sort({ endDate: 1 })
//       .populate("planId", "planName courseName")
//       .lean();
//     if (!purchase) {
//       console.warn(`[reminder-test] no active ${purchaseKind} purchase for test user`);
//       return;
//     }

//     const subscriptionName = await getPurchaseDisplayName(purchase);
//     await sendPurchaseExpiryReminderEmail({
//       email: user.email,
//       name: user.fullName,
//       type: purchase.type,
//       endDate: purchase.endDate,
//       subscriptionName,
//     });
//     console.log(
//       `[reminder-test] sent to ${user.email} (${purchaseKind}/${purchase.purchaseType}): "${subscriptionName}"`,
//     );
//   } catch (err) {
//     console.error("[reminder-test] error", err);
//   }
// };

// export const reminderEmailTestCron = (): ScheduledTask =>
//   cron.schedule("* * * * *", sendReminderEmailTest);
// ---------- END TEMP TEST ----------

export const startReminderAndUpdateCronJob = (): ScheduledTask => {
  const cronExpression = "0 0 * * *";
  let task: ScheduledTask;

  try {
    task = cron.schedule(
      cronExpression,
      async () => {
        if (isReminderCronRunning) {
          console.warn("Reminder cron skipped: previous run still in progress");
          return;
        }
        isReminderCronRunning = true;
        try {
          await sendReminderEmail();
          await updateExpiredPurchaseStatus();
        } finally {
          isReminderCronRunning = false;
        }
      },
      // { timezone: "Asia/Kolkata" },
    );
  } catch (error) {
    console.warn(
      "Failed to schedule with timezone. Falling back to server timezone.",
      error,
    );
    task = cron.schedule(cronExpression, async () => {
      if (isReminderCronRunning) {
        console.warn("Reminder cron skipped: previous run still in progress");
        return;
      }
      isReminderCronRunning = true;
      try {
        await sendReminderEmail();
        await updateExpiredPurchaseStatus();
      } finally {
        isReminderCronRunning = false;
      }
    });
  }

  return task;
};

export const updateExpiredSubscriptions = (): ScheduledTask => {
  const cronExpression = "*/30 * * * *";
  let task: ScheduledTask;

  try {
    task = cron.schedule(
      cronExpression,
      async () => {
        if (isReminderCronRunning) {
          console.warn("Reminder cron skipped: previous run still in progress");
          return;
        }
        isReminderCronRunning = true;
        try {
          // await sendReminderEmail();
          await updateExpiredPurchaseStatus();
        } finally {
          isReminderCronRunning = false;
        }
      },
      // { timezone: "Asia/Kolkata" },
    );
  } catch (error) {
    console.warn(
      "Failed to schedule with timezone. Falling back to server timezone.",
      error,
    );
    task = cron.schedule(cronExpression, async () => {
      if (isReminderCronRunning) {
        console.warn("Reminder cron skipped: previous run still in progress");
        return;
      }
      isReminderCronRunning = true;
      try {
        await sendReminderEmail();
        await updateExpiredPurchaseStatus();
      } finally {
        isReminderCronRunning = false;
      }
    });
  }

  return task;
};

const sendNotification = async (): Promise<void> => {
  try {
    const nowUtc = new Date();
    const tenMinutesAgoUtc = new Date(nowUtc.getTime() - 10 * 60 * 1000);

    const notificationData = await NotificationModel.find({
      isSent: false,
      sentOn: { $gte: tenMinutesAgoUtc, $lte: nowUtc },
    }).lean();

    if (notificationData.length === 0) {
      console.log("No pending notifications in last 10 minutes window (UTC)");
      return;
    }

    for (const notification of notificationData as any[]) {
      const notificationCourseId = notification?.courseId?.toString?.();
      if (!notificationCourseId) {
        console.warn(
          `Notification ${notification?._id} skipped: missing courseId`,
        );
        continue;
      }

      const purchaseProductFilter = mongoose.Types.ObjectId.isValid(
        notificationCourseId,
      )
        ? {
            $in: [
              notificationCourseId,
              new mongoose.Types.ObjectId(notificationCourseId),
            ],
          }
        : notificationCourseId;

      const purchases = await PurchaseModel.find({
        status: "SUCCESS",
        purchasedProduct: purchaseProductFilter,
      })
        .sort({ purchaseAmount: -1 })
        .populate("userId")
        .lean();

      console.log(
        `Notification ${notification._id} matched ${purchases.length} purchases for course ${notificationCourseId}`,
      );

      if (purchases.length > 0) {
        const pushResult = await NotificationService(
          purchases as any[],
          notification.title as string,
          notification.description as string,
          notification?.type as string,
        );

        if ((pushResult as any)?.success > 0) {
          await NotificationModel.updateOne(
            { _id: notification._id },
            { $set: { isSent: true } },
          );
        } else {
          console.log(
            `Notification ${notification._id} not marked sent because push success count is 0`,
          );
        }
      }
    }
  } catch (err) {
    console.error("Notification cron error", err);
  }
};
const removeNotification = async (): Promise<void> => {
  try {
    const nowUtc = new Date();
    const thirtyDaysAgoUtc = new Date(nowUtc);
    thirtyDaysAgoUtc.setUTCDate(thirtyDaysAgoUtc.getUTCDate() - 30);

    const notificationData = await NotificationModel.deleteMany({
      sentOn: { $lte: thirtyDaysAgoUtc},
    }).lean();

    if (notificationData.deletedCount === 0) {
      console.log("No pending notifications in last 30 days window (UTC)");
      return;
    }
    console.log(`Deleted ${notificationData.deletedCount} notifications`);
  } catch (err) {
    console.error("Notification cron error", err);
  }
};

export const notificationAnnouncementCron = (): ScheduledTask => {
  // Run every 2 minutes.
  const cronExpression = "02 */1 * * *";
  // const cronExpression = "*/1 * * * *";
  let task: ScheduledTask;

  try {
    task = cron.schedule(
      cronExpression,
      async () => {
        if (isNotificationCronRunning) {
          console.warn(
            "Notification cron skipped: previous run still in progress",
          );
          return;
        }
        isNotificationCronRunning = true;
        try {
          await sendNotification();
        } finally {
          isNotificationCronRunning = false;
        }
      },
      // { timezone: "UTC" },
    );
  } catch (error) {
    console.warn(
      "Failed to schedule with timezone. Falling back to server timezone.",
      error,
    );
    task = {} as any;
  }

  return task;
};
export const notificationGarbageCollectionCron = (): ScheduledTask => {
  // Run every 2 minutes.
  const cronExpression = "0 0 * * *";
  // const cronExpression = "*/1 * * * *";
  let task: ScheduledTask;

  try {
    task = cron.schedule(
      cronExpression,
      async () => {
        if (isNotificationGarbageCollectionRunning) {
          console.warn(
            "Notification garbage collection cron skipped: previous run still in progress",
          );
          return;
        }
        isNotificationGarbageCollectionRunning = true;
        try {
          await removeNotification();
        } finally {
          isNotificationGarbageCollectionRunning = false;
        }
      },
    );
  } catch (error) {
    console.warn(
      "Failed to schedule with timezone. Falling back to server timezone.",
      error,
    );
    task = {} as any;
  }

  return task;
};

export const stopReminderCronJob = (task: ScheduledTask): void => {
  task.stop();
  console.log("Reminder cron stopped");
};
