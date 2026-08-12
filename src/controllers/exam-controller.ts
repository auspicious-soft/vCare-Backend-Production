import type { Request, Response } from "express";
import {
  BADREQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  OK,
  UNAUTHORIZED,
} from "../utils/responses.js";
import { CheckCourseExist, clearCache } from "../utils/helpers.js";
import { MockExamModel } from "../models/mock-exam-schema.js";
import { QuestionModel } from "../models/questions-schema.js";
import csv from "csv-parser";
import { Readable } from "stream";
import { PracticeExamModel } from "../models/practice-exam-schema.js";
import mongoose from "mongoose";
import { MockExamResultModel } from "../models/mock-exam-result-schema.js";
import { Parser } from "json2csv";
import { CourseModel } from "../models/course-schema.js";
import { getFileUrl } from "../helpers/index.js";

export const createMockExam = async (req: Request, res: Response) => {
  try {
    let {
      courseId,
      numberOfQuestions,
      price,
      passingPercentage,
      timeInMin,
      syllabus,
      ...restData
    } = req.body;

    // --- basic validation ---
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return BADREQUEST(res, "Invalid or missing courseId");
    }
    if (!Array.isArray(syllabus) || syllabus.length === 0) {
      return BADREQUEST(res, "syllabus must be a non-empty array");
    }

    numberOfQuestions = Number(numberOfQuestions);
    price = Number(price);
    passingPercentage = Number(passingPercentage);
    const timeInMinNum = Number(timeInMin);

    if (
      !Number.isFinite(numberOfQuestions) ||
      numberOfQuestions <= 0 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(passingPercentage) ||
      !Number.isFinite(timeInMinNum) ||
      timeInMinNum <= 0
    ) {
      return BADREQUEST(
        res,
        "numberOfQuestions, price, passingPercentage, timeInMin must be valid numbers",
      );
    }

    const remainingSeconds = timeInMinNum * 60;
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    const normalizedSyllabus = syllabus.map((item: any) => ({
      domain: String(item?.domain ?? "").trim(),
      percentage: Number(item?.percentage),
    }));

    if (
      normalizedSyllabus.some(
        (s: any) => !s.domain || !Number.isFinite(s.percentage),
      )
    ) {
      return BADREQUEST(
        res,
        "Each syllabus item requires a valid domain and percentage",
      );
    }

    const requiredPerDomain = normalizedSyllabus.map((item: any) => ({
      domain: item.domain,
      requiredQuestions: Math.ceil((numberOfQuestions * item.percentage) / 100),
    }));

    const availableQuestions = await QuestionModel.aggregate([
      {
        $match: {
          courseId: new mongoose.Types.ObjectId(courseId),
          status: "ACTIVE",
          domainName: { $in: normalizedSyllabus.map((x: any) => x.domain) },
        },
      },
      { $group: { _id: "$domainName", count: { $sum: 1 } } },
    ]);

    const availableMap = new Map(
      availableQuestions.map((x) => [String(x._id).trim(), x.count]),
    );

    const insufficientDomains = requiredPerDomain.filter((item: any) => {
      const available = availableMap.get(item.domain) || 0;
      return available < item.requiredQuestions;
    });

    if (insufficientDomains.length) {
      return BADREQUEST(
        res,
        `Insufficient questions for domains:\n${insufficientDomains.map((item: any) => `${item.domain}: Required ${item.requiredQuestions}, Available ${availableMap.get(item.domain) || 0}`).join("\n")}`,
      );
    }

    // Determine next order for this course/status atomically-ish
    const checkExisting = await MockExamModel.countDocuments({
      status: "ACTIVE",
      courseId,
    });
    const order = checkExisting + 1;

    const created = await MockExamModel.create({
      courseId,
      order,
      numberOfQuestions,
      price,
      passingPercentage,
      timeInMin: formattedTime,
      syllabus: normalizedSyllabus, // <-- the actual fix
      ...restData,
    });

    clearCache("DASHBOARD:TOTAL_EXAMS");

    return OK(res, created, "Mock Exam Created");
  } catch (err: any) {
    console.error("createMockExam error:", err);
    if (err.name === "ValidationError" || err.name === "CastError") {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateMockExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    const check = await CheckCourseExist(id);
    if (typeof check === "string") throw new Error(check);
    let {
      mockExamId,
      numberOfQuestions,
      price,
      status = "ACTIVE",
      passingPercentage,
      timeInMin,
      syllabus,
      courseId,
      ...restData
    } = req.body;
    const mockExam = (await MockExamModel.findOne({
      _id: mockExamId,
      status: { $ne: "DELETED" },
    })) as any;

    const normalizedSyllabus = syllabus.map((item: any) => ({
      domain: String(item.domain ?? "").trim(),
      percentage: Number(item.percentage),
    }));

    const requiredPerDomain = normalizedSyllabus.map((item: any) => ({
      domain: item.domain,
      requiredQuestions: Math.ceil((numberOfQuestions * item.percentage) / 100),
    }));

    console.log("courseId: ", courseId);
    const availableQuestions = await QuestionModel.aggregate([
      {
        $match: {
          courseId: new mongoose.Types.ObjectId(courseId),
          status: "ACTIVE",
          domainName: {
            $in: normalizedSyllabus.map((x: any) => x.domain),
          },
        },
      },
      {
        $group: {
          _id: "$domainName",
          count: { $sum: 1 },
        },
      },
    ]);

    const availableMap = new Map(
      availableQuestions.map((x) => [String(x._id).trim(), x.count]),
    );

    const insufficientDomains = requiredPerDomain.filter((item: any) => {
      const available = availableMap.get(item.domain) || 0;
      console.log("available: ", available);
      return available < item.requiredQuestions;
    });

    if (insufficientDomains.length) {
      return BADREQUEST(
        res,
        `Insufficient questions for domains:\n${insufficientDomains.map((item: any) => `${item.domain}: Required ${item.requiredQuestions}, Available ${availableMap.get(item.domain) || 0}`).join("\n")}`,
      );
    }

    if (!mockExam) {
      return BADREQUEST(res, "Mock Exam not found");
    }

    const remainingSeconds = Number(timeInMin) * 60;

    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (numberOfQuestions !== undefined)
      mockExam.numberOfQuestions = Number(numberOfQuestions);

    if (price !== undefined) mockExam.price = Number(price);

    if (passingPercentage !== undefined)
      mockExam.passingPercentage = Number(passingPercentage);

    if (timeInMin !== undefined) mockExam.timeInMin = formattedTime;

    if (status !== undefined) mockExam.status = status;
    if (syllabus !== undefined) mockExam.syllabus = normalizedSyllabus;
    Object.assign(mockExam, restData);

    await mockExam.save();
    clearCache("DASHBOARD:TOTAL_EXAMS");
    return OK(res, mockExam, "Mock Exam Updated");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteMockExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    const mockExam = (await MockExamModel.findOne({
      _id: id,
      status: { $ne: "DELETED" },
    })) as any;

    if (!mockExam) {
      return BADREQUEST(res, "Mock Exam not found");
    }

    await MockExamModel.findByIdAndUpdate(id, {
      $set: { status: "DELETED", order: 0 },
    });
    clearCache("DASHBOARD:TOTAL_EXAMS");
    return OK(res, {}, "Mock Exam Deleted");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const addExamPrice = async (req: Request, res: Response) => {
  try {
    const { courseId, type, price } = req.body;

    if (!courseId || !type || !price) {
      throw new Error("Invalid body");
    }

    if (type === "MOCK") {
      await CourseModel.findByIdAndUpdate(courseId, {
        $set: { mockExamPrice: price },
      });
    } else {
      await CourseModel.findByIdAndUpdate(courseId, {
        $set: { practiceExamPrice: price },
      });
    }

    return OK(res, {}, "Price Updated");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

const handleMCQ = async (
  rows: any[],
  practiceExamId: string,
  session?: any,
) => {
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
      practiceExamId,
      domainName: row.domainName,
      isPractice: true,
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

  await QuestionModel.insertMany(questions, { session });
};

const handleFIB = async (
  rows: any[],
  practiceExamId: string,
  session?: any,
) => {
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
      practiceExamId,
      domainName: row.domainName,
      isPractice: true,
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
  await QuestionModel.insertMany(questions, { session });
};

const handleDND = async (
  rows: any[],
  practiceExamId: string,
  session?: any,
) => {
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
      practiceExamId,
      domainName: row.domainName,
      isPractice: true,
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

  await QuestionModel.insertMany(questions, { session });
};

export const createPracticeExam = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { name, price } = req.body;
    const { id } = req.params;
    const check = await CheckCourseExist(id);
    if (typeof check === "string") throw new Error(check);
    const checkExist = await PracticeExamModel.find({ courseId: id }).lean();
    const order = checkExist.length === 0 ? 1 : checkExist.length + 1;

    const [practiceExam] = await PracticeExamModel.create(
      [
        {
          order,
          name,
          price: Number(price),
          courseId: id,
        },
      ],
      { session },
    );

    if (!req?.files?.length) {
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
          await handleMCQ(rows, practiceExam?._id as any);
          break;
        case "FIB":
          await handleFIB(rows, practiceExam?._id as any);
          break;
        case "DND":
          await handleDND(rows, practiceExam?._id as any);
          break;
        default:
          throw new Error("Invalid question type");
      }
    }
    clearCache("DASHBOARD:TOTAL_EXAMS");
    await session.commitTransaction();
    session.endSession();
    return OK(res, {}, "Practice Exam Created");
  } catch (err: any) {
    if (err.message) {
      await session.abortTransaction();
      session.endSession();
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const editPracticeExam = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { name, price, practiceExamId, status = "ACTIVE" } = req.body;

    await PracticeExamModel.findByIdAndUpdate(
      practiceExamId,
      {
        $set: {
          name,
          price,
          status,
        },
      },
      { session },
    );

    const fileData = req.files as any;

    if (fileData?.length) {
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
            await handleMCQ(rows, practiceExamId as any, session);
            break;
          case "FIB":
            await handleFIB(rows, practiceExamId as any, session);
            break;
          case "DND":
            await handleDND(rows, practiceExamId as any, session);
            break;
          default:
            throw new Error("Invalid question type");
        }
      }
    }
    clearCache("DASHBOARD:TOTAL_EXAMS");
    await session.commitTransaction();
    session.endSession();
    return OK(res, {}, "Practice Exam Created");
  } catch (err: any) {
    if (err.message) {
      await session.abortTransaction();
      session.endSession();
      return BADREQUEST(res, err.message);
    }
    await session.abortTransaction();
    session.endSession();
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deletePracticeExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mockExam = (await PracticeExamModel.findOne({
      _id: id,
      status: { $ne: "DELETED" },
    })) as any;

    if (!mockExam) {
      return BADREQUEST(res, "Mock Exam not found");
    }

    await PracticeExamModel.findByIdAndUpdate(id, {
      $set: { status: "DELETED", order: 0 },
    });

    await QuestionModel.updateMany(
      { id: id, isPractice: true },
      {
        $set: {
          status: "DELETED",
        },
      },
    );
    clearCache("DASHBOARD:TOTAL_EXAMS");
    return OK(res, {}, "Practice Exam Deleted");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getExams = async (req: Request, res: Response) => {
  try {
    let {
      page = 1,
      limit = 10,
      type = "MOCK",
      search = "",
      courseId,
      nameSort,
      priceSort,
    } = req.query as any;
    const { id } = req.params;
    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;
    let sort: Record<string, 1 | -1> = {};

    if (req.query.priceSort) {
      sort.price = req.query.priceSort === "desc" ? -1 : 1;
    }

    if (req.query.nameSort) {
      sort.name = req.query.nameSort === "desc" ? -1 : 1;
    }

    if (Object.keys(sort).length === 0) {
      sort.order = -1; // default
    }
    if (type === "MOCK") {
      const filter: any = {
        status: { $ne: "DELETED" },
        courseId: new mongoose.Types.ObjectId(courseId),
      };

      if (search) {
        filter.$or = [{ name: { $regex: search, $options: "i" } }];
      }
      const [data, totalCount, courseData] = await Promise.all([
        MockExamModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        MockExamModel.countDocuments(filter),
        CourseModel.findById(courseId).lean(),
      ]);
      const totalPages = Math.ceil(totalCount / limit);

      return OK(
        res,
        {
          data,
          examPrice:
            type === "MOCK"
              ? courseData?.mockExamPrice
              : courseData?.practiceExamPrice,
          pagination: {
            totalCount,
            totalPages,
            page,
            limit,
            next: page < totalPages,
            previous: page > 1,
          },
        },
        "Data fetched successfully",
      );
    } else {
      const filter: any = {
        status: { $ne: "DELETED" },
        courseId: new mongoose.Types.ObjectId(courseId),
      };

      if (search) {
        filter.$or = [{ name: { $regex: search, $options: "i" } }];
      }
      const [data, totalCount, courseData] = await Promise.all([
        PracticeExamModel.aggregate([
          { $match: filter },

          { $sort: sort },
          { $skip: skip },
          { $limit: limit },

          {
            $lookup: {
              from: "questions", // ✅ correct collection name
              localField: "_id",
              foreignField: "practiceExamId",
              as: "questions",
            },
          },

          {
            $addFields: {
              questionCount: {
                $size: {
                  $filter: {
                    input: "$questions",
                    as: "q",
                    cond: { $eq: ["$$q.status", "ACTIVE"] },
                  },
                },
              },
            },
          },

          {
            $project: {
              questions: 0,
            },
          },
        ]),

        PracticeExamModel.countDocuments(filter),

        CourseModel.findById(courseId).lean(),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return OK(
        res,
        {
          data,
          examPrice:
            type === "MOCK"
              ? courseData?.mockExamPrice
              : courseData?.practiceExamPrice,
          pagination: {
            totalCount,
            totalPages,
            page,
            limit,
            next: page < totalPages,
            previous: page > 1,
          },
        },
        "Data fetched successfully",
      );
    }
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getMockExamDomains = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params as any;

    const data = await QuestionModel.distinct("domainName", {
      courseId,
      isPractice: false,
      status: "ACTIVE",
    });

    return OK(res, data, "Fetched Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getExamQuestions = async (req: Request, res: Response) => {
  try {
    const { practiceExamId, search } = req.query as any;

    let query;
    if (search && (search as any)?.trim() !== "") {
      query = { question: { $regex: search, $options: "i" } };
    }

    const data = await QuestionModel.find({
      practiceExamId,
      status: "ACTIVE",
      ...query,
    }).lean();

    const finalData = data?.map((val) => {
      if (val.image) {
        return { ...val, image: getFileUrl(val.image) };
      } else {
        return val;
      }
    });

    return OK(res, finalData, "Fetched Successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getUserMockExamData = async (req: Request, res: Response) => {
  try {
    let {
      page = "1",
      limit = "10",
      search = "",
      courseId,
      sort,
    } = req.query as any;

    if (!courseId) {
      return BADREQUEST(res, "Course id is required");
    }

    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    const matchStage: any = {
      status: "ACTIVE",
    };
    const sortStage: any = {};
    switch (sort) {
      case "examname":
        sortStage["exam.name"] = 1;
        break;
      case "user":
        sortStage["user.fullName"] = 1;
        break;
      case "date":
        sortStage.createdAt = -1;
        break;
      case "status":
        sortStage.currentStatus = 1;
        break;
      case "score":
        sortStage.overallPercentage = -1;
        break;
      case "time":
        sortStage.timeTaken = -1;
        break;
      case "attempt":
        sortStage.attemptNumber = -1;
        break;
      default:
        sortStage.createdAt = -1;
        break;
    }
    // 🔍 Search condition
    const searchMatch =
      search && search.trim()
        ? {
            $or: [
              { "user.fullName": { $regex: search, $options: "i" } },
              { "exam.name": { $regex: search, $options: "i" } },
            ],
          }
        : {};

    const pipeline: any = [
      { $match: matchStage },

      // ✅ Join user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      // ✅ Join mock exam WITH course filter
      {
        $lookup: {
          from: "mockexams",
          let: { examId: "$mockExamId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$examId"] },
                    {
                      $eq: ["$courseId", new mongoose.Types.ObjectId(courseId)],
                    },
                  ],
                },
              },
            },
          ],
          as: "exam",
        },
      },
      { $unwind: "$exam" },

      // 🔍 Apply search AFTER lookup
      { $match: searchMatch },

      // ✅ Domain-wise performance summary
      {
        $lookup: {
          from: "mockexamquestions",
          let: { resultId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$examId", "$$resultId"] },
              },
            },

            // 🔗 Join questions to get domain
            {
              $lookup: {
                from: "questions",
                localField: "questionId",
                foreignField: "_id",
                as: "question",
              },
            },
            { $unwind: "$question" },

            // 📊 Group by domain
            {
              $group: {
                _id: "$question.domainName",
                total: { $sum: 1 },
                correct: {
                  $sum: {
                    $cond: [{ $eq: ["$isCorrect", true] }, 1, 0],
                  },
                },
              },
            },

            // 📈 Calculate success rate
            {
              $project: {
                _id: 0,
                domain: "$_id",
                total: 1,
                correct: 1,
                successRate: {
                  $round: [
                    {
                      $multiply: [{ $divide: ["$correct", "$total"] }, 100],
                    },
                    2,
                  ],
                },
              },
            },
          ],
          as: "domainSummary",
        },
      },

      // ✅ Final projection
      {
        $project: {
          _id: 1,
          score: 1,
          attemptNumber: 1,
          createdAt: 1,
          updatedAt: 1,
          currentStatus: 1,
          correct: 1,
          incorrect: 1,
          unanswered: 1,
          remarks: 1,
          overallPercentage: 1,
          timeTaken: 1,

          "user.fullName": 1,

          "exam.name": 1,
          "exam.remarks": 1,

          domainSummary: 1, // ✅ NEW FIELD
        },
      },

      {
        $sort: sortStage,
      },
      // {
      // 	$sort: {
      // 		updatedAt: -1,
      // 	},
      // },

      // ✅ Pagination
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: pageSize }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await MockExamResultModel.aggregate(pipeline);

    const data = result[0]?.data || [];
    const totalData = result[0]?.totalCount[0]?.count || 0;

    return OK(
      res,
      {
        data,
        pagination: {
          total: totalData,
          page: pageNumber,
          limit: pageSize,
          totalPages: Math.ceil(totalData / pageSize),
        },
      },
      "Result fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const downloadUserMockExamData = async (req: Request, res: Response) => {
  try {
    let { search = "", courseId } = req.query as any;

    if (!courseId) {
      return BADREQUEST(res, "Course id is required");
    }

    const matchStage: any = {
      status: "ACTIVE",
    };

    const searchMatch =
      search && search.trim()
        ? {
            $or: [
              { "user.fullName": { $regex: search, $options: "i" } },
              { "exam.name": { $regex: search, $options: "i" } },
            ],
          }
        : {};

    const pipeline: any = [
      { $match: matchStage },

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
          from: "mockexams",
          let: { examId: "$mockExamId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$examId"] },
                    {
                      $eq: ["$courseId", new mongoose.Types.ObjectId(courseId)],
                    },
                  ],
                },
              },
            },
          ],
          as: "exam",
        },
      },
      { $unwind: "$exam" },

      { $match: searchMatch },

      // ✅ Domain Summary
      {
        $lookup: {
          from: "mockexamquestions",
          let: { resultId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$examId", "$$resultId"] },
              },
            },
            {
              $lookup: {
                from: "questions",
                localField: "questionId",
                foreignField: "_id",
                as: "question",
              },
            },
            { $unwind: "$question" },
            {
              $group: {
                _id: {
                  $ifNull: ["$question.domainName", "Unknown"],
                },
                total: { $sum: 1 },
                correct: {
                  $sum: {
                    $cond: [{ $eq: ["$isCorrect", true] }, 1, 0],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                domain: "$_id",
                total: 1,
                correct: 1,
                successRate: {
                  $round: [
                    {
                      $multiply: [{ $divide: ["$correct", "$total"] }, 100],
                    },
                    2,
                  ],
                },
              },
            },
          ],
          as: "domainSummary",
        },
      },

      {
        $project: {
          attemptNumber: 1,
          createdAt: 1,
          currentStatus: 1,
          correct: 1,
          incorrect: 1,
          unanswered: 1,
          overallPercentage: 1,
          timeTaken: 1,
          remarks: 1,

          userName: "$user.fullName",
          examName: "$exam.name",

          domainSummary: 1,
        },
      },
    ];

    const result = await MockExamResultModel.aggregate(pipeline);

    // ✅ Flatten for CSV
    const formattedData = result.map((item: any) => ({
      User: item.userName,
      Exam: item.examName,
      Attempt: item.attemptNumber,
      Status: item.currentStatus,
      Correct: item.correct,
      Incorrect: item.incorrect,
      Unanswered: item.unanswered,
      Percentage: item.overallPercentage,
      TimeTaken: item.timeTaken,
      Remarks: item.remarks,
      CreatedAt: item.createdAt,

      // 🔥 Convert domain summary into readable string
      DomainSummary: item.domainSummary
        .map(
          (d: any) =>
            `${d.domain}: ${d.correct}/${d.total} (${d.successRate}%)`,
        )
        .join(" | "),
    }));

    // ✅ Convert to CSV
    const parser = new Parser();
    const csv = parser.parse(formattedData);

    // ✅ Send as file
    res.header("Content-Type", "text/csv");
    res.attachment("mock_exam_results.csv");
    return res.send(csv);
  } catch (err: any) {
    console.error(err);
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const mockexamDropdown = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.query as any;
    const result = await MockExamModel.find({ courseId }).lean();
    const data = result.map((item: any) => {
      return {
        _id: item._id,
        name: item.name,
      };
    });
    return OK(res, data, "Result fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
