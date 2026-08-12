import mongoose, { Document, Schema, Types } from "mongoose";

export interface ICompanyInfo extends Document {
  title: String;
  companyName: String;
  description: String;
  logo: String;
  address: String;
  primaryEmail: String;
  secondaryEmail: String;
  primaryContact: String;
  secondaryContact: String;
  termAndConditions: String;
  privacyPolicy: String;
  refuncPolicy: String;
  freeTrailDuration: Number;
  individualDuration: Number;
  createdAt?: Date;
  updatedAt?: Date;
}

const companyInfoSchema = new Schema<ICompanyInfo>(
  {
    title: {
      type: String,
      default: null,
    },
    companyName: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    logo: {
      type: String,
      default: null,
    },
    address: {
      type: String,
      default: null,
    },
    primaryEmail: {
      type: String,
      default: null,
    },
    secondaryEmail: {
      type: String,
      default: null,
    },
    primaryContact: {
      type: String,
      default: null,
    },
    secondaryContact: {
      type: String,
      default: null,
    },
    termAndConditions: {
      type: String,
      default: null,
    },
    privacyPolicy: {
      type: String,
      default: null,
    },
    refuncPolicy: {
      type: String,
      default: null,
    },
    freeTrailDuration: {
      type: Number,
      default: 7,
    },
    individualDuration: {
      type: Number,
      default: 12,
    },
  },
  { timestamps: true },
);

export const CompanyInfoModel = mongoose.model<ICompanyInfo>(
  "companyinfo",
  companyInfoSchema,
);
