import mongoose, { Document, Schema, Types } from "mongoose";

export interface ICourse extends Document {
  name?: string;
  order?: number;
  image?: string;
  hasLessons?: boolean;
  hasDomainTask?: boolean;
  hasPracticeQuestion?: boolean;
  hasMockExam?: boolean;
  hasFlashCards?: boolean;
  hasApplicationSupport?: boolean;
  hasExamStrategy?: boolean;
  hasCertificates?: boolean;
  status?: "ACTIVE" | "DELETED" | "INACTIVE";
  practiceExamPrice?: number;
  mockExamPrice?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    name: {
      type: String,
      required: true,
    },
    order: {
      type: Number,
      required: true,
    },
    image: {
      type: String,
      default: null,
    },
    hasLessons: {
      type: Boolean,
      default: true,
    },
    hasDomainTask: {
      type: Boolean,
      default: true,
    },
    hasPracticeQuestion: {
      type: Boolean,
      default: true,
    },
    hasMockExam: {
      type: Boolean,
      default: true,
    },
    hasFlashCards: {
      type: Boolean,
      default: true,
    },
    hasApplicationSupport: {
      type: Boolean,
      default: true,
    },
    hasExamStrategy: {
      type: Boolean,
      default: true,
    },
    hasCertificates: {
      type: Boolean,
      default: true,
    },
    practiceExamPrice: {
      type: Number,
      default: 0,
    },
    mockExamPrice: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

export const CourseModel = mongoose.model<ICourse>("course", courseSchema);
