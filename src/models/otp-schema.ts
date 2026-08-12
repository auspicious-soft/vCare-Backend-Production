import mongoose, { Document, Schema, Types } from "mongoose";

export interface IOTP extends Document {
  adminId?: Types.ObjectId;
  userId?: Types.ObjectId;
  otp: string;
  userType: "ADMIN" | "USER";
  purpose: "LOGIN" | "FORGOT_PASSWORD" | "VERIFY_EMAIL";
  expiresAt: Date;
  attempts: number;
  verified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const otpSchema = new Schema<IOTP>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "admin",
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    userType: {
      type: String,
      enum: ["ADMIN", "USER"],
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ["LOGIN", "FORGOT_PASSWORD", "VERIFY_EMAIL"],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Auto-delete expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OTPModel = mongoose.model<IOTP>("otp", otpSchema);
