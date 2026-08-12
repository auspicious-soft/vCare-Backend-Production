import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPracticeExamResult extends Document {
	userId: Types.ObjectId;
	attemptNumber: number;
	examId: Types.ObjectId;
	questionId: Types.ObjectId;
	isCorrect: Boolean | null;
	isAttempted: Boolean;
	timeTaken: String;
	status: "ACTIVE" | "INACTIVE";
	answerJson: any;
	createdAt?: Date;
	updatedAt?: Date;
}

const practiceExamResultSchema = new Schema<IPracticeExamResult>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: "user",
		},
		attemptNumber: {
			type: Number,
			required: true,
		},
		examId: {
			type: Schema.Types.ObjectId,
			ref: "practiceexam",
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
		timeTaken: {
			type: String,
			default: null,
		},
		status: {
			type: String,
			enum: ["ACTIVE", "INACTIVE"],
			default: "ACTIVE",
		},
		answerJson: {
			type: Schema.Types.Mixed,
			default: null,
		},
	},
	{ timestamps: true },
);

export const PracticeExamResultModel = mongoose.model<IPracticeExamResult>("practiceexamresult", practiceExamResultSchema);
