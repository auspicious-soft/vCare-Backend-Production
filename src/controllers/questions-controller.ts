import type { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import { QuestionModel } from "../models/questions-schema.js";
import csv from "csv-parser";
import { Readable } from "stream";
import { CheckCourseExist } from "../utils/helpers.js";
import mongoose from "mongoose";
import { updateFileInUseByUrl } from "./files-controller.js";
import { validate } from "node-cron";
import { getFileUrl } from "../helpers/index.js";

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const handleMCQ = async (rows: any[], courseId: string, isPractice: number) => {
  const questions = rows.map((row) => {
    const options = Object.keys(row)
      .filter((key) => /^option\d+$/i.test(key))
      .sort(
        (a, b) =>
          Number(a.replace("option", "")) - Number(b.replace("option", "")),
      )
      .map((key) => row[key])
      .filter(Boolean);

    const correctIndexes = row.correctOptions
      .split(",")
      .map((i: string) => Number(i) - 1);

    return {
      courseId,
      domainName: row.domainName,
      isPractice: isPractice === 0 ? false : true,
      domainId: row.domainId || null,
      type: "MCQ",
      question: row.question,
      explaination: row.explanation,
      maxSelection: Number(row.maxSelection),
      status: "ACTIVE",
      mcq: options.map((text, idx) => ({
        text,
        isCorrect: correctIndexes.includes(idx),
      })),
      fib: [],
      dnd: { pairs: [], options: [] },
    };
  });

  await QuestionModel.insertMany(questions);
};

const handleFIB = async (rows: any[], courseId: string, isPractice: number) => {
  const questions = rows.map((row) => {
    const maxSelection = Number(row.maxSelection);

    const fib: { correctOrder: number; answer: string }[] = [];

    // Correct answers
    for (let i = 1; i <= maxSelection; i++) {
      const answer = row[`answer${i}`];

      if (answer) {
        fib.push({
          correctOrder: i,
          answer: answer.trim(),
        });
      }
    }

    // Distractors (remaining answers)
    for (let i = maxSelection + 1; i <= 6; i++) {
      const answer = row[`answer${i}`];

      if (answer) {
        fib.push({
          correctOrder: 0, // ❗ distractor
          answer: answer.trim(),
        });
      }
    }

    if (fib.length === 0) {
      throw new Error(`Invalid FIB question: ${row.question}`);
    }

    return {
      courseId,
      domainName: row.domainName,
      isPractice: isPractice === 0 ? false : true,
      domainId: row.domainId || null,
      type: "FIB",
      question: row.question,
      explaination: row.explanation,
      maxSelection: Number(row.maxSelection),
      status: "ACTIVE",
      fib,
      mcq: [],
      dnd: { pairs: [], options: [] },
    };
  });
  await QuestionModel.insertMany(questions);
};

const handleDND = async (rows: any[], courseId: string, isPractice: number) => {
  const questions = rows.map((row) => {
    const pairs = [] as any;
    const options = [];

    let index = 1;
    while (row[`left${index}`] && row[`right${index}`]) {
      pairs.push({
        leftId: `${index}`,
        leftText: row[`left${index}`],
        rightId: `${index}`,
      });

      options.push({
        id: `${index}`,
        text: row[`right${index}`],
      });

      index++;
    }

    // extra options
    let optIndex = 1;
    while (row[`extraOption${optIndex}`]) {
      options.push({
        id: `x${optIndex}`,
        text: row[`extraOption${optIndex}`],
      });
      optIndex++;
    }

    return {
      courseId,
      domainName: row.domainName,
      isPractice: isPractice === 0 ? false : true,
      domainId: row.domainId || null,
      type: "DND",
      question: row.question,
      explaination: row.explanation,
      maxSelection: pairs.length,
      status: "ACTIVE",
      mcq: [],
      fib: [],
      dnd: { pairs, options },
    };
  });

  await QuestionModel.insertMany(questions);
};

export const uploadQuestionCSV = async (req: Request, res: Response) => {
  try {
    let { courseId, isPractice = 0 } = req.query;

    isPractice = Number(isPractice);

    if (!courseId) {
      throw new Error("courseId and moduleId are required");
    }

    const check = await CheckCourseExist(courseId);
    if (typeof check === "string") throw new Error(check);

    if (!req.files?.length) {
      throw new Error("CSV file is required");
    }

    const fileData = req.files as any;

    for (let file of fileData) {
      const rows: any[] = [];

      await new Promise<void>((resolve, reject) => {
        Readable.from(file!.buffer)
          .pipe(csv())
          .on("data", (row) => rows.push(row))
          .on("end", resolve)
          .on("error", reject);
      });

      if (!rows.length) {
        throw new Error("CSV file is empty");
      }

      switch (rows[0].type) {
        case "MCQ":
          await handleMCQ(rows, courseId as any, isPractice as number);
          break;
        case "FIB":
          await handleFIB(rows, courseId as any, isPractice as number);
          break;
        case "DND":
          await handleDND(rows, courseId as any, isPractice as number);
          break;
        default:
          throw new Error("Invalid question type");
      }
    }

    return OK(res, "Uploaded Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

/* =========================
   SINGLE QUESTION CRUD
========================= */

export const getQuestionsSummary = async (req: Request, res: Response) => {
  try {
    const { courseId, isPractice = "false" } = req.query;

    if (!courseId) {
      throw new Error("courseId is required");
    }

    const check = await CheckCourseExist(courseId);
    if (typeof check === "string") throw new Error(check);

    const filter = {
      courseId: new mongoose.Types.ObjectId(courseId as string),
      isPractice: isPractice === "true",
      domainName: { $ne: null },
      status: "ACTIVE",
    };

    const summary = await QuestionModel.aggregate([
      {
        $match: filter,
      },
      {
        $group: {
          _id: "$domainName",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          domainName: "$_id",
          count: 1,
        },
      },
      {
        $sort: { domainName: 1 },
      },
    ]);

    return OK(
      res,
      {
        data: summary,
      },
      "Questions summary fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getQuestions = async (req: Request, res: Response) => {
  try {
    const {
      courseId,
      page = "1",
      limit = "10",
      domainName = null,
      search,
    } = req.query;
    if (!courseId) {
      throw new Error("courseId is required");
    }

    const check = await CheckCourseExist(courseId);
    if (typeof check === "string") throw new Error(check);

    if (!domainName) {
      throw new Error("domainName is required");
    }
    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.max(Number(limit), 1);

    const filter: any = {
      courseId: new mongoose.Types.ObjectId(courseId as string),
      domainName,
      status: "ACTIVE",
    };

    const searchText = typeof search === "string" ? search.trim() : "";
    if (searchText) {
      filter.question = { $regex: escapeRegex(searchText), $options: "i" };
    }

    const total = await QuestionModel.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const currentPage = Math.min(pageNumber, totalPages);
    const skip = (currentPage - 1) * pageSize;

    const questions = await QuestionModel.find(filter)
      .sort({ createdAt: -1 }) // latest first
      .skip(skip)
      .limit(pageSize)
      .lean();

    return OK(
      res,
      {
        data: questions?.map((val)=>{
          if(val?.image){
            return {...val, image: getFileUrl(val.image)}
          }else{
            return val
          }
        }),
        pagination: {
          total,
          page: currentPage,
          limit: pageSize,
          totalPages,
        },
      },
      "Questions fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

/* =========================
   ADD SINGLE QUESTION
========================= */
export const addSimpleQuestion = async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    if (!payload.type || !payload.question) {
      throw new Error("courseId, type and question are required");
    }

    // const check = await CheckCourseExist(payload.courseId);
    // if (typeof check === "string") throw new Error(check);

    const question = await QuestionModel.create({
      courseId: payload.courseId,
      domainId: payload.domainId || null,
      domainName: payload.domainName || null,
      isPractice: payload.isPractice ?? false,
      image: payload.image || null,
      type: payload.type,
      question: payload.question,
      explaination: payload.explaination || "",
      maxSelection: payload.maxSelection,
      mcq: payload.type === "MCQ" ? payload.mcq : [],
      fib: payload.type === "FIB" ? payload.fib : [],
      dnd: payload.type === "DND" ? payload.dnd : { pairs: [], options: [] },
      status: "ACTIVE",
    });
    if (payload.image) {
      await updateFileInUseByUrl({
        url: payload.image,
        action: "increase",
        fileCategory: "Image",
        fileName: "Question",
      });
    }
    return OK(res, question, "Question added successfully");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

/* =========================
   UPDATE SINGLE QUESTION
========================= */
export const updateQuestion = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const payload = req.body;

    if (!questionId) throw new Error("questionId is required");

    const question = (await QuestionModel.findById(questionId)) as any;
    if (!question) throw new Error("Question not found");

    Object.assign(question, {
      domainId: payload.domainId ?? question.domainId,
      domainName: payload.domainName ?? question.domainName,
      isPractice: payload.isPractice ?? question.isPractice,
      question: payload.question ?? question.question,
      image: payload.image ?? question.image,
      explaination: payload.explaination ?? question.explaination,
      maxSelection: payload.maxSelection ?? question.maxSelection,
      mcq: payload.type === "MCQ" ? payload.mcq : question.mcq,
      fib: payload.type === "FIB" ? payload.fib : question.fib,
      dnd: payload.type === "DND" ? payload.dnd : question.dnd,
      status: payload.status ?? question.status,
    });
    if (payload.image) {
      await updateFileInUseByUrl({
        url: question.image,
        action: "decrease",
        fileCategory: "Image",
        fileName: "Question",
      });
      await updateFileInUseByUrl({
        url: payload.image,
        action: "increase",
        fileCategory: "Image",
        fileName: "Question",
      });
    }
    await question.save();

    return OK(res, question, "Question updated successfully");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

/* =========================
   DELETE SINGLE QUESTION (SOFT DELETE)
========================= */
export const deleteQuestion = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;

    if (!questionId) throw new Error("questionId is required");

    const question = await QuestionModel.findByIdAndUpdate(
      questionId,
      { status: "DELETED" },
      { new: true },
    );

    if (!question) throw new Error("Question not found");
    if (question.image) {
      await updateFileInUseByUrl({
        url: question.image,
        action: "decrease",
        fileCategory: "Image",
        fileName: "Question",
      });
    }
    return OK(res, question, "Question deleted successfully");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteQuestionByDomain = async (req: Request, res: Response) => {
  try {
    const { domainName, courseId } = req.query;

    if (!domainName) throw new Error("domainName is required");
    if (!courseId) throw new Error("courseId is required");

    const check = await CheckCourseExist(courseId);
    if (typeof check === "string") throw new Error(check);

    const filter = {
      domainName,
      courseId: new mongoose.Types.ObjectId(courseId as string),
      status: "ACTIVE",
    };

    const questions = await QuestionModel.find(filter)
      .select("image question")
      .lean();
    const result = await QuestionModel.updateMany(filter, {
      status: "DELETED",
    });

    if (!result.matchedCount) throw new Error("Question not found");

    for (const question of questions) {
      if (question.image) {
        await updateFileInUseByUrl({
          url: question.image,
          action: "decrease",
          fileCategory: "Image",
          fileName: "Question",
        });
      }
    }

    return OK(res, result, "Question deleted successfully");
  } catch (err: any) {
    if (err.message) return BADREQUEST(res, err.message);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
