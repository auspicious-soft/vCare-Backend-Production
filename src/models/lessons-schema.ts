import mongoose, { Document, Schema, Types } from "mongoose";

/* ---------- Lesson Item ---------- */
const lessonItemSchema = new Schema({
  lessonName: {
    type: String,
    required: true,
    trim: true,
  },
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
  duration: {
    type: String, // e.g. "10:30",
    default: null,
  },
  order: {
    type: Number,
    required: true,
  },
});

/* ---------- Interface ---------- */
export interface ILessons extends Document {
  courseId: Types.ObjectId;
  module: string | Types.ObjectId;
  order: number;
  price: number;
  moduleIntroduction: string;
  lessons: {
    lessonName: string;
    fileName: string;
    fileType: "VIDEO" | "PDF" | "IMAGE";
    fileLink: string;
    duration?: string;
  }[];
  status: "ACTIVE" | "DELETED" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

/* ---------- Main Schema ---------- */
const lessonSchema = new Schema<ILessons>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
    },
    module: {
      type: String, // or Schema.Types.ObjectId with ref
      required: true,
    },
    moduleIntroduction: {
      type: String,
      required: true,
    },
    order: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    lessons: {
      type: [lessonItemSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

/* ---------- Compound Index ---------- */
// Order should be unique per module

export const LessonModel = mongoose.model<ILessons>("lesson", lessonSchema);
