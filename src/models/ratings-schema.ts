import mongoose, { Document, Schema, Types } from "mongoose";

export interface IRatings extends Document {
  courseId?: Types.ObjectId;
  userId?: Types.ObjectId;
  userName: String;
  company: String;
  title: String;
  source: String;
  feedback: String;
  stars: Number;
  status: "ACTIVE" | "INACTIVE";
  createdAt?: Date;
  updatedAt?: Date;
}

const ratingSchema = new Schema<IRatings>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    company: {
      type: String,
    },
    title: {
      type: String,
    },
    source: {
      type: String,
    },
    feedback: {
      type: String,
      required: true,
    },
    stars: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

export const RatingModel = mongoose.model<IRatings>("rating", ratingSchema);
