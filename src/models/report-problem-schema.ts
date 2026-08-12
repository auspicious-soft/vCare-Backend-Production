import mongoose, { Document, Schema, Types } from "mongoose";

export interface IReportProblem extends Document {
  identifier: string;
  courseId?: Types.ObjectId;
  userId?: Types.ObjectId;
  type:
    | "MOCK-EXAM"
    | "PRACTICE-EXAM"
    | "DOMAIN-TASK"
    | "LESSON-VIDEO"
    | "QUESTION-OF-THE-DAY"
    | "FLASH-CARD"
    | "APPLICATION-SUPPORT"
    | "EXAM-STRATEGY"
    | "SUBSCRIPTION"
    | "EXAM-REPORTS"
    | "CERTIFICATES"
    | "CHANGE-PASSWORD"
    | "OTHERS";
  relevantId: Types.ObjectId | null;
  comments: String | null;
  status: "ACTIVE" | "INACTIVE" | "DELETED" | "RESOLVED";
  emailSent: Boolean;
  resolvedAt: Date | null;
  resolvedComments: String | null;
  resolvedBy: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export const reportTypeEnum = [
  "MOCK-EXAM",
  "PRACTICE-EXAM",
  "DOMAIN-TASK",
  "LESSON-VIDEO",
  "QUESTION-OF-THE-DAY",
  "FLASH-CARD",
  "APPLICATION-SUPPORT",
  "EXAM-STRATEGY",
  "SUBSCRIPTION",
  "EXAM-REPORTS",
  "CERTIFICATES",
  "CHANGE-PASSWORD",
  "OTHERS",
];

export const reportTypeForUser = [
  "Mock Exam",
  "Practice Question",
  "Domains and Tasks",
  "Lessons and Videos",
  "Question of the Day",
  "Flash Card",
  "Application Support",
  "Exam Strategy",
  "Plans",
  "Exam Reports",
  "Certificates",
  "Change Password",
  "Others",
];

const reportProblemSchema = new Schema<IReportProblem>(
  {
    identifier: {
      type: String,
      unique: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
    type: {
      type: String,
      enum: reportTypeForUser,
    },
    relevantId: {
      type: String,
      default: null,
    },
    comments: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "DELETED", "RESOLVED"],
      default: "ACTIVE",
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "admin",
      default: null,
    },
    resolvedComments: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);


export const ReportProblemModel = mongoose.model<IReportProblem>(
  "reportProblem",
  reportProblemSchema,
);
