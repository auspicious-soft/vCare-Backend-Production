import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  firstname: string;
  lastname: string;
  fullName: string;
  email: string;
  emailVerified?: boolean;
  countryCode: string;
  phoneNumber: string;
  password?: string;
  image?: string | null;
  fcmToken?: { token: string; deviceType?: "ANDROID" | "IOS" | "WEB" }[];
  deviceType?: "ANDROID" | "IOS" | "WEB";
  role?: "USER";
  status?: "ACTIVE" | "DELETED" | "BLOCKED";
  stripeCustomerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

const userSchema = new Schema<IUser>(
  {
    firstname: {
      type: String,
      // required: true,
      trim: true,
    },
    lastname: {
      type: String,
      // required: true,
      trim: true,
    },
    fullName: {
      type: String,
      // required: true,
      trim: true,
    },
    image: {
      type: String,
      default: null,
    },
    fcmToken: [
      {
        token: { type: String },
        deviceType: { type: String, enum: ["WEB", "ANDROID", "IOS"] },
      },
    ],
    deviceType: {
      type: String,
      enum: ["WEB", "ANDROID", "IOS"],
      default: null,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    countryCode: {
      type: String,
      default: null,
    },
    phoneNumber: {
      type: String,
      default: null,
      // unique: true,
    },
    password: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      default: "USER",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "BLOCKED"],
      default: "ACTIVE",
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<IUser>("user", userSchema);
