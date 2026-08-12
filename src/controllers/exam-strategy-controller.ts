import type { Request, Response } from "express";
import {
  BADREQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  OK,
  UNAUTHORIZED,
} from "../utils/responses.js";
import { CheckCourseExist } from "../utils/helpers.js";
import { ExamStrategyModel } from "../models/exam-strategy-schema.js";
import { getFileUrl } from "../helpers/index.js";

export const createExamStrategy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const check = await CheckCourseExist(id);
    if (typeof check === "string") throw new Error(check);
    const { name, price, data } = req.body;
    const count =
      (await ExamStrategyModel.countDocuments({ courseId: id })) || 0;

    const response = await ExamStrategyModel.create({
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
export const updateExamStrategy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const check = await CheckCourseExist(id);
    if (typeof check === "string") throw new Error(check);
    const { name, price, data, examStrategyId } = req.body;
    const response = await ExamStrategyModel.findOneAndUpdate(
      { _id: examStrategyId },
      {
        courseId: id,
        name,
        price,
        data: [...data],
      },
      {
        new: true,
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
export const getExamStrategy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const check = await CheckCourseExist(id);
    if (typeof check === "string") throw new Error(check);
    const response = await ExamStrategyModel.find({
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
export const deleteExamStrategy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const response = await ExamStrategyModel.findOne({
      _id: id,
      status: "ACTIVE",
    });

    if (!response) {
      throw new Error("Not found");
    }

    await ExamStrategyModel.findByIdAndUpdate(id, {
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
export const deleteExamStrategyChild = async (req: Request, res: Response) => {
  try {
    const { childId } = req.query;
    const { id } = req.params;

    await ExamStrategyModel.findByIdAndUpdate(
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
