import mongoose, { Document, Schema, Types } from "mongoose";

export interface IBookmark extends Document {
  userId?: Types.ObjectId;
  moduleId?: Types.ObjectId;
  lessonsId?: Types.ObjectId;
  taskId?: Types.ObjectId;
  applicationSupportId?: Types.ObjectId;
  examStrategyId?: Types.ObjectId;
  questionId?: Types.ObjectId;
  questionModel?: "lessonquestion" | "domainQuestions";
  courseId: mongoose.Types.ObjectId;
  type:
    | "LESSON"
    | "TASK"
    | "APPLICATION_SUPPORT"
    | "EXAM_STRATEGY"
    | "QUESTION";

  isBookmarked: boolean;
  isAttempted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

const bookmarkSchema = new Schema<IBookmark>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      index: true,
      required: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
      required: true,
    },
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: "lesson",
      default: null,
    },

    lessonsId: {
      type: Schema.Types.ObjectId,
      ref: "lesson.lessons",
      default: null,
    },

    taskId: {
      type: Schema.Types.ObjectId,
      ref: "task",
      default: null,
    },

    applicationSupportId: {
      type: Schema.Types.ObjectId,
      ref: "applicationSupport.data",
      default: null,
    },

    examStrategyId: {
      type: Schema.Types.ObjectId,
      ref: "examStrategy.data",
      default: null,
    },

    // ✅ Dynamic Question Reference
    questionId: {
      type: Schema.Types.ObjectId,
      refPath: "questionModel",
      default: null,
    },

    // ✅ This decides which model questionId refers to
    questionModel: {
      type: String,
      enum: ["lessonquestion", "domainQuestions"],
      required: function (this: IBookmark) {
        return this.type === "QUESTION";
      },
    },

    type: {
      type: String,
      enum: [
        "LESSON",
        "TASK",
        "QUESTION",
        "APPLICATION_SUPPORT",
        "EXAM_STRATEGY",
      ],
      required: true,
    },

    isBookmarked: {
      type: Boolean,
      default: false,
    },

    isAttempted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const BookmarkModel = mongoose.model<IBookmark>(
  "bookmark",
  bookmarkSchema,
);
