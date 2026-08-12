import mongoose, { Document, Schema, Types } from "mongoose";

export interface IProgress extends Document {
  userId?: Types.ObjectId;
  moduleId?: Types.ObjectId;
  domainId?: Types.ObjectId;
  percentage?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const progressSchema = new Schema<IProgress>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      index: true,
    },
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: "lesson",
      index: true,
    },
    domainId: {
      type: Schema.Types.ObjectId,
      ref: "domain",
      index: true,
    },
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true },
);

export const ProgressModel = mongoose.model<IProgress>(
  "progress",
  progressSchema,
);
