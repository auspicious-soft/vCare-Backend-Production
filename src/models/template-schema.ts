import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICertificateField {
	key: string;
	label?: string;

	x: number;
	y: number;

	fontSize: number;
	fontFamily?: string;
	fontWeight?: string;
	color?: string;

	align?: "left" | "center" | "right";

	maxWidth?: number;
	lineHeight?: number;
}

export interface IStaticText {
	text: string;
	x: number;
	y: number;
	fontSize: number;
	fontFamily?: string;
	color?: string;
}

export interface IImageField {
	key: string;
	x: number;
	y: number;
	width: number;
	height: number;
	defaultUrl?: string;
}

export interface IVariable {
	key: string;
	label: string;
}

export interface IDefaultVariable {
	key: string;
	label: string;
	value?: string;
}

export interface ITemplateDefaults {
	courseName?: string;
	courseId?: Types.ObjectId;
	templateType?: string;
	templateTypeId: Types.ObjectId;
	pduClaimCode?: string | null;
	deliveryFormat?: string;
	totalPDUs?: string | null;
	totalContactHours?: string | null;
	trainerName?: string;
	pmiATP?: string;
	atpName?: string | null;
	issuingCompany?: string;
	variables?: IDefaultVariable[];
	assets?: {
		trainerSignature?: string;
		pmiLogo?: string;
		companyLogo?: string;
		badgeLogo?: string;
	};
}

export interface ICertificateTemplate {
	templateName: string;
	status: "active" | "inactive";
	backgroundImage?: string;

	variables: IVariable[];
	defaults?: ITemplateDefaults;

	layout: {
		width: number;
		height: number;
		backgroundColor: string;
	};

	staticTexts: IStaticText[];
	fields: ICertificateField[];
	images: IImageField[];

	createdAt?: Date;
	updatedAt?: Date;
}

export interface ICertificateTemplateDoc extends ICertificateTemplate, Document {}

//////////////////////////////////////////////////////
// SCHEMAS
//////////////////////////////////////////////////////

const FieldSchema = new Schema(
	{
		key: { type: String, required: true },
		label: String,

		x: Number,
		y: Number,

		fontSize: Number,
		fontFamily: { type: String, default: "Arial" },
		fontWeight: { type: String, default: "normal" },

		color: { type: String, default: "#000" },

		align: {
			type: String,
			enum: ["left", "center", "right"],
			default: "left",
		},

		maxWidth: Number,
		lineHeight: Number,
	},
	{ _id: false },
);

const StaticTextSchema = new Schema(
	{
		text: String,
		x: Number,
		y: Number,
		fontSize: Number,
		fontFamily: { type: String, default: "Arial" },
		color: { type: String, default: "#333" },
	},
	{ _id: false },
);

const ImageSchema = new Schema(
	{
		key: String,
		x: Number,
		y: Number,
		width: Number,
		height: Number,
		defaultUrl: String,
	},
	{ _id: false },
);

const VariableSchema = new Schema(
	{
		key: { type: String, required: true },
		label: { type: String, required: true },
	},
	{ _id: false },
);

const DefaultVariableSchema = new Schema(
	{
		key: { type: String, required: true },
		label: { type: String, required: true },
		value: { type: String },
	},
	{ _id: false },
);

//////////////////////////////////////////////////////
// MAIN MODEL
//////////////////////////////////////////////////////

const CertificateTemplateSchema = new Schema<ICertificateTemplateDoc>(
	{
		templateName: { type: String, required: true },

		status: {
			type: String,
			enum: ["active", "inactive"],
			default: "active",
		},

		backgroundImage: String,
		variables: [VariableSchema],
		defaults: {
			courseName: String,
			courseId: { type: Schema.Types.ObjectId, ref: "course" },
			templateType: {
				type: String,
				enum: ["mockexam", "lessons","other"],
				required: true,
			},
			templateTypeId: {
				type: Schema.Types.ObjectId,
				ref: "mockexam",
				default: null,
			},
			pduClaimCode: String,
			deliveryFormat: String,
			totalPDUs: String,
			totalContactHours: String,
			trainerName: String,
			pmiATP: String,
			atpName: String,
			issuingCompany: String,
			variables: [DefaultVariableSchema],
			assets: {
				trainerSignature: String,
				pmiLogo: String,
				companyLogo: String,
				badgeLogo: String,
			},
		},

		layout: {
			width: { type: Number, default: 1200 },
			height: { type: Number, default: 850 },
			backgroundColor: { type: String, default: "#ffffff" },
		},

		staticTexts: [StaticTextSchema],
		fields: [FieldSchema],
		images: [ImageSchema],
	},
	{ timestamps: true },
);

export const CertificateTemplateModel = mongoose.model<ICertificateTemplateDoc>("CertificateTemplate", CertificateTemplateSchema);
