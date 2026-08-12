import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUserDashboard extends Document {
  userId?: Types.ObjectId;
  courseId?: Types.ObjectId;
  examScheduled: Boolean;
  examScheduledAt: Date;
  questionOfTheDay: Types.ObjectId;
  isQuestionOfTheDayAttempted: Boolean;
  questionUpdatedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const userDashboardSchema = new Schema<IUserDashboard>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
    },
    examScheduled: {
      type: Boolean,
      default: false,
    },
    questionOfTheDay: {
      type: Schema.Types.ObjectId,
      ref: "questions",
    },
    isQuestionOfTheDayAttempted: {
      type: Boolean,
      default: false,
    },
    examScheduledAt: {
      type: Date,
      default: null,
    },
    questionUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export const UserDashboardModel = mongoose.model<IUserDashboard>(
  "userDashboard",
  userDashboardSchema,
);
