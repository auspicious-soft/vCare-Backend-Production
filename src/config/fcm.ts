import admin from "firebase-admin";
import { configDotenv } from "dotenv";
import mongoose, { Types } from "mongoose";
import { UserModel } from "../models/user-schema.js";

configDotenv();

/**
 * Initialize Firebase Admin SDK
 */
export const initializeFirebase = () => {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error("Missing Firebase service account credentials");
    }

    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Fix multiline private key issue
    serviceAccount.private_key = serviceAccount.private_key.replace(
      /\\n/g,
      "\n",
    );

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized");
    }
  } catch (error) {
    console.error("❌ Error initializing Firebase:", error);
    throw error;
  }
};

/**
 * Notification Service
 * @param userIds array of user ObjectIds
 * @param type notification type (key from notificationMessages)
 * @param language language code (default: 'en')
 * @param referenceId optional reference ids (bookingId, jobId, etc.)
 */

export const NotificationService = async (
  userData: any[],
  title: string,
  description: string,
  type?: string,
) => {
  try {
    console.log('type: ', type);
    if (!userData?.length) return [];

    const PUSH_BATCH_SIZE = 500;

    // ✅ Extract all valid FCM tokens
    const allTokens: string[] = [];

    userData.forEach((purchase: any) => {
      const fcmTokens = purchase?.userId?.fcmToken || [];

      fcmTokens.forEach((item: any) => {
        if (item?.token) {
          allTokens.push(item.token);
        }
      });
    });

    // ✅ Remove duplicate tokens
    const uniqueTokens = [...new Set(allTokens)];

    if (!uniqueTokens.length) {
      console.log("⚠️ No FCM tokens found");
      return [];
    }

    console.log(`📲 Sending push to ${uniqueTokens.length} devices`);

    // ✅ Chunk tokens into batches of 500
    const tokenBatches = [];

    for (let i = 0; i < uniqueTokens.length; i += PUSH_BATCH_SIZE) {
      tokenBatches.push(uniqueTokens.slice(i, i + PUSH_BATCH_SIZE));
    }

    let totalSuccess = 0;
    let totalFailure = 0;

    // ✅ Send batch-wise
    for (const batch of tokenBatches) {
      const messages = batch.map((token) => ({
        token,

        notification: {
          title,
          body: description,
        },

        android: {
          priority: "high" as const,
        },

        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },

        data: {
          type: type ?? "",
          title,
          body: description,
          click_action: type==="ANNOUNCEMENT" ? "announcements" : "notifications",
        },
      }));

      try {
        const response = await admin.messaging().sendEach(messages);

        const successCount = response.responses.filter((r) => r.success).length;

        const failureCount = response.responses.filter(
          (r) => !r.success,
        ).length;

        totalSuccess += successCount;
        totalFailure += failureCount;

        // ✅ Remove invalid tokens
        const invalidTokens: string[] = [];

        response.responses.forEach((resp, index) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;

            if (
              errorCode === "messaging/registration-token-not-registered" ||
              errorCode === "messaging/invalid-registration-token"
            ) {
              invalidTokens.push(batch[index] as any);
            }
          }
        });

        if (invalidTokens.length) {
          console.log(`🗑 Removing ${invalidTokens.length} invalid tokens`);

          // Optional: remove invalid tokens from DB
          await UserModel.updateMany(
            {},
            {
              $pull: {
                fcmToken: {
                  token: { $in: invalidTokens },
                },
              },
            },
          );
        }
      } catch (err) {
        console.error("❌ Batch push error:", err);
      }
    }

    return {
      success: totalSuccess,
      failed: totalFailure,
    };
  } catch (err) {
    console.error("❌ NotificationService error:", err);
    throw err;
  }
};
