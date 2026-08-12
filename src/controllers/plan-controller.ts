import type { Request, Response } from "express";
import {
  BADREQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  OK,
  UNAUTHORIZED,
} from "../utils/responses.js";
import { PlanModel } from "../models/plans-schema.js";
import { PurchaseModel } from "../models/purchase-schema.js";
import { MockExamModel } from "../models/mock-exam-schema.js";
import { PracticeExamModel } from "../models/practice-exam-schema.js";
import stripe from "../config/stripe.js";
import { CheckCourseExist } from "../utils/helpers.js";


export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const products = await stripe.products.list({
      active: true,
      expand: ["data.default_price"],
      limit: 100,
    });
    const formattedProducts = await Promise.all(
      products.data.map(async (product) => {
        const price = product.default_price as any;

        const planData = {
          planName: product.name,
          type: process.env.MODE,
          durationInMonths: Number(product.metadata.duration),
          planDescription: product.description,
          stripeProductId: product?.id,
          stripePriceId: price?.id || null,
          currency: price?.currency || "inr",
          stripePrice: price?.unit_amount ? price.unit_amount / 100 : 0,
          level: Number(product.metadata.level),
        };

        await PlanModel.findOneAndUpdate(
          { stripeProductId: product.id },
          planData,
          { upsert: true, new: true },
        );

        return planData;
      }),
    );

    await Promise.all(
      ["LIVE", "DEV"].map(async (type: any) => {
        await PlanModel.findOneAndUpdate(
          { planName: "FREE_TRIAL" },
          {
            planName: "FREE_TRIAL",
            type: type,
            level: 0,
          },
          { upsert: true, new: true },
        );
      }),
    );

    return OK(res, formattedProducts, "Plan Fetched Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const createPlan = async (req: Request, res: Response) => {
  try {
    const {
      courseId,
      level,
      mockExams,
      practiceExams,
      flashCards,
      questionOfTheDay,
      domainAndTask,
      applicationSupport,
      digitalStudyMaterial,
      expertVideoModule,
      planDescription,
      planId,
      status
    } = req.body;

    if (![0,1, 2, 3].includes(Number(level))) {
      throw new Error("Invalid level");
    }

    await PlanModel.updateMany(
      { _id:  planId, courseId },
      {
        $set: {
          level: Number(level),
          mockExams,
          practiceExams,
          flashCards,
          questionOfTheDay,
          domainAndTask,
          applicationSupport,
          digitalStudyMaterial,
          expertVideoModule,
          planDescription,
          status
        },
      },
    );

    return OK(res, {}, "Plan Created");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getPlanData = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.query;

    const checkCourseId = await CheckCourseExist(courseId);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }
    const [mockExams, practiceTests] = await Promise.all([
      MockExamModel.find({ status: "ACTIVE", courseId })
        .select("_id name")
        .sort({ order: 1 }),
      PracticeExamModel.find({ status: "ACTIVE", courseId })
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

export const getPlans = async (req: Request, res: Response) => {
  try {
    const { months, courseId } = req.query;
    const userId = (req as any).user?._id;

    const monthNumber = Number(months);
    if (Number.isNaN(monthNumber)) {
      throw new Error("months must be a number");
    }

    const plans = await PlanModel.find({
      courseId,
      // status: "ACTIVE",
      durationInMonths: { $in: [monthNumber, 0] },
    }).lean();

    const planIds = plans.map((plan: any) => plan._id);

    const purchases = userId
      ? await PurchaseModel.find({
          userId,
          planId: { $in: planIds },
          status: "SUCCESS",
          type: { $in: ["FREE_TRIAL", "SUBSCRIPTION"] },
          endDate: { $gte: new Date() },
        })
          .sort({ purchaseAmount : -1 })
          .select("planId status endDate purchaseDate")
          .lean()
      : [];

    if (!userId) {
      return OK(res, plans, "Data Fetched");
    }

    const purchaseMap = new Map<string, any>();
    purchases.forEach((purchase: any) => {
      const key = purchase?.planId?.toString();
      if (key && !purchaseMap.has(key)) {
        purchaseMap.set(key, purchase);
      }
    });

    const mappedPlans = plans.map((plan: any) => {
      const purchase = purchaseMap.get(plan._id.toString());
      return {
        ...plan,
        isPurchased: Boolean(purchase),
        purchaseStatus: purchase?.status === "SUCCESS" ? true : false,
        expiryDate: purchase?.endDate || null,
      };
    });

    return OK(res, mappedPlans, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

const toUnitAmount = (amount: number) => Math.round(amount * 100);

export const createPlansDirectlyToStripe = async (req: any, res: Response) => {
  try {
    const { courseName, courseId } = req;
    const planType = process.env.MODE === "LIVE" ? "LIVE" : "DEV";

    if (!courseName || !courseId) {
      return res.status(400).json({
        success: false,
        message: "courseName and courseId required",
      });
    }

    const existing = await PlanModel.find({ courseId });
    if (existing.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Plans already exist for this course",
        data: existing,
      });
    }

    const plans = [
      {
        name: "Advanced- 3 Month",
        price: 299.97,
        level: "2",
        durationInMonths: 3,
      },
      {
        name: "Essentials- 3 Month",
        price: 149.97,
        level: "1",
        durationInMonths: 3,
      },
      {
        name: "Elite- 3 Month",
        price: 899.97,
        level: "3",
        durationInMonths: 3,
      },
      { name: "Advanced - 1 Month", price: 99.99, level: "2", durationInMonths: 1 },
      { name: "Essentials - 1 Month", price: 49.99, level: "1", durationInMonths: 1 },
      { name: "Elite - 1 Month", price: 299.97, level: "3", durationInMonths: 1 },
    ];

    const savedPlans = [];

    for (const plan of plans) {
      const fullName = `${courseName} - ${plan.name}`;

      const product = await stripe.products.create({
        name: fullName,
        metadata: {
          courseId: courseId.toString(),
          courseName,
          level: plan.level,
          duration: plan.durationInMonths || "none",
        },
      });

      const price = await stripe.prices.create({
        unit_amount: toUnitAmount(plan.price),
        currency: "usd",
        product: product.id,
      });

      const newPlan = await PlanModel.create({
        courseId,
        courseName,
        planName: plan.name,
        type: planType,
        level: Number(plan.level),
        currency: "usd",
        stripePrice: plan.price,
        iosPrice: 0,
        androidPrice: 0,
        durationInMonths: plan.durationInMonths,
        stripeProductId: product.id,
        stripePriceId: price.id,
      });


      savedPlans.push(newPlan);
    }
    await PlanModel.create({
      courseId,
      courseName,
      planName: "Free Trial",
      type: planType,
      level: 0,
      currency: "usd",
      stripePrice: 0,
      iosPrice: 0,
      androidPrice: 0,
      durationInMonths: 0,
      stripeProductId: null,
      stripePriceId: null,
    })
    return;
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updatePlans = async (req: any, res: Response) => {
  try {
    const { courseId, status } = req;

    if (!courseId || !status) {
      return res.status(400).json({
        success: false,
        message: "status and courseId required",
      });
    }

    // Fetch all plans for this course
    const plans = await PlanModel.find({ courseId });

    if (!plans.length) {
      return BADREQUEST(res, "No plans found for this course");
    }

    const isActive = status === "ACTIVE";

    for (const plan of plans) {
      if (plan.stripeProductId) {
        await stripe.products.update(plan.stripeProductId, {
          active: isActive,
        });
      }

      if (plan.stripePriceId) {
        await stripe.prices.update(plan.stripePriceId, {
          active: isActive,
        });
      }
    }

    await PlanModel.updateMany(
      { courseId },
      {
        status,
      },
    );

    return;
  } catch (err: any) {
    console.error(err);

    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const updatePlanPrice = async (req: any, res: Response) => {
  try {
    const { planId, newAmount } = req.body;

    if (!planId || !newAmount) {
      return res.status(400).json({
        success: false,
        message: "planId and newAmount are required",
      });
    }

    const plan = await PlanModel.findById(planId);

    if (!plan) {
      return BADREQUEST(res, "Plan not found");
    }

    if (!plan.stripeProductId) {
      return BADREQUEST(res, "Stripe product not linked");
    }
    if (plan.stripePrice == newAmount) {
      return res.status(200).json({
        success: true,
        message: "Plan price already updated",
      });
    }
    const newPrice = await stripe.prices.create({
      unit_amount: newAmount * 100,
      currency: "usd",
      product: plan.stripeProductId,
    });

    if (plan.stripePriceId) {
      await stripe.prices.update(plan.stripePriceId, {
        active: false,
      });
    }

    plan.stripePriceId = newPrice.id;
    plan.stripePrice = newAmount;
    await plan.save();

    return OK(res, {}, "Price updated successfully");
  } catch (err: any) {
    console.error(err);

    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
