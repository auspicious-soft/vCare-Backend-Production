import type { Request, Response } from "express";
import {
  BADREQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  OK,
  UNAUTHORIZED,
} from "../utils/responses.js";
import { CourseModel } from "../models/course-schema.js";
import redis from "../config/redis.js";
import { CheckCourseExist } from "../utils/helpers.js";
import { ApplicationSupportModel } from "../models/application-support-schema.js";
import { getFileUrl } from "../helpers/index.js";

export const createApplicationSupport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const check = await CheckCourseExist(id);
    if (typeof check === "string") throw new Error(check);
    const { name, price, data } = req.body;
    const count =
      (await ApplicationSupportModel.countDocuments({ courseId: id })) || 0;
    const response = await ApplicationSupportModel.create({
      courseId: id,
      order: Number(count) + 1,
      name,
      price,
      data: [...data],
    });

    return OK(res, response, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const updateApplicationSupport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const check = await CheckCourseExist(id);
    if (typeof check === "string") throw new Error(check);
    const { name, price, data, applicationId } = req.body;
    const response = await ApplicationSupportModel.findOneAndUpdate(
      { _id: applicationId },
      {
        courseId: id,
        name,
        price,
        data: [...data],
      },
    );

    return OK(res, response, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const getApplicationSupport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const check = await CheckCourseExist(id);
    if (typeof check === "string") throw new Error(check);
    const response = await ApplicationSupportModel.find({
      courseId: id,
      status: "ACTIVE",
    }).lean();

    const result = response?.map((val) => {
      const data = val?.data?.map((val2) => {
        if (val2.fileLink) {
          return { ...val2, fileLink: getFileUrl(val2.fileLink) };
        } else {
          return val2;
        }
      });

      return { ...val, data };
    });

    return OK(res, result, "Data Fetched");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const deleteApplicationSupport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const response = await ApplicationSupportModel.findOne({
      _id: id,
      status: "ACTIVE",
    });

    if (!response) {
      throw new Error("Not found");
    }

    await ApplicationSupportModel.findByIdAndUpdate(id, {
      $set: { status: "DELETED" },
    });

    return OK(res, {}, "Deleted Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const deleteApplicationSupportChild = async (
  req: Request,
  res: Response,
) => {
  try {
    const { childId } = req.query;
    const { id } = req.params;

    await ApplicationSupportModel.findByIdAndUpdate(
      id,
      {
        $pull: {
          data: { _id: childId },
        },
      },
      { new: true },
    );

    return OK(res, {}, "Child deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
