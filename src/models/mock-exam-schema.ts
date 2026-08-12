import mongoose, { Document, Schema, Types } from "mongoose";

export interface IMockExam extends Document {
  order: number;
  courseId: Types.ObjectId;
  name: string;
  numberOfQuestions: number;
  timeInMin: string;
  price: number;
  isRandom: boolean;
  instructions: string;

  syllabus: {
    domain: string;
    percentage: number;
  }[];

  passingPercentage: number;

  remarks: {
    start: number;
    end: number;
    remarks: string;
  }[];

  status: "ACTIVE" | "INACTIVE" | "DELETED";
  createdAt?: Date;
  updatedAt?: Date;
}

const mockExamSchema = new Schema<IMockExam>(
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

    numberOfQuestions: {
      type: Number,
      required: true,
      min: 1,
    },

    timeInMin: {
      type: String,
      required: true,
    },

    instructions: {
      type: String,
      default: "",
    },

    price: {
      type: Number,
      default: 0,
      min: 0,
    },

    isRandom: {
      type: Boolean,
      default: false,
    },

    syllabus: [
      {
        domain: {
          type: String,
          required: true,
        },
        percentage: {
          type: Number,
          required: true,
          min: 0,
          max: 100,
        },
      },
    ],

    passingPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    remarks: [
      {
        start: {
          type: Number,
          required: true,
        },
        end: {
          type: Number,
          required: true,
        },
        remarks: {
          type: String,
          required: true,
        },
      },
    ],

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "DELETED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

export const MockExamModel = mongoose.model<IMockExam>(
  "mockexam",
  mockExamSchema,
);
