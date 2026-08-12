import mongoose, { Document, Schema, Types } from "mongoose";

export interface IMockExamQuestion extends Document {
  examId: Types.ObjectId;
  questionId: Types.ObjectId;
  isCorrect: Boolean | null;
  answerJson: any;
  isAttempted: Boolean;
  createdAt?: Date;
  updatedAt?: Date;

}

const mockExamQuestionSchema = new Schema<IMockExamQuestion>(
  {
    examId: {
      type: Schema.Types.ObjectId,
      ref: "mockexamresult",
    },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "questions",
    },
    isCorrect: {
      type: Boolean,
      default: null,
    },
    isAttempted: {
      type: Boolean,
      default: false,
    },
    answerJson:{
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

export const MockExamQuestionModel = mongoose.model<IMockExamQuestion>(
  "mockexamquestion",
  mockExamQuestionSchema,
);
