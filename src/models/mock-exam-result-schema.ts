import mongoose, { Document, Schema, Types } from "mongoose";

export interface IMockExamResult extends Document {
  userId: Types.ObjectId;
  attemptNumber: number;
  mockExamId: Types.ObjectId;
  lastQuestionId: Types.ObjectId;
  currentStatus: "COMPLETED" | "PAUSED" | "STARTED";
  availableTime: String;
  correct: number;
  incorrect: number;
  unanswered: number;
  remarks: string;
  overallPercentage: number;
  scoreBreakDown: Object;
  timeTaken: String;
  status: "ACTIVE" | "INACTIVE";
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const mockExamResultSchema = new Schema<IMockExamResult>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
    attemptNumber: {
      type: Number,
      required: true,
    },
    mockExamId: {
      type: Schema.Types.ObjectId,
      ref: "mockexam",
    },
    lastQuestionId: {
      type: Schema.Types.ObjectId,
      ref: "questions",
    },
    currentStatus: {
      type: String,
      enum: ["COMPLETED", "PAUSED", "STARTED"],
    },
    availableTime: {
      type: String,
      require: true,
    },
    correct: {
      type: Number,
      default: 0,
    },
    incorrect: {
      type: Number,
      default: 0,
    },
    unanswered: {
      type: Number,
      default: 0,
    },
    remarks: {
      type: String,
      default: null,
    },
    overallPercentage: {
      type: Number,
      default: 0,
    },
    scoreBreakDown: {
      type: Object,
      default: {},
    },
    timeTaken: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export const MockExamResultModel = mongoose.model<IMockExamResult>(
  "mockexamresult",
  mockExamResultSchema,
);
