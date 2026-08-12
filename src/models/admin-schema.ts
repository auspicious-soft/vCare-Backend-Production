import mongoose, { Document, Schema } from "mongoose";
import { access } from "../utils/constant.js";

export interface IAdmin extends Document {
  firstname: string;
  lastname: string;
  fullName: string;
  email: string;
  password?: string;
  countryCode: string;
  phoneNumber: string;
  image?: string | null;
  role?: "ACCOUNT_MANAGER" | "SUPER_ADMIN" | "OWNER";
  access?: string[];
  sendEmail?: boolean;
  sendReportEmail?: boolean;
  status?: "ACTIVE" | "DELETED" | "BLOCKED";
  createdAt?: Date;
  updatedAt?: Date;
}


const adminSchema = new Schema<IAdmin>(
  {
    firstname: {
      type: String,
      required: true,
      trim: true,
    },
    lastname: {
      type: String,
      required: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
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
    image: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      default: "ACCOUNT_MANAGER",
    },
    access: {
      type: [String],
      default: [],
      enum: Object.values(access).map((a) => a.value),
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "BLOCKED"],
      default: "ACTIVE",
    },
    sendEmail: {
      type: Boolean,
      default: true,
    },
    sendReportEmail: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export const AdminModel = mongoose.model<IAdmin>("admin", adminSchema);
