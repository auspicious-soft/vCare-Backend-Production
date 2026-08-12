import type { Request, Response } from "express";
import { CertificateTemplateModel, type IDefaultVariable } from "../models/template-schema.js";
import { UserModel } from "../models/user-schema.js";
import { MockExamResultModel } from "../models/mock-exam-result-schema.js";
import { generateCertificate } from "../utils/certificate-generation.js";
import { IssueCertificateModel } from "../models/issue-certificate-schema.js";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import { uploadFileToS3 } from "../config/s3.js";
import { sendCertificateIssuedEmail, sendEmailVerificationMail } from "../utils/mail-helper.js";
import { AdminModel } from "../models/admin-schema.js";
import { CourseModel } from "../models/course-schema.js";
import { Parser } from "json2csv";
import { getS3Url } from "../utils/helpers.js";
import { updateFileInUseByUrl } from "./files-controller.js";
import { getFileUrl } from "../helpers/index.js";

const normalizeString = (value: unknown): string | undefined => {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
};

// These optional certificate values must be stored as null when cleared so a
// previous value cannot be reused when a certificate is generated.
const normalizeNullableString = (value: unknown): string | null => normalizeString(value) ?? null;

const hasOwn = (value: unknown, key: string): boolean =>
	Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));

const formatContactHours = (value: unknown): string | undefined => {
	const text = normalizeString(value);
	if (!text) return undefined;

	const hhmmMatch = text.match(/^(\d{1,2}):(\d{2})$/);
	if (!hhmmMatch) return text;

	const hours = Number(hhmmMatch[1]);
	const minutes = Number(hhmmMatch[2]);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return text;

	const hourLabel = `${hours} hour${hours === 1 ? "" : "s"}`;
	const minuteLabel = `${minutes} minute${minutes === 1 ? "" : "s"}`;
	return `${hourLabel} ${minuteLabel}`;
};

