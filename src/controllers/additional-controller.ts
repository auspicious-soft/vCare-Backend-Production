import type { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import { CheckCourseExist, reportTypeMapper } from "../utils/helpers.js";
import { RatingModel } from "../models/ratings-schema.js";
import { ReportProblemModel } from "../models/report-problem-schema.js";
import { MockExamQuestionModel } from "../models/mock-exam-questions.js";
import { PracticeExamResultModel } from "../models/practice-exam-result-schema.js";
import { CompanyInfoModel } from "../models/company-info-schema.js";
import { NotificationModel } from "../models/notification-schema.js";
import { DateTime } from "luxon";
import { AdminModel } from "../models/admin-schema.js";
import { access } from "../utils/constant.js";
import bcrypt from "bcryptjs";

import {
  sendContactMailToAdmin,
  sendIssueResolvedEmailToUser,
  sendLoginCredentials,
} from "../utils/mail-helper.js";
import { QuestionModel } from "../models/questions-schema.js";
import { NavigationModel } from "../models/navigation-schema.js";
import { NotificationService } from "../config/fcm.js";
import { PurchaseModel } from "../models/purchase-schema.js";
import mongoose from "mongoose";
import { updateFileInUseByUrl } from "./files-controller.js";
import { UserModel } from "../models/user-schema.js";
import redis from "../config/redis.js";

export const getNavigations = async (req: Request, res: Response) => {
  try {
    const data = await NavigationModel.find();
    return OK(res, data, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const updateNavigations = async (req: Request, res: Response) => {
  try {
    const { name, key } = req.body;

    const data = await NavigationModel.findOneAndUpdate(
      { key },
      { $set: { key, name } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return OK(res, data, "Data Updated");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getRatingDropDown = async (req: Request, res: Response) => {
  try {
    const platforms = [
      "Facebook",
      "Youtube",
      "Linkedin",
      "Website",
      "iOS App",
      "Android App",
      "Instagram",
      "Pinterest",
      "Twitter",
      "Google",
      "Trustpilot",
    ] as any;
    return OK(res, platforms, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getRatings = async (req: Request, res: Response) => {
  try {
    let { page = 1, limit = 10, courseId } = req.query;

    const checkCourseId = await CheckCourseExist(courseId as string);
    if (typeof checkCourseId === "string") {
      throw new Error("Invalid course id");
    }

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    const [data, totalCount] = await Promise.all([
      await RatingModel.find({ status: "ACTIVE", courseId })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RatingModel.countDocuments({ status: "ACTIVE", courseId }),
    ]);
    const totalPages = Math.ceil(totalCount / limit);
    return OK(
      res,
      {
        data: data.map((val: any) => {
          return { ...val, createdAt: val.updatedAt };
        }),
        pagination: {
          totalCount,
          totalPages,
          page,
          limit,
          next: page < totalPages,
          previous: page > 1,
        },
      },
      "Data Fetched",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const createRating = async (req: Request, res: Response) => {
  try {
    const { courseId, userName, company, title, source, feedback, stars } =
      req.body;
    const checkCourseId = await CheckCourseExist(courseId as string);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    if (![1, 2, 3, 4, 5].includes(stars)) {
      throw new Error("Invalid Rating");
    }

    await RatingModel.create({
      courseId,
      userName,
      company,
      title,
      source,
      feedback,
      stars,
    });

    return OK(res, {}, "Data saved successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateRating = async (req: Request, res: Response) => {
  try {
    const { id, courseId, userName, company, title, source, feedback, stars } =
      req.body;

    const rating = await RatingModel.findById(id);

    if (!rating) {
      throw new Error("Rating not found");
    }

    if (courseId) {
      const checkCourseId = await CheckCourseExist(courseId as string);
      if (typeof checkCourseId === "string") {
        throw new Error(checkCourseId);
      }
    }

    if (stars && ![1, 2, 3, 4, 5].includes(Number(stars))) {
      throw new Error("Invalid Rating");
    }

    const updatedData = await RatingModel.findByIdAndUpdate(
      id,
      {
        $set: {
          courseId: courseId ?? rating.courseId,
          userName: userName ?? rating.userName,
          company: company ?? rating.company,
          title: title ?? rating.title,
          source: source ?? rating.source,
          feedback: feedback ?? rating.feedback,
          stars: stars ?? rating.stars,
        },
      },
      { new: true },
    );

    return OK(res, updatedData, "Rating updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteRating = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;

    const rating = await RatingModel.findById(id);

    if (!rating) {
      throw new Error("Rating not found");
    }

    await RatingModel.findByIdAndDelete(id);

    return OK(res, {}, "Deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getReportedProblem = async (req: Request, res: Response) => {
  try {
    let { id, page = 1, limit = 10, search = "" } = req.query;

    const adminId = (req as any).admin._id;

    const adminDetails = await AdminModel.findById(adminId);

    const checkCourseId = await CheckCourseExist(id as string);

    if (typeof checkCourseId === "string") {
      return BADREQUEST(res, "Course is inactive or not found");
    }

    page = Number(page);
    limit = Number(limit);

    const skip = (page - 1) * limit;

    const matchStage: any = {
      courseId: new mongoose.Types.ObjectId(id as string),
    };

    const searchMatch =
      search && String(search).trim()
        ? {
            $or: [
              {
                "user.fullName": {
                  $regex: search,
                  $options: "i",
                },
              },
              {
                "user.email": {
                  $regex: search,
                  $options: "i",
                },
              },
            ],
          }
        : {};

    const [data, countResult] = await Promise.all([
      ReportProblemModel.aggregate([
        {
          $match: matchStage,
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
          $unwind: "$user",
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
          $unwind: "$course",
        },
        ...(Object.keys(searchMatch).length ? [{ $match: searchMatch }] : []),
        {
          $project: {
            _id: 1,
            message: 1,
            comments:1,
            createdAt: 1,
            emailSent: 1,
            resolvedAt: 1,
            resolvedBy: 1,
            type: 1,
            relevantId: 1,
            status: 1,
            identifier: 1,
            resolvedComments: 1,
            userId: {
              _id: "$user._id",
              fullName: "$user.fullName",
              email: "$user.email",
            },
            courseId: {
              _id: "$course._id",
              name: "$course.name",
            },
            courseName: "$course.name",
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
      ]),

      ReportProblemModel.aggregate([
        {
          $match: matchStage,
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
          $unwind: "$user",
        },
        ...(Object.keys(searchMatch).length ? [{ $match: searchMatch }] : []),
        {
          $count: "total",
        },
      ]),
    ]);

    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return OK(
      res,
      {
        data,
        sendReportEmail: adminDetails?.sendReportEmail,
        pagination: {
          totalCount,
          totalPages,
          page,
          limit,
          next: page < totalPages,
          previous: page > 1,
        },
      },
      "Data Fetched",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getReportedProblemById = async (req: Request, res: Response) => {
  try {
    let { id } = req.query;

    const data = await ReportProblemModel.findById(id)
      .select("comments relevantId userId type")
      .lean();

    if (!data) {
      throw new Error("Invalid report");
    }

    let questionData = null;

    if (data.type === "MOCK-EXAM" && data?.relevantId) {
      const getInfo = await MockExamQuestionModel.findById(data.relevantId)
        .populate("questionId")
        .lean();

      questionData = getInfo?.questionId;
    }

    if (data.type === "PRACTICE-EXAM" && data?.relevantId) {
      const getInfo = await PracticeExamResultModel.findById(data.relevantId)
        .populate("questionId")
        .lean();

      questionData = getInfo?.questionId;
    }

    if (data.type === "DOMAIN-TASK" && data?.relevantId) {
      const getInfo = await QuestionModel.findById(data.relevantId).lean();
      questionData = getInfo;
    }

    if (data.type === "LESSON-VIDEO" && data?.relevantId) {
      const getInfo = await QuestionModel.findById(data.relevantId).lean();
      questionData = getInfo;
    }

    return OK(res, { ...data, questionData }, "Fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateReportedProblemStatus = async (
  req: Request,
  res: Response,
) => {
  try {
    let { id, status, sendReportEmail, resolvedComments } = req.body;
    const adminId = (req as any).admin._id;
    if (status !== "DELETED" && status !== "RESOLVED") {
      throw new Error("Invalid status");
    }
    const checkExist: any = await ReportProblemModel.findById(id)
      .populate("userId")
      .populate("courseId");
    if (!checkExist) {
      throw new Error("Invalid report");
    }
    const userDetails: any = checkExist?.userId;

    await ReportProblemModel.findByIdAndUpdate(id, { $set: { status } });
    const issueTitle = `${checkExist?.courseId?.name} - ${checkExist?.type}`;
    const issueDescription = `${checkExist?.courseId?.name} - ${checkExist?.type} - ${checkExist?.comments}`;
    if (sendReportEmail && !checkExist?.emailSent && status === "RESOLVED") {
      const result = await sendIssueResolvedEmailToUser({
        fullName: userDetails?.firstname || "",
        email: userDetails?.email,
        issueTitle: issueTitle,
        issueDescription: issueDescription,
        resolutionMessage: resolvedComments || "",
      });
      if (result) {
        await ReportProblemModel.findByIdAndUpdate(id, {
          $set: {
            emailSent: true,
            resolvedComments,
            resolvedAt: new Date(),
            resolvedBy: adminId,
          },
        });
      }
    }

    return OK(res, {}, "Updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const createUpdateCompanyInfo = async (req: Request, res: Response) => {
  try {
    let {
      title,
      companyName,
      logo,
      description,
      address,
      primaryEmail,
      secondaryEmail,
      primaryContact,
      secondaryContact,
      termAndConditions,
      privacyPolicy,
      refuncPolicy,
    } = req.body;

    const checkExist = await CompanyInfoModel.find();

    if (checkExist.length) {
      await CompanyInfoModel.updateOne(
        {},
        {
          title,
          companyName,
          logo,
          description,
          address,
          primaryEmail,
          secondaryEmail,
          primaryContact,
          secondaryContact,
          termAndConditions,
          privacyPolicy,
          refuncPolicy,
        },
      );
    } else {
      await CompanyInfoModel.create({
        title,
        companyName,
        logo,
        description,
        address,
        primaryEmail,
        secondaryEmail,
        primaryContact,
        secondaryContact,
        termAndConditions,
        privacyPolicy,
        refuncPolicy,
      });
    }
    const logoUrl = logo ?? (checkExist[0]?.logo as string | undefined);

    if (logoUrl) {
      await updateFileInUseByUrl({
        url: logoUrl,
        action: "increase",
        fileCategory: "Image",
        fileName: companyName || title || "Company Logo",
      });
    }
    return OK(res, {}, "Updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const updatePlansDuration = async (req: Request, res: Response) => {
  try {
    let { individualDuration, freeTrailDuration } = req.body;

    const checkExist = await CompanyInfoModel.find();

    if (checkExist.length) {
      await CompanyInfoModel.updateOne(
        {},
        {
          individualDuration,
          freeTrailDuration,
        },
      );
    }
    // const cacheKey = "DASHBOARD:PLAN_DURATION";
    // await redis.del(cacheKey);
    return OK(res, {}, "Updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getCompanyInfo = async (req: Request, res: Response) => {
  try {
    const data = await CompanyInfoModel.findOne({});

    return OK(res, data, "Fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const createNotification = async (req: Request, res: Response) => {
  try {
    const { title, courseId, description, type, date, time, timeZone } =
      req.body;

    const checkCourseId = await CheckCourseExist(courseId as string);
    if (typeof checkCourseId === "string") {
      throw new Error("Invalid course id");
    }

    if (!title || !courseId || !type || !date || !time || !timeZone) {
      throw new Error("Required fields are missing");
    }

    if (type !== "NOTIFICATION" && type !== "ANNOUNCEMENT") {
      throw new Error("Invalid notification type");
    }

    const userData = await PurchaseModel.find({
      purchasedProduct: {
        $in: [courseId, new mongoose.Types.ObjectId(courseId)],
      },
    })
      .populate("userId")
      .lean();

    // await NotificationService(userData, title, description);

    const utcDate = DateTime.fromFormat(`${date} ${time}`, "yyyy-MM-dd HH:mm", {
      zone: timeZone,
    }).toUTC();

    await NotificationModel.create({
      title,
      courseId,
      description,
      type,
      sentOn: utcDate.toISO(),
    });

    return OK(res, {}, "Data saved successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const getNotifications = async (req: Request, res: Response) => {
  try {
    let { page = 1, limit = 10, courseId, search, type } = req.query;

    const checkCourseId = await CheckCourseExist(courseId as string);
    if (typeof checkCourseId === "string") {
      throw new Error("Invalid course id");
    }

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    // ✅ Build dynamic filter
    const filter: any = {
      courseId,
    };

    // ✅ Add search condition
    if (search && typeof search === "string") {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const [data, totalCount] = await Promise.all([
      NotificationModel.find({ ...filter, type })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }), // optional but recommended
      NotificationModel.countDocuments({ ...filter, type }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return OK(
      res,
      {
        data,
        pagination: {
          totalCount,
          totalPages,
          page,
          limit,
          next: page < totalPages,
          previous: page > 1,
        },
      },
      "Data Fetched",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const deleteNotifications = async (req: Request, res: Response) => {
  try {
    const { id, courseId } = req.query;

    if (!id || !courseId) {
      throw new Error("Required fields are missing");
    }

    await NotificationModel.deleteOne({
      _id: id,
      courseId: courseId,
    });

    return OK(res, {}, "Deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const putNotifications = async (req: Request, res: Response) => {
  try {
    const { id, courseId } = req.query;

    if (!id || !courseId) {
      throw new Error("Required fields are missing");
    }

    const data = await NotificationModel.findOneAndUpdate(
      {
        _id: id,
        courseId: courseId,
      },
      {
        $set: {
          isRead: true,
        },
      },
      { new: true },
    );

    return OK(res, { data }, "Updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export async function postEnquiry(req: Request, res: Response) {
  try {
    const { fullName, email, message, phoneNumber, subject, countryCode } = req.body;
    if (!fullName || !email || !message || !phoneNumber || !subject) {
      throw new Error("Required fields are missing");
    } 
    const ownerDetails = await AdminModel.findOne({ role: "OWNER" });
    if (!ownerDetails) {
      throw new Error("Owner details not found");
    }
    const ownerEmail =
    process.env.ADMIN_RESEND_GMAIL_ACCOUNT ||
    process.env.COMPANY_RESEND_GMAIL_ACCOUNT;
    const result = await sendContactMailToAdmin({
      fullName,
      email,
      message,
      phoneNumber,
      countryCode,
      subject,
      adminEmail: ownerEmail || "team@vcareprojectmanagement.com",
    });
    if (result) {
      return OK(res, {}, "Message sent successfully");
    }
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
}

// Manage system users

export const getSystemUsers = async (req: Request, res: Response) => {
  try {
    let { page = 1, limit = 10, search = "" } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    const filter = {
      $or: [
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { fullName: { $regex: search, $options: "i" } },
      ],
    };

    const [data, totalCount] = await Promise.all([
      AdminModel.find(filter).skip(skip).limit(Number(limit)),
      AdminModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / Number(limit));

    const accessTabs = Object.keys(access);

    return OK(
      res,
      {
        data,
        access: accessTabs,
        pagination: {
          totalCount,
          totalPages,
          page,
          limit,
          next: page < totalPages,
          previous: page > 1,
        },
      },
      "Fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteSystemUser = async (req: Request, res: Response) => {
  try {
    let { id } = req.query;

    const checkExist = await AdminModel.findById(id);

    if (!checkExist) {
      throw new Error("User not found");
    }

    checkExist.status = "DELETED";

    await checkExist.save();

    return OK(res, {}, "Deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const createSystemUsers = async (req: Request, res: Response) => {
  try {
    let {
      firstname,
      lastname,
      email,
      password,
      phoneNumber,
      countryCode,
      image,
      assignedAccess = [],
    } = req.body;
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const sendPassword = password;
    password = bcrypt.hashSync(password, 10);
    let role = "ACCOUNT_MANAGER";

    if (Object.keys(access).every((key) => assignedAccess.includes(key))) {
      role = "SUPER_ADMIN";
    } else {
      role = "ACCOUNT_MANAGER";
    }
    const checkExistingEmail =
      (await AdminModel.findOne({ email: normalizedEmail })) ||
      (await UserModel.findOne({
        email: normalizedEmail,
        emailVerified: true,
      }));
    if (checkExistingEmail) {
      throw new Error("Email already in use");
    }
    await AdminModel.create({
      firstname,
      lastname,
      fullName: `${firstname} ${lastname}`,
      email: normalizedEmail,
      password,
      phoneNumber,
      countryCode,
      image,
      role,
      access: assignedAccess,
    });
    await sendLoginCredentials(normalizedEmail, sendPassword, firstname);
    return OK(res, "Admin created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const updateSystemUser = async (req: Request, res: Response) => {
  try {
    let {
      id,
      firstname = null,
      lastname = null,
      email = null,
      countryCode = null,
      phoneNumber = null,
      password = null,
      image = null,
      status = "ACTIVE",
      assignedAccess = [],
    } = req.body;

    const checkUser = (await AdminModel.findById(id)) as any;

    if (!checkUser) {
      throw new Error("User not found");
    }

    if (password) {
      password = bcrypt.hashSync(password, 10);
    }

    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : null;
    const currentEmail = String(checkUser.email || "").toLowerCase();
    if (normalizedEmail && normalizedEmail !== currentEmail) {
      const [checkExistingAdminEmail, checkExistingUserEmail] =
        await Promise.all([
          AdminModel.findOne({
            email: normalizedEmail,
            _id: { $ne: checkUser._id },
          }),
          UserModel.findOne({ email: normalizedEmail, emailVerified: true }),
        ]);

      if (checkExistingAdminEmail || checkExistingUserEmail) {
        throw new Error("Email already in use");
      }
    }

    let role = "ACCOUNT_MANAGER";

    if (Object.keys(access).every((key) => assignedAccess.includes(key))) {
      role = "SUPER_ADMIN";
    } else {
      role = "ACCOUNT_MANAGER";
    }

    checkUser.firstname = firstname ?? checkUser.firstname;
    checkUser.lastname = lastname ?? checkUser.lastname;
    checkUser.fullName = `${checkUser.firstname} ${checkUser.lastname}`;
    checkUser.email = normalizedEmail || checkUser.email;
    checkUser.password = password ?? checkUser.password;
    checkUser.image = image ?? checkUser.image;
    checkUser.phoneNumber = phoneNumber ?? checkUser.phoneNumber;
    checkUser.countryCode = countryCode ?? checkUser.countryCode;
    checkUser.access = assignedAccess.length
      ? assignedAccess
      : checkUser.access;
    checkUser.role = role as any;
    checkUser.status = status ?? checkUser.status;

    await checkUser.save();

    return OK(res, "Admin updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
