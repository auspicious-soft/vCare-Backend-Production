import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPlans extends Document {
  _id: Types.ObjectId;

  courseId: Types.ObjectId;
  courseName: string;
  planName: string;
  planDescription?: string;

  // Duration
  durationInMonths: number;

  // Benefits
  mockExams: [Types.ObjectId];
  practiceExams: [Types.ObjectId];
  flashCards: boolean;
  questionOfTheDay: boolean;
  domainAndTask: boolean;
  applicationSupport: boolean;
  digitalStudyMaterial: boolean;
  expertVideoModule: boolean;  //EXAM_STRATEGY

  // Provider Mapping
  stripeProductId: string;
  stripePriceId: string;

  iosProductId: string;
  androidProductId: string;

  // Price Details
  currency: string;
  stripePrice: number;
  iosPrice: number;
  androidPrice: number;
  level: number;
  status: "ACTIVE" | "INACTIVE";
  type: "DEV" | "LIVE";

  createdAt?: Date;
  updatedAt?: Date;
}

const planSchema = new Schema<IPlans>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
    },
    courseName: {
      type: String,
      required: true,
      trim: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },

    planDescription: {
      type: String,
      default: "",
    },

    durationInMonths: {
      type: Number,
      required: true,
      min: 0,
    },

    /* ---------- Benefits ---------- */
    mockExams: {
      type: [Schema.Types.ObjectId],
      ref:"mockexam",
      default:[]
    },

    practiceExams: {
      type: [Schema.Types.ObjectId],
      ref:"practiceexam",
      default:[]
    },

    flashCards: {
      type: Boolean,
      default: false,
    },

    questionOfTheDay: {
      type: Boolean,
      default: false,
    },

    domainAndTask: {
      type: Boolean,
      default: false,
    },

    applicationSupport: {
      type: Boolean,
      default: false,
    },

    digitalStudyMaterial: {
      type: Boolean,
      default: false,
    },

    expertVideoModule: {
      type: Boolean,
      default: false,
    },

    /* ---------- Stripe ---------- */
    stripeProductId: {
      type: String,
      default: null,
    },

    stripePriceId: {
      type: String,
      default: null,
    },

    /* ---------- In-App ---------- */
    iosProductId: {
      type: String,
      default: null,
    },

    androidProductId: {
      type: String,
      default: null,
    },

    /* ---------- Pricing ---------- */
    currency: {
      type: String,
      default: "usd",
    },

    stripePrice: {
      type: Number,
      default: 0,
    },

    iosPrice: {
      type: Number,
      default: 0,
    },

    androidPrice: {
      type: Number,
      default: 0,
    },

    /* ---------- Meta ---------- */
    level: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    type: {
      type: String,
      enum: ["DEV", "LIVE"],
      required: true,
    },
  },
  { timestamps: true },
);

export const PlanModel = mongoose.model<IPlans>("plans", planSchema);
