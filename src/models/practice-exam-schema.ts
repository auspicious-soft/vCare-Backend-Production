import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPracticeExam extends Document {
  order: number;
  courseId: Types.ObjectId;
  name: string;
  price: number;
  status: "ACTIVE" | "INACTIVE" | "DELETED";
  createdAt?: Date;
  updatedAt?: Date;
}

const practiceExamSchema = new Schema<IPracticeExam>(
  {
    order: {
      type: Number,
      required: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "DELETED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);


export const PracticeExamModel = mongoose.model<IPracticeExam>(
  "practiceexam",
  practiceExamSchema,
);
