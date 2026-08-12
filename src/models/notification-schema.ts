import mongoose, { Document, Schema, Types } from "mongoose";

export interface INotification extends Document {
  title: String;
  courseId: Types.ObjectId;
  description: String;
  sentOn: Date;
  isRead: [String];
  isSent: Boolean;
  type: "NOTIFICATION" | "ANNOUNCEMENT";
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    title: {
      type: String,
      required: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    sentOn: {
      type: Date,
      required: true,
    },
    isSent: {
      type: Boolean,
      default: false,
    },
    isRead: {
      type: [String],
      default: [],
    },
    type: {
      type: String,
      enum: ["NOTIFICATION", "ANNOUNCEMENT"],
      default: "NOTIFICATION",
    },
  },
  { timestamps: true },
);

export const NotificationModel = mongoose.model<INotification>(
  "notification",
  notificationSchema,
);