const formatContactHoursForResponse = (value: unknown): string | null | undefined => {
	if (value === null) return null;
	const text = normalizeString(value);
	if (!text) return undefined;

	const match = text.match(/^(\d+)\s+hour(?:s)?\s+(\d+)\s+minute(?:s)?$/i);
	if (!match) return text;

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return text;

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const mapTemplateResponse = (template: any) => {
	if (!template) return template;
	const plain = typeof template.toObject === "function" ? template.toObject() : template;
	return {
		...plain,
		defaults: {
			...plain.defaults,
			totalContactHours: formatContactHoursForResponse(plain?.defaults?.totalContactHours),
		},
	};
};

const getTemplateImageUrls = (template: any): string[] => {
	if (!template) return [];

	const urls = new Set<string>();
	const add = (value: unknown) => {
		const parsed = normalizeString(value);
		if (parsed) urls.add(parsed);
	};

	add(template.backgroundImage);
	add(template?.defaults?.assets?.trainerSignature);
	add(template?.defaults?.assets?.pmiLogo);
	add(template?.defaults?.assets?.companyLogo);
	add(template?.defaults?.assets?.badgeLogo);

	if (Array.isArray(template.images)) {
		for (const image of template.images) {
			add(image?.defaultUrl);
		}
	}

	return Array.from(urls);
};

const parseTemplateVariables = (payload: Record<string, unknown>): IDefaultVariable[] => {
	let input = payload.variables;

	if (typeof input === "string") {
		try {
			input = JSON.parse(input);
		} catch {
			input = undefined;
		}
	}

	if (Array.isArray(input) && input.length > 0) {
		return input
			.slice(0, 3)
			.map((item: any, index: number) => {
				const key = normalizeString(item?.key) || `var${index + 1}`;
				const label = normalizeString(item?.label);
				const value = normalizeString(item?.value);
				if (!label) return null;
				return value ? { key, label, value } : { key, label };
			})
			.filter(Boolean) as IDefaultVariable[];
	}

	const fallback: IDefaultVariable[] = [];
	for (let i = 1; i <= 3; i += 1) {
		const label = normalizeString(payload[`variable${i}`]);
		const value = normalizeString(payload[`value${i}`] ?? payload[`variable${i}Value`]);
		if (label) {
			fallback.push(value ? { key: `var${i}`, label, value } : { key: `var${i}`, label });
		}
	}
	return fallback;
};

const buildVariableFields = (variableEntries: IDefaultVariable[]) => {
	return variableEntries.flatMap((item, index) => {
		const y = 939 + index * 56;
		return [
			{
				key: `${item.key}Label`,
				x: 540,
				y,
				fontSize: 26,
				fontFamily: "Times New Roman",
				color: "#1f2937",
			},
			{
				key: `${item.key}Value`,
				x: 928,
				y,
				fontSize: 26,
				fontFamily: "Times New Roman",
				color: "#1f2937",
				align: "right" as const,
			},
		];
	});
};

const applyVariableFields = (fields: any[] | undefined, oldVariableKeys: string[], variableEntries: IDefaultVariable[]) => {
	const removeKeys = new Set(oldVariableKeys.flatMap((key) => [`${key}Label`, `${key}Value`]));
	const cleanedFields = (Array.isArray(fields) ? fields : []).filter((field: any) => !removeKeys.has(field?.key));
	const variableFields = buildVariableFields(variableEntries);

	const pmiATPIndex = cleanedFields.findIndex((field: any) => field?.key === "pmiATP");
	if (pmiATPIndex === -1) {
		return [...cleanedFields, ...variableFields];
	}

	return [...cleanedFields.slice(0, pmiATPIndex), ...variableFields, ...cleanedFields.slice(pmiATPIndex)];
};

export const createCertificateTemplate = async (req: Request, res: Response) => {
	try {
		const { courseId, templateType, templateTypeId, templateName, status, courseName, pduClaimCode, deliveryFormat, totalPDUs, totalPDUsClaimable, totalContactHours, totalContactHoursEligible, trainerName, pmiATP, atpName, issuingCompany, backgroundImage, trainerSignature, pmiLogo, companyLogo, badgeLogo } = req.body;

		const parsedTemplateName = normalizeString(templateName);
		if (!parsedTemplateName) {
			return res.status(400).json({ success: false, error: "templateName is required" });
		}

		const variableEntries = parseTemplateVariables(req.body as Record<string, unknown>);
		const variableFields = buildVariableFields(variableEntries);

		const template = {
			templateName: parsedTemplateName,
			status: normalizeString(status) === "inactive" ? "inactive" : "active",
			backgroundImage: normalizeString(backgroundImage),
			variables: variableEntries.map((item) => ({
				key: item.key,
				label: item.label,
			})),
			defaults: {
				templateType: normalizeString(templateType),
				templateTypeId: normalizeString(templateTypeId),
				courseId: normalizeString(courseId),
				courseName: normalizeString(courseName),
				pduClaimCode: normalizeNullableString(pduClaimCode),
				deliveryFormat: normalizeString(deliveryFormat),
				totalPDUs: normalizeNullableString(totalPDUsClaimable ?? totalPDUs),
				totalContactHours: normalizeNullableString(totalContactHoursEligible ?? totalContactHours),
				trainerName: normalizeString(trainerName),
				pmiATP: normalizeString(pmiATP),
				atpName: normalizeNullableString(atpName),
				issuingCompany: normalizeString(issuingCompany),
				variables: variableEntries,
				assets: {
					trainerSignature: normalizeString(trainerSignature),
					pmiLogo: normalizeString(pmiLogo),
					companyLogo: normalizeString(companyLogo),
					badgeLogo: normalizeString(badgeLogo),
				},
			},
			layout: {
				width: 1498,
				height: 1060,
				backgroundColor: "#fff",
			},
			staticTexts: [],
			fields: [
				{
					key: "name",
					x: 530,
					y: 550,
					fontSize: 66,
					fontFamily: "Times New Roman",
					fontWeight: "bold",
					color: "#111827",
					align: "center" as const,
				},
				{
					key: "courseName",
					x: 530,
					y: 695,
					fontSize: 54,
					fontFamily: "Times New Roman",
					fontWeight: "bold",
					color: "#143d72",
					align: "center" as const,
					maxWidth: 760,
					lineHeight: 62,
				},
				{
					key: "pduClaimCode",
					x: 128,
					y: 829,
					fontSize: 26,
					fontFamily: "Times New Roman",
					color: "#1f2937",
				},
				{
					key: "deliveryFormat",
					x: 128,
					y: 884,
					fontSize: 26,
					fontFamily: "Times New Roman",
					color: "#1f2937",
				},
				{
					key: "totalPDUs",
					x: 128,
					y: 939,
					fontSize: 26,
					fontFamily: "Times New Roman",
					color: "#1f2937",
				},
				{
					key: "totalContactHours",
					x: 128,
					y: 994,
					fontSize: 26,
					fontFamily: "Times New Roman",
					color: "#1f2937",
				},
				...variableFields,
				{
					key: "pmiATP",
					x: 128,
					y: 1180,
					fontSize: 34,
					fontFamily: "Times New Roman",
					color: "#1f2937",
				},
				{
					key: "trainerName",
					x: 128,
					y: 1107,
					fontSize: 42,
					fontFamily: "Times New Roman",
					fontWeight: "bold",
					color: "#111827",
				},
				{
					key: "atpName",
					x: 578,
					y: 1180,
					fontSize: 34,
					fontFamily: "Times New Roman",
					color: "#1f2937",
				},
				{
					key: "issuingCompany",
					x: 128,
					y: 1258,
					fontSize: 34,
					fontFamily: "Times New Roman",
					color: "#1f2937",
				},
			],
			
			images: [
				{
					key: "badgeLogo",
					x: 430,
					y: 120,
					width: 200,
					height: 130,
					defaultUrl: normalizeString(badgeLogo),
				},
				{
					key: "trainerSignature",
					x: 395,
					y: 1062,
					width: 245,
					height: 66,
					defaultUrl: normalizeString(trainerSignature),
				},
				{
					key: "pmiLogo",
					x: 670,
					y: 1060,
					width: 220,
					height: 98,
					defaultUrl: normalizeString(pmiLogo),
				},
				{
					key: "companyLogo",
					x: 420,
					y: 1340,
					width: 220,
					height: 62,
					defaultUrl: normalizeString(companyLogo),
				},
			],
		};

		const saved = await CertificateTemplateModel.create(template);
		for (const imageUrl of getTemplateImageUrls(saved)) {
			await updateFileInUseByUrl({
				url: imageUrl,
				action: "increase",
				fileCategory: "Image",
				fileName: saved.templateName,
			});
		}
		return res.status(201).json({ success: true, data: saved });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to create template";
		return res.status(500).json({ success: false, error: message });
	}
};
export const updateCertificateTemplate = async (req: Request, res: Response) => {
	try {
		const { templateId, ...updates } = req.body;

		if (!templateId) {
			return res.status(400).json({
				success: false,
				error: "templateId is required",
			});
		}

		const existing: any = await CertificateTemplateModel.findById(templateId);

		if (!existing) {
			return res.status(404).json({
				success: false,
				error: "Template not found",
			});
		}

		// 🔥 Helper: deep merge (important)
		const mergeDeep = (target: any, source: any) => {
			for (const key in source) {
				if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
					target[key] = mergeDeep(target[key] || {}, source[key]);
				} else {
					target[key] = source[key];
				}
			}
			return target;
		};

		// Normalize simple fields if provided
		if (updates.templateName) {
			existing.templateName = normalizeString(updates.templateName);
		}

		if (updates.status) {
			existing.status = normalizeString(updates.status) === "inactive" ? "inactive" : "active";
		}

		if (updates.backgroundImage) {
			existing.backgroundImage = normalizeString(updates.backgroundImage);
		}

		// 🔥 Merge defaults safely
		if (updates.defaults) {
			existing.defaults = mergeDeep(existing.defaults || {}, updates.defaults);
		}

		// 🔥 Merge layout
		if (updates.layout) {
			existing.layout = mergeDeep(existing.layout || {}, updates.layout);
		}

		// ⚠️ Arrays → replace only if sent
		if (updates.fields) {
			existing.fields = updates.fields;
		}

		if (updates.images) {
			existing.images = updates.images;
		}

		if (updates.staticTexts) {
			existing.staticTexts = updates.staticTexts;
		}

		if (updates.variables) {
			existing.variables = updates.variables;
		}
		if (updates.courseName) {
			existing.defaults = existing.defaults || {};
			existing.defaults.courseName = normalizeString(updates.courseName);
		}
		if (updates.courseId) {
			existing.defaults = existing.defaults || {};
			existing.defaults.courseId = normalizeString(updates.courseId);
		}
		const oldImageUrls = getTemplateImageUrls(existing.toObject ? existing.toObject() : existing);
		if (updates.templateType) {
			existing.defaults = existing.defaults || {};
			existing.defaults.templateType = normalizeString(updates.templateType);
		}
		if (updates.templateTypeId !== undefined) {
			existing.defaults = existing.defaults || {};
			existing.defaults.templateTypeId = normalizeString(updates.templateTypeId);
		}
		if (hasOwn(updates, "pduClaimCode")) {
			existing.defaults = existing.defaults || {};
			existing.defaults.pduClaimCode = normalizeNullableString(updates.pduClaimCode);
		}
		if (updates.deliveryFormat) {
			existing.defaults = existing.defaults || {};
			existing.defaults.deliveryFormat = normalizeString(updates.deliveryFormat);
		}
		if (hasOwn(updates, "totalPDUsClaimable") || hasOwn(updates, "totalPDUs")) {
			existing.defaults = existing.defaults || {};
			existing.defaults.totalPDUs = normalizeNullableString(
				hasOwn(updates, "totalPDUsClaimable") ? updates.totalPDUsClaimable : updates.totalPDUs,
			);
		}
		if (hasOwn(updates, "totalContactHoursEligible") || hasOwn(updates, "totalContactHours")) {
			existing.defaults = existing.defaults || {};
			existing.defaults.totalContactHours = normalizeNullableString(
				hasOwn(updates, "totalContactHoursEligible") ? updates.totalContactHoursEligible : updates.totalContactHours,
			);
		}
		if (updates.trainerName) {
			existing.defaults = existing.defaults || {};
			existing.defaults.trainerName = normalizeString(updates.trainerName); 
		}
		if (updates.pmiATP) {
			existing.defaults = existing.defaults || {};
			existing.defaults.pmiATP = normalizeString(updates.pmiATP);
		}
		if (hasOwn(updates, "atpName")) {
			existing.defaults = existing.defaults || {};
			existing.defaults.atpName = normalizeNullableString(updates.atpName);
		}
		if (updates.issuingCompany) {
			existing.defaults = existing.defaults || {};
			existing.defaults.issuingCompany = normalizeString(updates.issuingCompany);
		}
		if (updates.trainerSignature || updates.pmiLogo || updates.companyLogo || updates.badgeLogo) {
			existing.defaults = existing.defaults || {};
			existing.defaults.assets = existing.defaults.assets || {};
			if (updates.trainerSignature) existing.defaults.assets.trainerSignature = normalizeString(updates.trainerSignature);
			if (updates.pmiLogo) existing.defaults.assets.pmiLogo = normalizeString(updates.pmiLogo);
			if (updates.companyLogo) existing.defaults.assets.companyLogo = normalizeString(updates.companyLogo);
			if (updates.badgeLogo) existing.defaults.assets.badgeLogo = normalizeString(updates.badgeLogo);
		}
		if (Array.isArray(updates.variables)) {
			const oldVariableKeys = Array.isArray(existing.variables) ? existing.variables.map((v: any) => normalizeString(v?.key)).filter(Boolean) : [];

			const parsedVariables = updates.variables
				.slice(0, 3)
				.map((v: any, idx: number) => ({
					key: normalizeString(v?.key) || `var${idx + 1}`,
					label: normalizeString(v?.label) || "",
					value: normalizeString(v?.value),
				}))
				.filter((v: any) => v.label);

			existing.variables = parsedVariables.map((v: any) => ({
				key: v.key,
				label: v.label,
			}));

			existing.defaults = existing.defaults || {};
			existing.defaults.variables = parsedVariables.map((v: any) => (v.value ? { key: v.key, label: v.label, value: v.value } : { key: v.key, label: v.label }));
			existing.fields = applyVariableFields(existing.fields, oldVariableKeys, existing.defaults.variables);
		}

		// Optional: regenerate variable fields if FE sends variable inputs
		if (updates.variablesInput) {
			const oldVariableKeys = Array.isArray(existing.variables) ? existing.variables.map((v: any) => normalizeString(v?.key)).filter(Boolean) : [];
			const variableEntries = parseTemplateVariables(updates.variablesInput);

			existing.variables = variableEntries.map((v) => ({
				key: v.key,
				label: v.label,
			}));

			existing.defaults = existing.defaults || {};
			existing.defaults.variables = variableEntries;
			existing.fields = applyVariableFields(existing.fields, oldVariableKeys, variableEntries);
		}

		await existing.save();
		const newImageUrls = getTemplateImageUrls(existing.toObject ? existing.toObject() : existing);

		const oldSet = new Set(oldImageUrls);
		const newSet = new Set(newImageUrls);

		for (const imageUrl of oldSet) {
			if (!newSet.has(imageUrl)) {
				await updateFileInUseByUrl({
					url: imageUrl,
					action: "decrease",
					fileCategory: "Image",
					fileName: existing.templateName,
				});
			}
		}

		for (const imageUrl of newSet) {
			if (!oldSet.has(imageUrl)) {
				await updateFileInUseByUrl({
					url: imageUrl,
					action: "increase",
					fileCategory: "Image",
					fileName: existing.templateName,
				});
			}
		}

		return res.json({
			success: true,
			data: existing,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Update failed";
		return res.status(500).json({ success: false, error: message });
	}
};
export const getCertificateTemplate = async (req: Request, res: Response) => {
	try {
		let query;
		const { search, page = 1, limit = 10 } = req.query;

		const pageNumber = Math.max(Number(page), 1);
		const pageSize = Math.max(Number(limit), 10);
		const skip = (pageNumber - 1) * pageSize;
		if (search) {
			query = {
				$or: [{ templateName: { $regex: search, $options: "i" } }, { "defaults.courseName": { $regex: search, $options: "i" } }],
			};
		}
		const total = await CertificateTemplateModel.countDocuments(query);
		const totalPages = Math.ceil(total / pageSize);
		const templates = await CertificateTemplateModel.find({ ...query })
			.populate("defaults.courseId")
			.populate("defaults.templateTypeId")
			.select("defaults templateName status")
			.skip(skip)
			.limit(pageSize)
			.sort({ createdAt: -1 });

		return res.json({
			success: true,
			message: "Templates fetched successfully",
			data: templates.map(mapTemplateResponse),
			pagination: {
				totalCount: total,
				totalPages,
				page: pageNumber,
				limit: pageSize,
				next: pageNumber < totalPages,
				previous: pageNumber > 1,
			},
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Update failed";
		return res.status(500).json({ success: false, error: message });
	}
};
export const getCertificateTemplateById = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const template = await CertificateTemplateModel.findById(id).populate("defaults.courseId").populate("defaults.templateTypeId").select("defaults templateName status").sort({ createdAt: -1 });

		return res.json({
			success: true,
			message: "Templates fetched successfully",
			data: mapTemplateResponse(template),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Update failed";
		return res.status(500).json({ success: false, error: message });
	}
};
export const deleteCertificateTemplate = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		if (!id) {
			return res.status(400).json({
				success: false,
				error: "templateId is required",
			});
		}
		const existing: any = await CertificateTemplateModel.findByIdAndDelete(id);
		if (!existing) {
			return res.status(404).json({
				success: false,
				error: "Template not found",
			});
		}
		for (const imageUrl of getTemplateImageUrls(existing)) {
			await updateFileInUseByUrl({
				url: imageUrl,
				action: "decrease",
				fileCategory: "Image",
				fileName: existing.templateName,
			});
		}
		return res.json({
			success: true,
			message: "Template deleted successfully",
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Update failed";
		return res.status(500).json({ success: false, error: message });
	}
};

export const generateCertificateFromRequest = async (req: Request, res: Response) => {
	try {
		const { issueCertificateId, sendEmail, ...runtimeData } = req.body;
		if (!issueCertificateId) {
			return res.status(400).json({
				success: false,
				error: "issueCertificateId is required",
			});
		}

		let certificateResult: any = await IssueCertificateModel.findById(issueCertificateId);
		if (!certificateResult) {
			return res.status(404).json({
				success: false,
				error: "Issue certificate not found",
			});
		}
		const { courseId, moduleType, moduleTypeId, userId } = certificateResult;

		if (!courseId || !moduleType || !userId) {
			return res.status(400).json({
				success: false,
				error: "courseId, moduleType and userId are required",
			});
		}

		if (moduleType === "mockexam" && !moduleTypeId) {
			return res.status(400).json({
				success: false,
				error: "moduleTypeId is required for mockexam",
			});
		}

		const templateQuery: any = {
			status: "active",
			"defaults.courseId": courseId,
			"defaults.templateType": moduleType,
		};

		if (moduleType === "mockexam") {
			templateQuery["defaults.templateTypeId"] = moduleTypeId;
		}

		let template = (await CertificateTemplateModel.findOne(templateQuery).lean()) as any;
		const user = await UserModel.findById(userId).lean();

		if (!template && moduleType === "mockexam" && moduleTypeId) {
			const mockExamResult = await MockExamResultModel.findById(moduleTypeId).select("mockExamId").lean();
			if (mockExamResult?.mockExamId) {
				templateQuery["defaults.templateTypeId"] = mockExamResult.mockExamId;
				template = (await CertificateTemplateModel.findOne(templateQuery).lean()) as any;
			}
		}

		if (!template) {
			return res.status(404).json({
				success: false,
				error: "Template not found",
			});
		}

		if (!user) {
			return res.status(404).json({
				success: false,
				error: "User not found",
			});
		}

		const participantName = normalizeString(user.fullName) || [normalizeString(user.firstname), normalizeString(user.lastname)].filter(Boolean).join(" ");

		const courseNameFromCourseId = template?.defaults?.courseId ? normalizeString((await CourseModel.findById(template.defaults.courseId).select("name").lean())?.name) : undefined;

		const result = await generateCertificate(template, {
			...runtimeData,
			name: participantName || "Participant Name",
			courseName: courseNameFromCourseId || normalizeString(runtimeData.courseName) || normalizeString(template?.defaults?.courseName),
		});

		const { pngBuffer, pdfBuffer } = result;

		const [pngUpload, pdfUpload] = await Promise.all([uploadFileToS3(pngBuffer, `certificate-${Date.now()}.png`, "image/png", String(userId), "certificate", true), uploadFileToS3(pdfBuffer, `certificate-${Date.now()}.pdf`, "application/pdf", String(userId), "certificate", true)]);

		const certificatePng = pngUpload.key;
		const certificatePdf = pdfUpload.key;

		const savedIssueCertificate = await IssueCertificateModel.findOneAndUpdate(
			{
				_id: issueCertificateId,
			},
			{
				$set: {
					certificatePng,
					certificatePdf,
					status: "ISSUED",
					issuedAt: new Date(),
					templateId: template._id,
				},
				$setOnInsert: {
					completedAt: new Date(),
				},
			},
			{
				new: true,
				upsert: true,
			},
		);
		//todo send email to user related to certificate received
		if (sendEmail === true) {
			await sendCertificateIssuedEmail({
				fullName: user.fullName,
				email: user.email,
				certificateName: template.templateName,
				claimCode: template?.defaults?.pduClaimCode || undefined,
				pduText: template?.defaults?.totalPDUs || undefined,
				contactHoursText: template?.defaults?.totalContactHours || undefined,
				extraFields: template?.defaults?.variables || [],
				certificatePdf: getFileUrl(certificatePdf),
			});
		}
		return res.json({
			success: true,
			data: {
				issueCertificate: savedIssueCertificate,
				certificatePng,
				certificatePdf,
			},
		});
	} catch (err) {
		console.log("err: ", err);
		const message = err instanceof Error ? err.message : String(err);
		return res.status(500).json({ success: false, error: "Failed", message });
	}
};

export const generateCertificateFromModal = async (req: Request, res: Response) => {
	try {
		const { userId, userName, userEmail, templateId, sendEmail, completionDate, ...runtimeData } = req.body;

		if (!userId || !templateId || !userName || !userEmail || !completionDate) {
			return res.status(400).json({
				success: false,
				error: "userId, userName, userEmail, templateId and completionDate are required",
			});
		}

		const parsedSendEmail = normalizeString(sendEmail)?.toLowerCase();
		// if (parsedSendEmail !== "yes" && parsedSendEmail !== "no") {
		// 	return res.status(400).json({
		// 		success: false,
		// 		error: "sendEmail must be yes or no",
		// 	});
		// }

		const parsedCompletionDate = new Date(completionDate);
		if (Number.isNaN(parsedCompletionDate.getTime())) {
			return res.status(400).json({
				success: false,
				error: "completionDate is invalid",
			});
		}

		const [templateWithS3, user] = await Promise.all([CertificateTemplateModel.findById(templateId).lean(), UserModel.findById(userId).lean()]);

		if (!templateWithS3) {
			return res.status(404).json({
				success: false,
				error: "Template not found",
			});
		}

		const template = {...templateWithS3, defaults: {...templateWithS3.defaults, assets: {
			badgeLogo: getFileUrl(templateWithS3.defaults?.assets?.badgeLogo),
			companyLogo: getFileUrl(templateWithS3.defaults?.assets?.companyLogo),
			pmiLogo : getFileUrl(templateWithS3.defaults?.assets?.pmiLogo),
			trainerSignature: getFileUrl(templateWithS3.defaults?.assets?.trainerSignature)
		}}}

		if (!user) {
			return res.status(404).json({
				success: false,
				error: "User not found",
			});
		}

		const courseNameFromCourseId = template?.defaults?.courseId ? normalizeString((await CourseModel.findById(template.defaults.courseId).select("name").lean())?.name) : undefined;

		const result = await generateCertificate(template, {
			...runtimeData,
			name: normalizeString(userName) || normalizeString(user.fullName) || "Participant Name",
			courseName: courseNameFromCourseId || normalizeString(runtimeData.courseName) || normalizeString(template?.defaults?.courseName),
			completionDate: parsedCompletionDate.toISOString().split("T")[0],
		});

		const { pngBuffer, pdfBuffer } = result;

		const [pngUpload, pdfUpload] = await Promise.all([uploadFileToS3(pngBuffer, `certificate-${Date.now()}.png`, "image/png", String(userId), "certificate", true), uploadFileToS3(pdfBuffer, `certificate-${Date.now()}.pdf`, "application/pdf", String(userId), "certificate", true)]);

		const certificatePng = pngUpload.key;
		const certificatePdf = pdfUpload.key;

		const certificateEntry = await IssueCertificateModel.create({
			userId,
			userName: normalizeString(userName),
			userEmail: normalizeString(userEmail)?.toLowerCase(),
			templateId,
			sendEmail: parsedSendEmail,
			courseId: template.defaults?.courseId || null,
			moduleType: template.defaults?.templateType || null,
			moduleTypeId: template.defaults?.templateTypeId || null,
			completedAt: parsedCompletionDate,
			status: "ISSUED",
			issuedAt: new Date(),
			certificatePng,
			certificatePdf,
		});

		if (parsedSendEmail === "yes") {
			await sendCertificateIssuedEmail({
				fullName: normalizeString(userName) || user.fullName,
				email: normalizeString(userEmail)?.toLowerCase() || user.email,
				certificateName: template.templateName,
				claimCode: template?.defaults?.pduClaimCode || undefined,
				pduText: template?.defaults?.totalPDUs || undefined,
				contactHoursText: template?.defaults?.totalContactHours || undefined,
				certificatePdf: getFileUrl(certificatePdf),
				extraFields: template?.defaults?.variables || [],
			});
		}

		return res.json({
			success: true,
			data: {
				issueCertificate: certificateEntry,
				certificatePng,
				certificatePdf,
			},
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return res.status(500).json({ success: false, error: "Failed", message });
	}
};

export const createIssuingCertificate = async (req: any, res: Response) => {
	try {
		let { courseId, userId, moduleType, moduleTypeId, completedAt } = req;
		const exisitingDetails = await IssueCertificateModel.findOne({
			courseId,
			userId,
			moduleType,
			moduleTypeId,
		});
		if (exisitingDetails) {
			return;
		}
		const certificateEntry = await IssueCertificateModel.create({
			courseId,
			userId,
			moduleType,
			moduleTypeId,
			completedAt,
		});

		return;
	} catch (err: any) {
		if (err.message) {
			return BADREQUEST(res, err.message);
		}
		return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
	}
};
export const getIssuingCertificate = async (req: Request, res: Response) => {
	try {
		const search = req.query.search as string;
		const sort = req.query.sort as string;
		// pagination params
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 10;
		const skip = (page - 1) * limit;
		const sortObj: Record<string, 1 | -1> = {};

		const adminDetails = await AdminModel.findById({
			_id: (req as any).admin._id,
		});
		const pipeline: any[] = [
			{
				$lookup: {
					from: "users",
					localField: "userId",
					foreignField: "_id",
					as: "user",
				},
			},
			{ $unwind: "$user" },

			{
				$lookup: {
					from: "courses",
					localField: "courseId",
					foreignField: "_id",
					as: "course",
				},
			},
			{ $unwind: "$course" },
		];

		// status filter
		if (req.query.status) {
			pipeline.push({
				$match: { status: req.query.status },
			});
		}

		// search filter
		if (search) {
			pipeline.push({
				$match: {
					$or: [{ "user.fullName": { $regex: search, $options: "i" } }, { "course.name": { $regex: search, $options: "i" } }, { moduleType: { $regex: search, $options: "i" } }],
				},
			});
		}
		if (req.query.statusSort) {
			sortObj.status = req.query.statusSort === "desc" ? -1 : 1;
		}

		if (req.query.completedAtSort) {
			sortObj.completedAt = req.query.completedAtSort === "desc" ? -1 : 1;
		}

		if (Object.keys(sortObj).length === 0) {
			sortObj.completedAt = -1; // default
		}

		pipeline.push({
			$sort: sortObj,
		});
		// 👉 Use FACET for pagination + total count
		pipeline.push({
			$facet: {
				data: [{ $skip: skip }, { $limit: limit }],
				totalCount: [{ $count: "count" }],
			},
		});

		const result = await IssueCertificateModel.aggregate(pipeline);

		const data = result[0]?.data || [];
		const total = result[0]?.totalCount[0]?.count || 0;

		return OK(
			res,
			{
				sendEmail: adminDetails?.sendEmail,
				data: data?.map((val: any) => {
					if (val.certificatePng || val.certificatePdf) {
						return { ...val, certificatePng: getFileUrl(val.certificatePng), certificatePdf: getFileUrl(val.certificatePdf) };
					} else {
						return val;
					}
				}),
				pagination: {
					total,
					page,
					limit,
					totalPages: Math.ceil(total / limit),
				},
			},
			"Retrieved successfully",
		);
	} catch (err: any) {
		if (err.message) {
			return BADREQUEST(res, err.message);
		}
		return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
	}
};

export const updateAdminSendEmail = async (req: Request, res: Response) => {
	try {
		const { sendEmail, sendReportEmail } = req.query;
		await AdminModel.updateOne({ _id: (req as any).admin._id }, { sendEmail, sendReportEmail });
		return OK(res, {}, "Updated successfully");
	} catch (err: any) {
		if (err.message) {
			return BADREQUEST(res, err.message);
		}
		return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
	}
};
export const exportIssuedCertificatesCSV = async (req: Request, res: Response) => {
	try {
		const issuedCertificates = await IssueCertificateModel.aggregate([
			{
				$match: {
					status: "ISSUED",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "userId",
					foreignField: "_id",
					as: "user",
				},
			},
			{
				$unwind: {
					path: "$user",
					preserveNullAndEmptyArrays: true,
				},
			},
			{
				$lookup: {
					from: "courses",
					localField: "courseId",
					foreignField: "_id",
					as: "course",
				},
			},
			{
				$unwind: {
					path: "$course",
					preserveNullAndEmptyArrays: true,
				},
			},
			{
				$sort: {
					completedAt: -1,
					createdAt: -1,
				},
			},
		]);

		if (!issuedCertificates.length) {
			return OK(res, [], "No issued certificate");
		}

		const formatDate = (value?: Date | string | null) => {
			if (!value) return "";
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return "";
			const dd = String(date.getDate()).padStart(2, "0");
			const mm = String(date.getMonth() + 1).padStart(2, "0");
			const yyyy = date.getFullYear();
			return `${dd}-${mm}-${yyyy}`;
		};

		const csvData = issuedCertificates.map((item: any) => {
			const fullName = item?.user?.fullName || item?.userName || [item?.user?.firstname, item?.user?.lastname].filter(Boolean).join(" ");

			const email = item?.user?.email || item?.userEmail || "";

			return {
				"Comp. Date": formatDate(item?.completedAt || item?.issuedAt),
				"User Name": fullName || "",
				Email: email,
				"Course/Program": item?.course?.name || "",
				Status: "Sent",
				certificatePDF: getS3Url(item?.certificatePdf),
				certificatePng: getS3Url(item?.certificatePng),
			};
		});

		const fields = ["Comp. Date", "User Name", "Email", "Course/Program", "Status", "certificatePDF", "certificatePng"];
		const parser = new Parser({ fields });
		const csv = parser.parse(csvData);

		res.setHeader("Content-Type", "text/csv; charset=utf-8");
		res.setHeader("Content-Disposition", `attachment; filename="issued-certificates-${Date.now()}.csv"`);
		return res.send(csv);
	} catch (err: any) {
		if (err.message) {
			return BADREQUEST(res, err.message);
		}
		return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
	}
};
