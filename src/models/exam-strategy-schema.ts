import mongoose, { Document, Schema, Types } from "mongoose";

const dataSchema = new Schema({
  fileName: {
    type: String,
    required: true,
  },
  fileType: {
    type: String,
    enum: ["VIDEO", "PDF", "IMAGE"],
    required: true,
  },
  fileLink: {
    type: String,
    required: true,
  },
});

export interface IExamStrategy extends Document {
  courseId: Types.ObjectId;
  name: string | Types.ObjectId;
  order: number;
  price: number;
  data: {
    fileName: string;
    fileType: "VIDEO" | "PDF" | "IMAGE";
    fileLink: string;
  }[];
  status: "ACTIVE" | "DELETED" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

const examStrategySchema = new Schema<IExamStrategy>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
      index: true,
    },
    name: {
      type: String, // or Schema.Types.ObjectId with ref
      required: true,
      index: true,
    },
    price: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      required: true,
    },
    data: {
      type: [dataSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true },
);

export const ExamStrategyModel = mongoose.model<IExamStrategy>(
  "examStrategy",
  examStrategySchema,
);
