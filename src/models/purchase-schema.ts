import mongoose, { Document, Schema, Types } from "mongoose";

const purchaseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "user" },
    type: {
      type: String,
      enum: ["INDIVIDUAL", "FREEMIUM", "SUBSCRIPTION", "FREE_TRIAL"],
    },
    purchaseType: {
      type: String,
      enum: [
        "LESSONS",
        "PRACTICE_TEST",
        "MOCK_EXAM",
        "DOMAIN_TASK",
        "EXAM_STRATEGY",
        "APPLICATION_SUPPORT",
        "FLASH_CARDS",
        "COURSE",
        "NULL",
      ],
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "plans",
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    transactionId: {
      type: String,
    },
    paymentIntentId: {
      type: String,
    },
    endDate: {
      type: Date,
      default: null,
    },
    purchaseAmount: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      default: null,
    },
    mode: {
      type: String,
      enum: ["INAPP_ANDROID", "INAPP_IOS", "STRIPE", "MANUAL"],
    },
    status: {
      type: String,
      enum: ["FAILED", "SUCCESS", "PENDING", "CANCELLED", "EXPIRED"],
      default: "PENDING",
    },
    purchasedProduct: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

export const PurchaseModel = mongoose.model("purchase", purchaseSchema);
