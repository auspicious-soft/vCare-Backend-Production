import mongoose, { Document, Schema, Types } from "mongoose";

export interface IQuestions extends Document {
  courseId: Types.ObjectId;
  practiceExamId: Types.ObjectId;
  taskId: Types.ObjectId;
  lessonId: Types.ObjectId;
  domainName: string;
  isPractice: boolean;
  question: string;
  type: "MCQ" | "DND" | "FIB";

  mcq?: {
    text: string;
    isCorrect: boolean;
  }[];

  fib?: {
    correctOrder: number;
    answer: string;
  }[];

  dnd?: {
    pairs: {
      leftId: string;
      leftText: string;
      rightId: string;
    }[];
    options: {
      id: string;
      text: string;
    }[];
  };

  maxSelection: number;
  explaination: string;

  image?: string;
  status: "ACTIVE" | "DELETED" | "INACTIVE";

  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestions>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
    },
    practiceExamId: {
      type: Schema.Types.ObjectId,
      ref: "practiceexam",
    },
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: "lesson",
      default: null,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "task",
      default: null,
    },
    domainName: {
      type: String,
      default: null,
    },

    isPractice: {
      type: Boolean,
      default: false,
    },

    question: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["MCQ", "DND", "FIB"],
      required: true,
    },

    /* ---------- MCQ ---------- */
    mcq: [
      {
        text: { type: String, required: true },
        isCorrect: { type: Boolean, required: true },
      },
    ],

    /* ---------- FILL IN THE BLANK ---------- */
    fib: [
      {
        correctOrder: { type: Number, required: true },
        answer: { type: String, required: true },
      },
    ],

    /* ---------- DRAG & DROP ---------- */
    dnd: {
      pairs: [
        {
          leftId: { type: String, required: true },
          leftText: { type: String, required: true },
          rightId: { type: String, required: true },
        },
      ],
      options: [
        {
          id: { type: String, required: true },
          text: { type: String, required: true },
        },
      ],
    },

    maxSelection: {
      type: Number,
      required: true,
    },

    explaination: {
      type: String,
    },

    image: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

export const QuestionModel = mongoose.model<IQuestions>(
  "questions",
  questionSchema,
);
