import mongoose, { Document, Schema, Types } from "mongoose";

export interface IIssueCertificate extends Document {
	userId: Types.ObjectId;
	userName?: string;
	userEmail?: string;
	templateId?: Types.ObjectId;
	status: "PENDING" | "ISSUED";
	certificatePng: string;
	certificatePdf: string;
	courseId: Types.ObjectId;
	completedAt?: Date;
	moduleType: string;
	moduleTypeId: Types.ObjectId;
	issuedAt: Date;
	createdAt?: Date;
	updatedAt?: Date;
}

const IssueCertificateSchema = new Schema<IIssueCertificate>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: "user",
		},
		userName: {
			type: String,
			default: null,
		},
		userEmail: {
			type: String,
			default: null,
		},
		templateId: {
			type: Schema.Types.ObjectId,
			ref: "CertificateTemplate",
			default: null,
		},
		status: {
			type: String,
			enum: ["PENDING", "ISSUED"],
			default: "PENDING",
		},
		certificatePng: {
			type: String,
			default: null,
		},
		certificatePdf: {
			type: String,
			default: null,
		},
		courseId: {
			type: Schema.Types.ObjectId,
			ref: "course",
		},
		moduleType: {
			type: String,
			enum: ["lessons", "mockexam","other"],
			default: null,
		},
		moduleTypeId: {
			type: Schema.Types.ObjectId,
			ref: "mockexamresult",
			default: null,
		},
		completedAt: {
			type: Date,
			default: null,
		},
		issuedAt: {
			type: Date,
			default: null,
		},
	},
	{ timestamps: true },
);

export const IssueCertificateModel = mongoose.model<IIssueCertificate>("issuecertificate", IssueCertificateSchema);
