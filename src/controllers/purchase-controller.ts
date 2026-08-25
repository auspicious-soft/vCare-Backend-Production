import type { Request, Response } from "express";
import {
  BADREQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  OK,
  UNAUTHORIZED,
} from "../utils/responses.js";
import { PlanModel, type IPlans } from "../models/plans-schema.js";
import { MockExamModel } from "../models/mock-exam-schema.js";
import { PracticeExamModel } from "../models/practice-exam-schema.js";
import stripe from "../config/stripe.js";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import { UserModel } from "../models/user-schema.js";
import { getEndDateFromMonths } from "../utils/helpers.js";
import { google } from "googleapis";
import { decodeSignedPayload } from "../helpers/plans-helpers.js";
import { LessonModel } from "../models/lessons-schema.js";
import { DomainModel } from "../models/domains-schema.js";
import { ApplicationSupportModel } from "../models/application-support-schema.js";
import { FlashCardModel } from "../models/flash-card-schema.js";
import mongoose from "mongoose";
import { Parser } from "json2csv";
import { PurchaseModel } from "../models/purchase-schema.js";
import { FlashCardCategoryModel } from "../models/flash-card-category-schema.js";
import { ExamStrategyModel } from "../models/exam-strategy-schema.js";
import { CourseModel } from "../models/course-schema.js";
import redis from "../config/redis.js";
import { CompanyInfoModel } from "../models/company-info-schema.js";
import { sendPaymentFailedEmail } from "../utils/mail-helper.js";

