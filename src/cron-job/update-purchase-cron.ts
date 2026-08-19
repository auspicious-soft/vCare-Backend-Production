import cron, { type ScheduledTask } from "node-cron";
import { PurchaseModel } from "../models/purchase-schema.js";
import {
  sendPlanEndedEmail,
  sendPurchaseExpiryReminderEmail,
} from "../utils/mail-helper.js";
import { NotificationModel } from "../models/notification-schema.js";
import { NotificationService } from "../config/fcm.js";
import mongoose from "mongoose";

let isReminderCronRunning = false;
let isNotificationCronRunning = false;
let isNotificationGarbageCollectionRunning = false;
 
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
      const planData = purchase.planId as any;
      const subscriptionName =
        purchase?.type === "FREE_TRIAL"
          ? `the course ${planData?.courseName}-${planData?.planName}` ||
            "Free Trial"
          : `the course ${planData?.courseName}-${planData?.planName}` ||
            "your subscription plan";

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

      const planName =
        purchase?.type === "FREE_TRIAL"
          ? `the course ${purchase?.planId?.courseName}-${purchase?.planId?.planName}` ||
            "Free Trial"
          : `the course ${purchase?.planId?.courseName}-${purchase?.planId?.planName}` ||
            "your subscription plan";

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