export const getPlanData = async (req: Request, res: Response) => {
  try {
    const [practiceTests, mockExams] = await Promise.all([
      MockExamModel.find({ status: "ACTIVE" })
        .select("_id name")
        .sort({ order: 1 }),
      PracticeExamModel.find({ status: "ACTIVE" })
        .select("_id name")
        .sort({ order: 1 }),
    ]);
    return OK(res, { practiceTests, mockExams }, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const createCheckoutSessionService = async (req: any, res: Response) => {
  try {
    const { planId, purchasedProduct, purchaseType, success_url, cancel_url } =
      req.body;
    const userDetails = (req as any).user;
    const userId = userDetails?._id.toString();
    const email = userDetails?.email;
    const name = userDetails?.name;
    if (!userId) {
      return BADREQUEST(res, "User ID is required");
    }

    const checkPlan = await PlanModel.findById(planId).lean();
    const duration = await CompanyInfoModel.findOne().lean();
    if (checkPlan && checkPlan?.level === 0) {
      const checkIfExist = await PurchaseModel.findOne({
        purchasedProduct: {
          $in: [
            checkPlan?.courseId,
            new mongoose.Types.ObjectId(checkPlan?.courseId),
          ],
        },
        userId,
        planId,
        type: "FREE_TRIAL",
      });

      if (checkIfExist) {
        throw new Error(`You already have a Free Trial for this course.`);
      }

      const now = new Date();
      let endDate: Date | null = null;

      endDate = new Date(now);
      endDate.setDate(endDate.getDate() + Number(duration?.freeTrailDuration)); // +7 days //mansi

      await PurchaseModel.create({
        userId,
        planId,
        type: "FREE_TRIAL",
        purchaseType,
        endDate,
        purchaseAmount: 0,
        currency: null,
        mode: "STRIPE",
        status: "SUCCESS",
        purchasedProduct: checkPlan?.courseId,
      });

      return OK(res, {}, "Purchased Successfully");
    } else if (
      (checkPlan && checkPlan?.level > 0 && purchaseType === "COURSE") ||
      (purchasedProduct &&
        [
          "LESSONS",
          "PRACTICE_TEST",
          "MOCK_EXAM",
          "DOMAIN_TASK",
          "APPLICATION_SUPPORT",
          "FLASH_CARDS",
          "EXAM_STRATEGY",
        ].includes(purchaseType))
    ) {
      let planDetails;
      let endDate;
      let finalAmount = 0;
      let productName: string | undefined;

      if (checkPlan && purchaseType === "COURSE") {
        endDate = getEndDateFromMonths(checkPlan?.durationInMonths);
      }
      let productDetails = null;
      if (purchaseType !== "COURSE") {
        const individualModelMap: Record<string, any> = {
          LESSONS: LessonModel,
          PRACTICE_TEST: PracticeExamModel,
          MOCK_EXAM: MockExamModel,
          DOMAIN_TASK: DomainModel,
          APPLICATION_SUPPORT: ApplicationSupportModel,
          FLASH_CARDS: FlashCardCategoryModel,
          EXAM_STRATEGY: ExamStrategyModel,
        };
        const individualMap: Record<string, any> = {
          LESSONS: "Lesson",
          PRACTICE_TEST: "Practice Exam",
          MOCK_EXAM: "Mock Exam",
          DOMAIN_TASK: "Domain Task",
          APPLICATION_SUPPORT: "Application Support",
          FLASH_CARDS: "FlashCard",
          EXAM_STRATEGY: "Exam Strategy",
        };

        const model = individualModelMap[purchaseType];
        productName = individualMap[purchaseType];
        if (!model) {
          return BADREQUEST(res, "Invalid purchaseType for INDIVIDUAL");
        }

        productDetails = await model
          .findById(purchasedProduct)
          .populate("courseId")
          .select("price module name domain categoryName");

        if (!productDetails) {
          return NOT_FOUND(res, "Product not found");
        }

        finalAmount = Number(productDetails?.price);
        if (finalAmount <= 0) {
          return BADREQUEST(res, "Invalid product price");
        }

        endDate = getEndDateFromMonths(
          Number(duration?.individualDuration) || 0,
        ); //mansi
      }

      const user = await UserModel.findById(userId);
      if (!user) return NOT_FOUND(res, "User not found");

      let customer;

      // ✅ Create or reuse Stripe customer
      if (!user.stripeCustomerId) {
        customer = await stripe.customers.create({
          email,
          name,
          metadata: { userId },
        });

        await UserModel.findByIdAndUpdate(userId, {
          stripeCustomerId: customer.id,
        });
      } else {
        customer = await stripe.customers.retrieve(user.stripeCustomerId);
      }

      // 🔐 Build line item safely
      let lineItem;
      const productDisplayName =
        purchaseType === "LESSONS"
          ? productDetails?.module
          : purchaseType === "PRACTICE_TEST" || purchaseType === "MOCK_EXAM"
            ? productDetails?.name
            : purchaseType === "DOMAIN_TASK"
              ? productDetails?.domain
              : purchaseType === "APPLICATION_SUPPORT" ||
                  purchaseType === "EXAM_STRATEGY"
                ? productDetails?.name
                : purchaseType === "FLASH_CARDS"
                  ? productDetails?.categoryName
                  : undefined;

      if (checkPlan && purchaseType === "COURSE") {
        // ✅ Fixed Stripe price for course plans
        lineItem = {
          price: checkPlan.stripePriceId,
          quantity: 1,
        };
      } else {
        if (typeof finalAmount !== "number" || finalAmount <= 0) {
          return BADREQUEST(res, "Invalid amount");
        }

        lineItem = {
          price_data: {
            currency: "usd",
            product_data: {
              name:
                (checkPlan as any)?.stripeProductId ||
                productDisplayName ||
                productName ||
                "Custom Product",
            },
            unit_amount: Math.round(finalAmount * 100),
          },
          quantity: 1,
        };
      }

      const idempotencyKey = uuidv4();

      // ✅ Create Checkout Session
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer: customer.id,

          payment_method_types: ["card"],

          line_items: [lineItem],
          allow_promotion_codes: true,
          success_url: success_url
            ? success_url
            : `${process.env.FRONTEND_URL}/payment-success`,
          cancel_url: cancel_url
            ? cancel_url
            : `${process.env.FRONTEND_URL}/payment-cancel`,

          metadata: {
            userId,
            priceId: (checkPlan as any)?.stripePriceId || "",
            isCustom: (checkPlan as any)?.stripePriceId ? "false" : "true",
            purchasedProduct:
              purchasedProduct || checkPlan?.courseId?.toString() || null,
            purchaseType: purchaseType || "NULL",
            courseId:
              purchaseType === "MOCK_EXAM" || purchaseType === "PRACTICE_TEST"
                ? productDetails?.courseId?._id.toString()
                : null,
            endDate: endDate?.endDateISO || "",
            planId: checkPlan?._id?.toString() || "",
            success_url:
              success_url || `${process.env.FRONTEND_URL}/payment-success`,
            cancel_url:
              cancel_url || `${process.env.FRONTEND_URL}/payment-cancel`,
          },
        },
        {
          idempotencyKey,
        },
      );

      return OK(
        res,
        {
          status: true,
          checkoutUrl: session.url,
          sessionId: session.id,
        },
        "checkout created Successfully",
      );
    } else {
      throw new Error("Invalid Purchase Type");
    }
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const afterSubscriptionCreatedService = async (
  req: any,
  res: Response,
) => {
  const sig = req.headers["stripe-signature"];

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch (err: any) {
    console.log(`❌ Error message: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  res.status(200).json({ received: true });
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      const sessionId = session.id;
      const userId = session.metadata?.userId;
      const priceId = session.metadata?.priceId;
      const isCustom = session.metadata?.isCustom;

      const existingOrder = await PurchaseModel.findOne({ sessionId })
        .populate("planId")
        .lean();
      if (existingOrder) {
        console.log("⚠️ Duplicate event ignored:", sessionId);
        return res.status(200).json({ received: true });
      }

      // ⚠️ Payment status check
      if (session.payment_status !== "paid") {
        console.log("⚠️ Payment not completed:", sessionId);
        return res.status(200).json({ received: true });
      }

      const amount = session.amount_total;

      const purchasedData = await PurchaseModel.create({
        userId,
        transactionId: sessionId,
        paymentIntentId: session.payment_intent,
        purchaseAmount: amount ? amount / 100 : 0,
        currency: session.currency,
        priceId: priceId || null,
        isCustom,
        type: isCustom === "true" ? "INDIVIDUAL" : "SUBSCRIPTION",
        planId: isCustom === "true" ? null : session.metadata?.planId,
        purchasedProduct: session.metadata?.purchasedProduct,
        status: "SUCCESS",
        purchaseType:
          isCustom === "true" ? session.metadata?.purchaseType : "COURSE",
        endDate: session.metadata?.endDate || null,
      });
      const cacheKey = "DASHBOARD:NEW_SUBSCRIPTION_LAST_7_DAYS";
      await redis.del(cacheKey);
      const existingFreeTrail = await PurchaseModel.findOne({
        userId,
        type: "FREE_TRIAL",
        purchasedProduct: {
          $in: [
            session.metadata?.purchasedProduct,
            new mongoose.Types.ObjectId(session.metadata?.purchasedProduct),
          ],
        },
      });
      if (existingFreeTrail) {
        await PurchaseModel.deleteOne({ _id: existingFreeTrail._id });
      }
      console.log("✅ Payment successful:", sessionId);
      break;
    }

    // ✅ Backup success confirmation
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      console.log("💰 PaymentIntent succeeded:", paymentIntent.id);

      // Optional: cross-check DB
      break;
    }

    // ❌ Failed payment
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      console.log("❌ Payment failed:", paymentIntent.id);

      const failedPurchase = await PurchaseModel.findOneAndUpdate(
        { paymentIntentId: paymentIntent.id },
        { status: "FAILED" },
      )
        .populate("userId", "fullName email")
        .populate("planId", "planName")
        .lean();

      const failedUser = failedPurchase?.userId as any;
      if (failedUser?.email) {
        const amountValue =
          typeof paymentIntent.amount === "number"
            ? (paymentIntent.amount / 100).toFixed(2)
            : undefined;
        const currency = paymentIntent.currency?.toUpperCase();

        await sendPaymentFailedEmail({
          email: failedUser.email,
          fullName: failedUser.fullName,
          subscriptionName: (failedPurchase?.planId as any)?.planName,
          ...(amountValue
            ? {
                paymentAmount: currency
                  ? `${currency} ${amountValue}`
                  : amountValue,
              }
            : {}),
        });
      } else if (paymentIntent.receipt_email) {
        const amountValue =
          typeof paymentIntent.amount === "number"
            ? (paymentIntent.amount / 100).toFixed(2)
            : undefined;
        const currency = paymentIntent.currency?.toUpperCase();

        await sendPaymentFailedEmail({
          email: paymentIntent.receipt_email,
          ...(amountValue
            ? {
                paymentAmount: currency
                  ? `${currency} ${amountValue}`
                  : amountValue,
              }
            : {}),
        });
      }

      if (!failedPurchase) {
        console.log(
          "ℹ️ No purchase record found for failed paymentIntent:",
          paymentIntent.id,
        );
      }

      break;
    }

    // ⏳ Async payments (UPI, etc.)
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;

      console.log("✅ Async payment success:", session.id);

      await PurchaseModel.findOneAndUpdate(
        { sessionId: session.id },
        { status: "SUCCESS" },
      );

      break;
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;

      console.log("❌ Async payment failed:", session.id);

      await PurchaseModel.findOneAndUpdate(
        { sessionId: session.id },
        { status: "FAILED" },
      );

      const failedEmail =
        session.customer_details?.email || session.customer_email || undefined;
      const failedFullName = session.customer_details?.name || undefined;
      const amountValue =
        typeof session.amount_total === "number"
          ? (session.amount_total / 100).toFixed(2)
          : undefined;
      const currency = session.currency?.toUpperCase();
      const planData = session.metadata?.planId
        ? await PlanModel.findById(session.metadata.planId)
            .select("planName")
            .lean()
        : null;

      if (failedEmail) {
        await sendPaymentFailedEmail({
          email: failedEmail,
          ...(failedFullName ? { fullName: failedFullName } : {}),
          ...(planData?.planName
            ? { subscriptionName: planData.planName }
            : {}),
          ...(amountValue
            ? {
                paymentAmount: currency
                  ? `${currency} ${amountValue}`
                  : amountValue,
              }
            : {}),
        });
      }

      break;
    }

    default:
      console.log(`ℹ️ Unhandled event type: ${event.type}`);
  }
};

export const handleInAppAndroidWebhook = async (payload: any, req: any) => {
  const eventTime = Number(payload.eventTimeMillis);
  const packageName = payload.packageName;
  const subNotif = payload.subscriptionNotification;

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
  );

  if (!subNotif) {
    console.error("No subscription notification in payload");
    return;
  }

  const { notificationType, purchaseToken, subscriptionId } = subNotif;

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const androidPublisher = google.androidpublisher({
    version: "v3",
    auth: auth,
  });

  const response = await androidPublisher.purchases.subscriptions.get({
    packageName: packageName,
    subscriptionId: subscriptionId,
    token: purchaseToken,
  });

  const userId = response.data.obfuscatedExternalAccountId;
  const sub = response.data;

  const planData =
    process.env.PAYMENT === "DEV"
      ? await PlanModel.findOne({
          $or: [
            {
              androidProductId: subscriptionId,
              type: "DEV",
            },
            {
              stripeProductId: subscriptionId,
              type: "DEV",
            },
            {
              iosProductId: subscriptionId,
              type: "DEV",
            },
          ],
        })
      : ((await PlanModel.findOne({
          $or: [
            {
              androidProductId: subscriptionId,
              type: "LIVE",
            },
            {
              stripeProductId: subscriptionId,
              type: "LIVE",
            },
            {
              iosProductId: subscriptionId,
              type: "LIVE",
            },
          ],
        })) as any);

  // if(!planData){
  //   throw new Error("planNotFound");
  // }

  const {
    startTimeMillis,
    expiryTimeMillis,
    priceCurrencyCode,
    priceAmountMicros,
    paymentState,
    orderId,
  } = sub as any;

  let data;

  // Notification type ke base pe action log karo
  let actionMessage = "";
  switch (notificationType) {
    case 1:
      actionMessage =
        "SUBSCRIPTION_RECOVERED - Subscription account hold se recover ho gayi ya pause se resume hui";
      data = await PurchaseModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            amount: priceAmountMicros / 1000000,
            currentPeriodStart: startTimeMillis
              ? new Date(Number(startTimeMillis))
              : null,
            currentPeriodEnd: expiryTimeMillis
              ? new Date(Number(expiryTimeMillis))
              : null,
            currency: priceCurrencyCode.toLowerCase(),
            planId: planData._id,
            status: "active",
          },
        },
        { new: true },
      );

      if (data?.userId) {
        const originalAmount = priceAmountMicros / 1000000; // convert micros → base currency
        const convertedAmountGBP = originalAmount;
        //   await TransactionModel.create({
        //     userId: data.userId,
        //     planId: planData._id,
        //     status: "succeeded",
        //     amount: convertedAmountGBP,
        //     currency: priceCurrencyCode.toLowerCase(),
        //     paidAt: new Date(eventTime) ?? new Date(),
        //   });
        await UserModel.findByIdAndUpdate(data.userId, {
          $set: { hasUsedTrial: true },
        });
      }
      break;
    case 2:
      actionMessage =
        "SUBSCRIPTION_RENEWED - Active subscription renew ho gayi (payment successful)";
      data = await PurchaseModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            amount: priceAmountMicros / 1000000,
            currentPeriodStart: startTimeMillis
              ? new Date(Number(startTimeMillis))
              : null,
            currentPeriodEnd: expiryTimeMillis
              ? new Date(Number(expiryTimeMillis))
              : null,
            currency: priceCurrencyCode.toLowerCase(),
            planId: planData._id,
            status: "active",
          },
        },
        { new: true },
      );

      if (data?.userId) {
        const originalAmount = priceAmountMicros / 1000000; // convert micros → base currency
        const convertedAmountGBP = originalAmount;
        //   await TransactionModel.create({
        //     userId: data.userId,
        //     planId: planData._id,
        //     status: "succeeded",
        //     amount: convertedAmountGBP,
        //     currency: priceCurrencyCode.toLowerCase(),
        //     paidAt: new Date(eventTime) ?? new Date(),
        //   });
        await UserModel.findByIdAndUpdate(data.userId, {
          $set: { hasUsedTrial: true },
        });
      }

      break;
    case 3:
      actionMessage =
        "SUBSCRIPTION_CANCELED - Subscription cancel ho gayi (user ne voluntarily/involuntarily cancel ki)";
      data = await PurchaseModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            status: "canceling",
          },
        },
        { new: true },
      );

      break;
    case 4:
      actionMessage =
        "SUBSCRIPTION_PURCHASED - Naya subscription purchase ho gaya";

      await PurchaseModel.findOneAndUpdate(
        {
          userId,
        },
        {
          $set: {
            deviceType: "ANDROID",
            subscriptionId,
            amount:
              paymentState === 2
                ? 0
                : paymentState === 1
                  ? priceAmountMicros / 1000000
                  : 0,
            currentPeriodStart:
              paymentState === 1 ? new Date(Number(startTimeMillis)) : null,
            currentPeriodEnd:
              paymentState === 1 ? new Date(Number(expiryTimeMillis)) : null,
            startDate: startTimeMillis
              ? new Date(Number(startTimeMillis))
              : null,
            trialStart:
              paymentState === 2 ? new Date(Number(startTimeMillis)) : null,
            trialEnd:
              paymentState === 2 ? new Date(Number(expiryTimeMillis)) : null,
            currency: priceCurrencyCode.toLowerCase(),
            planId: planData._id,
            status:
              paymentState === 2
                ? "trialing"
                : paymentState === 1
                  ? "active"
                  : "incomplete",
          },
        },
        {
          upsert: true,
        },
      );

      break;
    case 5:
      actionMessage =
        "SUBSCRIPTION_ON_HOLD - Subscription account hold pe chali gayi (payment issue)";
      break;
    case 6:
      actionMessage =
        "SUBSCRIPTION_IN_GRACE_PERIOD - Grace period mein enter ho gayi (trial/renewal delay)";

      data = await PurchaseModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            status: "past_due",
          },
        },
        { new: true },
      );

      break;
    case 7:
      actionMessage =
        "SUBSCRIPTION_RESTARTED - User ne canceled subscription ko restore kar liya (Play > Account > Subscriptions se)";
      data = await PurchaseModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            amount: priceAmountMicros / 1000000,
            currentPeriodStart: startTimeMillis
              ? new Date(Number(startTimeMillis))
              : null,
            currentPeriodEnd: expiryTimeMillis
              ? new Date(Number(expiryTimeMillis))
              : null,
            currency: priceCurrencyCode.toLowerCase(),
            planId: planData._id,
            status: "active",
          },
        },
        { new: true },
      );

      if (data?.userId) {
        const originalAmount = priceAmountMicros / 1000000; // convert micros → base currency
        const convertedAmountGBP = originalAmount;
        //   await TransactionModel.findOneAndUpdate({
        //     userId: data.userId,
        //     planId: planData._id,
        //     status: "succeeded",
        //     amount: convertedAmountGBP,
        //     currency: priceCurrencyCode.toLowerCase(),
        //     paidAt: new Date(eventTime) ?? new Date(),
        //   });
        await UserModel.findByIdAndUpdate(data.userId, {
          $set: { hasUsedTrial: true },
        });
      }

      break;
    case 8:
      actionMessage =
        "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED (DEPRECATED) - User ne price change confirm kar liya";
      break;
    case 9:
      actionMessage =
        "SUBSCRIPTION_DEFERRED - Subscription ka recurrence time extend ho gaya (future date pe shift)";
      break;
    case 10:
      actionMessage = "SUBSCRIPTION_PAUSED - User ne subscription pause kar di";
      break;
    case 11:
      actionMessage =
        "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED - Pause schedule change ho gaya";
      break;
    case 12:
      actionMessage =
        "SUBSCRIPTION_REVOKED - Subscription user se revoke ho gayi (refund/chargeback se pehle expire)";
      break;
    case 13:
      actionMessage =
        "SUBSCRIPTION_EXPIRED - Subscription expire ho gayi, ab inactive hai";

      if (response?.data?.cancelReason && response?.data?.cancelReason === 2) {
        break;
      } else {
        data = await PurchaseModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              status: "canceled",
            },
          },
        ).lean();

        if (data?.userId) {
          await UserModel.findByIdAndUpdate(data.userId, {
            $set: { hasUsedTrial: true },
          });
        }
      }

      break;
    case 19:
      actionMessage =
        "SUBSCRIPTION_PRICE_CHANGE_UPDATED - Subscription item ka price change details update ho gaye";
      break;
    case 20:
      actionMessage =
        "SUBSCRIPTION_PENDING_PURCHASE_CANCELED - Pending subscription transaction cancel ho gaya";
      break;
    case 22:
      actionMessage =
        "SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED - Price step-up ke liye user consent diya ya period shuru hua";
      break;
    default:
      actionMessage = `UNKNOWN_TYPE_${notificationType} - Google docs check karo latest ke liye`;
  }

  // Yahan MongoDB logic add karo based on type, e.g.:
  // if (notificationType === 13) {
  //   await db.collection('users').updateOne({ purchaseToken }, { $set: { subscriptionStatus: 'expired', expiredAt: new Date() } });
  // } else if (notificationType === 1) {
  //   await db.collection('users').updateOne({ purchaseToken }, { $set: { subscriptionStatus: 'active', renewedAt: new Date() } });
  // }
  // ... etc. for other types
};

export const handleInAppIOSController = async (req: Request, res: Response) => {
  try {
    const bodyBuffer = req.body;
    const userId = (req as any).user._id;
    if (!Buffer.isBuffer(bodyBuffer) || bodyBuffer.length === 0) {
      return BADREQUEST(res, "Empty body");
    }
    const bodyStr = bodyBuffer.toString("utf8");
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(bodyStr);
    } catch (e) {
      return BADREQUEST(res, "Invalid JSON");
    }
    const signedPayload = parsedBody?.receipt?.purchaseToken;
    if (!signedPayload) {
      console.log("⚠️ No signedPayload in request");
      return res.sendStatus(200);
    }
    const decodedOuter = await decodeSignedPayload(signedPayload);
    if (!decodedOuter) {
      return BADREQUEST(res, "Unable to decode signed payload");
    }

    const result = await handleInAppIOSWebhook(decodedOuter, {
      userId,
      courseId: parsedBody.courseId,
    });

    console.log("result: ", result);
    return OK(res, result, "OK");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const handleInAppIOSWebhook = async (payload: any, req: any) => {
  try {
    const webHookData = payload?.data;

    const environment =
      webHookData?.environment || payload?.environment || "Production";

    if (environment !== "Sandbox") {
      return {
        received: true,
        warning: "Invalid environment",
      };
    }

    const productId = payload?.productId || webHookData?.productId;
    const transactionId = payload?.transactionId || webHookData?.transactionId;

    if (!productId) {
      return {
        received: true,
        warning: "Product ID not found",
      };
    }

    const [userData, planData] = await Promise.all([
      UserModel.findById(req.userId),
      PlanModel.findOne({
        $or: [
          { androidProductId: productId },
          { stripeProductId: productId },
          { iosProductId: productId },
        ],
      }),
    ]);
    if (!planData) {
      return {
        received: true,
        warning: "Plan not found",
      };
    }
    if (!userData) {
      return {
        received: true,
        warning: "User not found",
      };
    }

    const { endDate } = getEndDateFromMonths(Number(planData.durationInMonths));
    const purchase = await PurchaseModel.create({
      userId: req.userId,
      planId: planData._id,
      productId,
      purchaseType: "COURSE",
      transactionId,
      currency: "usd",
      mode: "INAPP_IOS",
      purchaseAmount: planData.iosPrice,
      purchasedProduct: req.courseId,
      endDate: endDate,
      purchaseDate: new Date(),
      type: "SUBSCRIPTION",
      status: "SUCCESS",
    });

    return {
      received: true,
      purchaseId: purchase._id,
    };
  } catch (err) {
    console.error("Error handling iOS webhook:", err);
    throw err;
  }
};

export const getAllPurchases = async (req: Request, res: Response) => {
  try {
    const {
      filter,
      startDate,
      endDate,
      courseId,
      page = 1,
      limit = 10,
      search,
    } = req.query as any;

    if (!courseId) {
      throw new Error("courseId is required");
    }
    if (!["INDIVIDUAL", "SUBSCRIPTION", "FREE_TRIAL"].includes(filter)) {
      return BADREQUEST(res, "Invalid filter");
    }

    const searchText =
      typeof search === "string" ? search.trim().toLowerCase() : "";

    const currentPage = Number(page);
    const perPage = Number(limit);
    const skip = (currentPage - 1) * perPage;

    const matchStage: any = {
      status: { $in: ["SUCCESS", "EXPIRED"] },
    };

    /* -------------------------------------------------- */
    /* ✅ FILTER */
    /* -------------------------------------------------- */

    if (filter === "SUBSCRIPTION" || filter === "FREE_TRIAL") {
      matchStage.type = filter;
      matchStage.purchasedProduct = {
        $in: [courseId, new mongoose.Types.ObjectId(courseId)],
      };
    } else {
      matchStage.type = "INDIVIDUAL";
    }

    /* -------------------------------------------------- */
    /* ✅ DATE FILTER */
    /* -------------------------------------------------- */

    if (startDate || endDate) {
      matchStage.purchaseDate = {};
      if (startDate) matchStage.purchaseDate.$gte = new Date(startDate);
      if (endDate) matchStage.purchaseDate.$lte = new Date(endDate);
    }

    /* -------------------------------------------------- */
    /* ✅ FETCH PURCHASES (only fields we actually need) */
    /* -------------------------------------------------- */

    const purchases = await PurchaseModel.find(matchStage)
      .populate("userId", "fullName email")
      .populate("planId", "planName")
      .sort({ purchaseAmount: -1 })
      .lean();

    const matchesSearch = (...values: Array<string | null | undefined>) => {
      if (!searchText) return true;
      return values.some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(searchText),
      );
    };

    const buildResponse = (finalData: any[]) => {
      const filtered = finalData.filter((item: any) =>
        matchesSearch(
          item?.userId?.fullName,
          item?.userId?.email,
          item?.planName,
          item?.courseName,
          item?.purchasedItem,
          item?.purchaseType,
          item?.type,
        ),
      );

      const total = filtered.length;
      const paginatedData = filtered.slice(skip, skip + perPage);

      return OK(
        res,
        {
          data: paginatedData,
          pagination: {
            total,
            page: currentPage,
            limit: perPage,
            totalPages: Math.ceil(total / perPage),
          },
        },
        "Filtered Data Fetched",
      );
    };

    /* -------------------------------------------------- */
    /* ✅ SUBSCRIPTION / FREE TRIAL */
    /* -------------------------------------------------- */

    if (filter === "SUBSCRIPTION" || filter === "FREE_TRIAL") {
      const courseData = await CourseModel.findById(courseId)
        .select("name")
        .lean();

      const finalData = purchases.map((item: any) => ({
        ...item,
        planName: item?.planId?.planName || "-",
        courseName: courseData?.name || "N/A",
        purchasedItem: courseData?.name || "N/A",
      }));

      return buildResponse(finalData);
    }

    /* -------------------------------------------------- */
    /* ✅ INDIVIDUAL PURCHASE LOGIC (BATCHED — no N+1) */
    /* -------------------------------------------------- */

    const individualModelMap: Record<string, any> = {
      LESSONS: LessonModel,
      PRACTICE_TEST: PracticeExamModel,
      MOCK_EXAM: MockExamModel,
      DOMAIN_TASK: DomainModel,
      APPLICATION_SUPPORT: ApplicationSupportModel,
      FLASH_CARDS: FlashCardCategoryModel,
      EXAM_STRATEGY: ExamStrategyModel,
    };

    // 1) Group purchase-product ids by purchaseType so we issue ONE query
    //    per product type instead of one query per purchase row.
    const idsByType: Record<string, Set<string>> = {};

    for (const item of purchases as any[]) {
      const type = item.purchaseType;
      if (!individualModelMap[type] || !item.purchasedProduct) continue;
      if (!idsByType[type]) idsByType[type] = new Set();
      idsByType[type].add(item.purchasedProduct.toString());
    }

    // 2) Fire off all the batched lookups in parallel.
    const productMap = new Map<string, any>();

    await Promise.all(
      Object.entries(idsByType).map(async ([type, idSet]) => {
        const model = individualModelMap[type];
        const products = await model
          .find({ _id: { $in: Array.from(idSet) } })
          .populate("courseId", "name")
          .select("_id name module domain categoryName courseId")
          .lean();

        for (const product of products) {
          productMap.set(`${type}:${product._id.toString()}`, product);
        }
      }),
    );

    // 3) Single synchronous pass — no awaits, no per-row DB calls.
    const finalData: any[] = [];

    for (const item of purchases as any[]) {
      const model = individualModelMap[item.purchaseType];
      if (!model || !item.purchasedProduct) continue;

      const product = productMap.get(
        `${item.purchaseType}:${item.purchasedProduct.toString()}`,
      );
      if (!product) continue;

      const productCourseId =
        typeof product.courseId === "object"
          ? product.courseId?._id?.toString()
          : product.courseId?.toString();

      if (productCourseId !== courseId.toString()) continue;

      const purchasedItem =
        product.name ||
        product.module ||
        product.domain ||
        product.categoryName ||
        "N/A";

      finalData.push({
        ...item,
        planName: item?.planId?.planName || "-",
        courseName: (product as any)?.courseId?.name || "N/A",
        purchasedItem,
      });
    }

    return buildResponse(finalData);
  } catch (err: any) {
    console.log(err);

    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const exportPurchasesCSV = async (req: Request, res: Response) => {
  try {
    const { filter, startDate, endDate, courseId } = req.query as any;

    if (!courseId) {
      throw new Error("courseId is required");
    }

    if (!["INDIVIDUAL", "SUBSCRIPTION", "FREE_TRIAL"].includes(filter)) {
      throw new Error("Invalid filter");
    }

    /* -------------------------------------------------- */
    /* ✅ MATCH STAGE */
    /* -------------------------------------------------- */

    const matchStage: any = {};

    if (filter === "SUBSCRIPTION" || filter === "FREE_TRIAL") {
      matchStage.type = filter;

      matchStage.purchasedProduct = {
        $in: [courseId, new mongoose.Types.ObjectId(courseId)],
      };
    } else {
      matchStage.type = "INDIVIDUAL";
    }

    /* -------------------------------------------------- */
    /* ✅ DATE FILTER */
    /* -------------------------------------------------- */

    if (startDate || endDate) {
      matchStage.purchaseDate = {};

      if (startDate) {
        matchStage.purchaseDate.$gte = new Date(startDate);
      }

      if (endDate) {
        matchStage.purchaseDate.$lte = new Date(endDate);
      }
    }

    /* -------------------------------------------------- */
    /* ✅ FETCH PURCHASES */
    /* -------------------------------------------------- */

    const purchases = await PurchaseModel.find(matchStage)
    .populate("userId", "fullName firstname lastname email")
    .populate("planId", "planName")
    .sort({ purchaseAmount: -1 })
    .lean();

    let finalData: any[] = [];

    /* -------------------------------------------------- */
    /* ✅ SUBSCRIPTION / FREE TRIAL */
    /* -------------------------------------------------- */

    if (filter === "SUBSCRIPTION" || filter === "FREE_TRIAL") {
      const courseData = await CourseModel.findById(courseId)
        .select("name")
        .lean();

      finalData = purchases.map((purchase: any, index: number) => ({
        Order: String(index + 1).padStart(2, "0"),

        Name:
          purchase?.userId?.fullName ||
          `${purchase?.userId?.firstname || ""} ${
            purchase?.userId?.lastname || ""
          }`.trim(),

        Email: purchase?.userId?.email || "-",

        Category:
          purchase.purchaseType?.replaceAll("_", " ")?.toUpperCase() || "-",

        "Item Purchased": courseData?.name || "N/A",

        Type: purchase.type || "-",

        "Plan Name": purchase?.planId?.planName || "-",
        "Amount Paid": `$${(purchase.purchaseAmount || 0).toFixed(2)}`,

        "Purchased On": purchase.purchaseDate
          ? new Date(purchase.purchaseDate).toLocaleDateString("en-US")
          : "-",

        "Expires On": purchase.endDate
          ? new Date(purchase.endDate).toLocaleDateString("en-US")
          : "-",
      }));
    } else {
      /* -------------------------------------------------- */
      /* ✅ INDIVIDUAL PURCHASES */
      /* -------------------------------------------------- */

      const individualModelMap: Record<string, any> = {
        LESSONS: LessonModel,
        PRACTICE_TEST: PracticeExamModel,
        MOCK_EXAM: MockExamModel,
        DOMAIN_TASK: DomainModel,
        APPLICATION_SUPPORT: ApplicationSupportModel,
        FLASH_CARDS: FlashCardCategoryModel,
        EXAM_STRATEGY: ExamStrategyModel,
      };

      const tempData = [];

      for (const [index, purchase] of purchases.entries()) {
        const model = individualModelMap[(purchase as any).purchaseType];

        if (!model) continue;

        const product = await model
          .findById((purchase as any).purchasedProduct)
          .select("_id name module domain categoryName courseId")
          .lean();

        if (!product) continue;

        // ✅ FILTER COURSE
        if (product.courseId?.toString() !== courseId.toString()) {
          continue;
        }

        // ✅ NORMALIZE NAME
        const itemPurchased =
          product.name ||
          product.module ||
          product.domain ||
          product.categoryName ||
          "N/A";

        tempData.push({
          Order: String(tempData.length + 1).padStart(2, "0"),

          Name:
            (purchase as any)?.userId?.fullName ||
            `${(purchase as any)?.userId?.firstname || ""} ${
              (purchase as any)?.userId?.lastname || ""
            }`.trim(),

          Email: (purchase as any)?.userId?.email || "-",

          Category:
            (purchase as any).purchaseType
              ?.replaceAll("_", " ")
              ?.toUpperCase() || "-",

          "Item Purchased": itemPurchased,

          Type: (purchase as any).type || "-",
          "Plan Name": (purchase as any)?.planId?.planName || "N/A",

          "Amount Paid": `$${((purchase as any).purchaseAmount || 0).toFixed(
            2,
          )}`,

          "Purchased On": (purchase as any).purchaseDate
            ? new Date((purchase as any).purchaseDate).toLocaleDateString(
                "en-US",
              )
            : "-",

          "Expires On": (purchase as any).endDate
            ? new Date((purchase as any).endDate).toLocaleDateString("en-US")
            : "-",
        });
      }

      finalData = tempData;
    }

    /* -------------------------------------------------- */
    /* ✅ CSV FIELDS */
    /* -------------------------------------------------- */

    const fields = [
      "Order",
      "Name",
      "Email",
      "Category",
      "Item Purchased",
      "Type",
      "Plan Name",
      "Amount Paid",
      "Purchased On",
      "Expires On",
    ];

    /* -------------------------------------------------- */
    /* ✅ JSON → CSV */
    /* -------------------------------------------------- */

    const json2csvParser = new Parser({
      fields,
    });

    const csv = json2csvParser.parse(finalData);

    /* -------------------------------------------------- */
    /* ✅ DOWNLOAD */
    /* -------------------------------------------------- */

    res.header("Content-Type", "text/csv");

    res.attachment(`purchases-report-${Date.now()}.csv`);

    return res.send(csv);
  } catch (err: any) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
};

export const getCurrentSubscription = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { courseId } = req.query;
    const subscription = await PurchaseModel.find({
      type: "SUBSCRIPTION",
      purchasedProduct: courseId,
      userId,
      status: "SUCCESS",
    })
      .sort({ purchaseAmount: -1 })
      .populate("planId")
      .lean();
    return OK(res, subscription, "Filtered Data Fetched");
  } catch (err: any) {
    console.log(err);

    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
