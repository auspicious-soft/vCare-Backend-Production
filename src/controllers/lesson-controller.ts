import type { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import { CheckCourseExist, clearCache } from "../utils/helpers.js";
import { LessonModel } from "../models/lessons-schema.js";
import csv from "csv-parser";
import fs from "fs";
import { Readable } from "stream";
import mongoose from "mongoose";
import { QuestionModel } from "../models/questions-schema.js";
import { updateFileInUseByUrl } from "./files-controller.js";
import { getFileUrl } from "../helpers/index.js";
export const createModule = async (req: Request, res: Response) => {
  try {
    const {
      courseId,
      module,
      moduleIntroduction,
      price,
      lessons = [],
    } = req.body;

    const checkCourseId = await CheckCourseExist(courseId);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    const lessonCount = await LessonModel.countDocuments({ courseId });

    const order = lessonCount + 1;

    const data = await LessonModel.create({
      module: `${module}`,
      moduleIntroduction,
      courseId,
      order: order,
      price,
      lessons,
    });
    if (data?.lessons?.length > 0) {
      data?.lessons?.forEach(async (lesson) => {
        if (lesson.fileLink) {
          await updateFileInUseByUrl({
            url: lesson.fileLink,
            action: "increase",
            fileCategory: "File",
            fileName: lesson.lessonName || module,
          });
        }
      });
    }
    clearCache("DASHBOARD:TOTAL_MODULES");

    return OK(res, data, "Course created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const downloadSampleModuleCSV = async (req: Request, res: Response) => {
  try {
    const csvHeader = [
      "module",
      "moduleIntroduction",
      "price",
      "lessonName",
      "fileName",
      "fileType",
      "fileLink",
      "duration",
      "status",
    ];

    const sampleRows = [
      [
        "Photography Basics",
        "<p>Learn the fundamentals of photography</p>",
        "499",
        "Introduction to Photography",
        "intro.mp4",
        "VIDEO",
        "https://cdn.site.com/intro.mp4",
        "12:30",
        "ACTIVE",
      ],
      [
        "Photography Basics",
        "<p>Learn the fundamentals of photography</p>",
        "499",
        "Camera Types",
        "camera.pdf",
        "PDF",
        "https://cdn.site.com/camera.pdf",
        "",
        "ACTIVE",
      ],
    ];

    const csvContent =
      csvHeader.join(",") +
      "\n" +
      sampleRows.map((r) => r.join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=lesson_bulk_upload_sample.csv",
    );

    return res.status(200).send(csvContent);
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const bulkUploadLessons = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.query as { courseId?: string };

    const FILE_TYPES = ["VIDEO", "PDF", "IMAGE"];
    const STATUS_TYPES = ["ACTIVE", "INACTIVE", "DELETED"];

    if (!courseId) {
      throw new Error("courseId is required");
    }

    const checkCourseId = await CheckCourseExist(courseId);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    if (!req.file) {
      throw new Error("CSV file is required");
    }

    /* ---------- Parse CSV ---------- */
    const rows: any[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from(req.file!.buffer)
        .pipe(csv())
        .on("data", (row) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    if (!rows.length) {
      throw new Error("CSV file is empty");
    }

    /* ---------- Group rows by module name ---------- */
    const grouped = new Map<string, any>();

    for (const row of rows) {
      const {
        module,
        moduleIntroduction,
        price,
        lessonName,
        fileName,
        fileType,
        fileLink,
        duration,
        status = "ACTIVE",
      } = row;

      if (!module || !lessonName || !fileType || !fileLink) {
        throw new Error(`Missing required fields for lesson: ${lessonName}`);
      }

      if (!FILE_TYPES.includes(fileType)) {
        throw new Error(`Invalid fileType: ${fileType}`);
      }

      if (!STATUS_TYPES.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      if (!grouped.has(module)) {
        grouped.set(module, {
          rawModuleName: module,
          moduleIntroduction,
          price: Number(price) || 0,
          status,
          lessons: [],
        });
      }

      grouped.get(module).lessons.push({
        lessonName,
        fileName,
        fileType,
        fileLink,
        duration: duration || null,
      });
    }

    /* ---------- Fetch existing modules ---------- */
    const existingModules = await LessonModel.find({ courseId }).lean();

    const moduleMap = new Map<string, any>();
    existingModules.forEach((m: any) => {
      // Extract raw module name from "Module X : Name"
      const rawName = m?.module?.split(":").slice(1).join(":").trim();
      moduleMap.set(rawName, m);
    });

    let lastModuleOrder =
      existingModules.length > 0
        ? Math.max(...existingModules.map((m) => m.order))
        : 0;

    const bulkOps: any[] = [];
    let createdModules = 0;
    let addedLessons = 0;

    /* ---------- Process each module ---------- */
    for (const m of grouped.values()) {
      const existing = moduleMap.get(m.rawModuleName);

      if (existing) {
        // 🔁 Append lessons to existing module
        throw new Error("Module name already exist");
        // let lessonOrder =
        //   existing.lessons?.length > 0
        //     ? Math.max(...existing.lessons.map((l: any) => l.order))
        //     : 0;

        // const orderedLessons = m.lessons.map((l: any) => ({
        //   ...l,
        //   order: ++lessonOrder,
        // }));

        // bulkOps.push({
        //   updateOne: {
        //     filter: { _id: existing._id },
        //     update: {
        //       $push: { lessons: { $each: orderedLessons } },
        //     },
        //   },
        // });

        // addedLessons += orderedLessons.length;
      } else {
        // ➕ Create new module
        lastModuleOrder += 1;

        const orderedLessons = m.lessons.map((l: any, index: number) => ({
          ...l,
          order: index + 1,
        }));

        bulkOps.push({
          insertOne: {
            document: {
              courseId,
              module: `Module ${lastModuleOrder} : ${m.rawModuleName}`,
              moduleIntroduction: m.moduleIntroduction,
              order: lastModuleOrder,
              price: m.price,
              status: m.status,
              lessons: orderedLessons,
            },
          },
        });

        createdModules += 1;
        addedLessons += orderedLessons.length;
      }
    }

    /* ---------- Execute bulk write ---------- */
    if (bulkOps.length) {
      await LessonModel.bulkWrite(bulkOps);
    }

    clearCache("DASHBOARD:TOTAL_MODULES");

    return OK(
      res,
      {
        modulesCreated: createdModules,
        lessonsAdded: addedLessons,
      },
      "Bulk lessons uploaded successfully",
    );
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getModules = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.query;

    const checkCourseId = await CheckCourseExist(courseId);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }
    const modules = await LessonModel.aggregate([
      {
        $match: {
          courseId: new mongoose.Types.ObjectId(courseId as string),
          status: "ACTIVE",
        },
      },
      { $sort: { order: 1 } },

      {
        $addFields: {
          lessons: {
            $sortArray: {
              input: "$lessons",
              sortBy: { order: 1 },
            },
          },
        },
      },

      // 👇 join with lessonquestions
      {
        $lookup: {
          from: "questions",
          let: { lessonId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$lessonId", "$$lessonId"] },
                    { $eq: ["$status", "ACTIVE"] },
                  ],
                },
              },
            },
          ],
          as: "questionsData",
        },
      },

      {
        $addFields: {
          questions: { $size: "$questionsData" },
        },
      },

      {
        $project: {
          questionsData: 0,
        },
      },
    ]);

    const result = modules?.map((val) => {
      const lessons = val?.lessons.map((val2: any) => {
        if (val2.fileLink) {
          return { ...val2, fileLink: getFileUrl(val2.fileLink) };
        } else {
          return val2;
        }
      });

      return { ...val, lessons };
    });

    return OK(res, result, "Course created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const hardDeleteModule = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    const checkExist = await LessonModel.findById(id);
    if (!checkExist) throw new Error("Module not found");
    await LessonModel.findByIdAndDelete(id);
    clearCache("DASHBOARD:TOTAL_MODULES");
    if (checkExist?.lessons?.length > 0) {
      checkExist?.lessons?.forEach(async (lesson) => {
        if (lesson.fileLink) {
          await updateFileInUseByUrl({
            url: lesson.fileLink,
            action: "decrease",
            fileCategory: "File",
            fileName: lesson.lessonName || String(checkExist.module),
          });
        }
      });
    }
    return OK(res, [], "Course created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getLessonById = async (req: Request, res: Response) => {
  try {
    const { id } = req.query as { id?: string };

    if (!id) {
      throw new Error("lesson id is required");
    }

    // 1️⃣ Find the module containing this lesson
    const moduleDoc = (await LessonModel.findOne({
      "lessons._id": id,
    }).lean()) as any;

    if (!moduleDoc) {
      throw new Error("Lesson doesn't exist");
    }

    const lesson = moduleDoc.lessons.filter(
      (data: any) => data._id.toString() === id,
    );

    const response = {
      module: moduleDoc?.module,
      moduleIntroduction: moduleDoc.moduleIntroduction,
      price: moduleDoc.price,
      ...lesson[0],
    };

    return OK(res, response, "Lesson fetched successfully");
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateLesson = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      id,
      lessonName,
      fileName,
      fileType,
      fileLink,
      duration,
      order,
      module,
      moduleIntroduction,
      price,
    } = req.body;

    if (!id || !module || !price) {
      throw new Error("lesson id, module name & price is required");
    }

    /* ---------- Find Current Lesson ---------- */
    const moduleDoc = await LessonModel.findOne(
      { "lessons._id": id },
      { "lessons.$": 1 },
    ).session(session);

    if (!moduleDoc || !moduleDoc.lessons.length) {
      throw new Error("Lesson not found");
    }

    const currentLesson = moduleDoc.lessons[0] as any;
    const currentOrder = currentLesson.order;

    /* ---------- Handle Order Swap ---------- */
    if (order !== undefined && order !== currentOrder) {
      const swapLesson = await LessonModel.findOne(
        {
          _id: moduleDoc._id,
          "lessons.order": order,
        },
        { "lessons.$": 1 },
      ).session(session);

      if (!swapLesson) {
        throw new Error(`Lesson with order ${order} does not exist`);
      }

      // Swap other lesson → currentOrder
      await LessonModel.updateOne(
        {
          _id: moduleDoc._id,
          "lessons.order": order,
        },
        {
          $set: {
            "lessons.$.order": currentOrder,
          },
        },
      ).session(session);

      // Update current lesson → new order
      await LessonModel.updateOne(
        {
          _id: moduleDoc._id,
          "lessons._id": id,
        },
        {
          $set: {
            "lessons.$.order": order,
          },
        },
      ).session(session);
    }

    /* ---------- Other Field Updates ---------- */
    const updateData: any = {};

    if (lessonName) updateData["lessons.$.lessonName"] = lessonName;
    if (fileName) updateData["lessons.$.fileName"] = fileName;
    if (fileType) updateData["lessons.$.fileType"] = fileType;
    if (fileLink) updateData["lessons.$.fileLink"] = fileLink;
    if (duration !== undefined) updateData["lessons.$.duration"] = duration;

    if (Object.keys(updateData).length) {
      await LessonModel.updateOne(
        { "lessons._id": id },
        { $set: updateData },
      ).session(session);
    }

    if (fileLink) {
      await updateFileInUseByUrl({
        url: currentLesson.fileLink,
        action: "decrease",
        fileCategory: "File",
        fileName: currentLesson.lessonName || module,
      });
      await updateFileInUseByUrl({
        url: fileLink,
        action: "increase",
        fileCategory: "File",
        fileName: lessonName || currentLesson.lessonName || module,
      });
    }

    /* ---------- Module & Price Updates ---------- */
    const moduleUpdate: any = {};

    if (module) {
      moduleUpdate.module = module;
    }

    if (moduleIntroduction) {
      moduleUpdate.moduleIntroduction = moduleIntroduction;
    }

    if (price !== undefined) {
      moduleUpdate.price = price;
    }

    if (Object.keys(moduleUpdate).length) {
      await LessonModel.updateOne(
        { _id: moduleDoc._id },
        { $set: moduleUpdate },
      ).session(session);
    }

    await session.commitTransaction();
    session.endSession();
    clearCache("DASHBOARD:TOTAL_MODULES");
    return OK(res, {}, "Lesson updated successfully");
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    return BADREQUEST(res, err.message || "Update failed");
  }
};

export const addLesson = async (req: Request, res: Response) => {
  try {
    const { moduleId, lessons = [] } = req.body;

    if (!moduleId) {
      throw new Error("module id is required");
    }

    if (!Array.isArray(lessons) || !lessons.length) {
      throw new Error("lessons array is required");
    }

    const checkModule = await LessonModel.findById(moduleId);
    if (!checkModule) {
      throw new Error("Module does not exist");
    }

    const existingLessonsCount = checkModule.lessons.length;

    // ✅ Assign order properly
    const formattedLessons = lessons.map((lesson: any, index: number) => ({
      lessonName: lesson.lessonName,
      price: lesson.price,
      fileName: lesson.fileName,
      fileType: lesson.fileType,
      fileLink: lesson.fileLink,
      duration: lesson.duration,
      order: existingLessonsCount + index + 1, // 🔥 correct ordering
    }));

    // ✅ Push multiple lessons
    await LessonModel.updateOne(
      { _id: moduleId },
      {
        $push: {
          lessons: { $each: formattedLessons },
        },
      },
    );
    const existingLessons = checkModule.lessons.map(
      (lesson: any) => lesson.fileLink,
    );
    const newLessons = lessons.map((lesson: any) => lesson.fileLink);

    await Promise.all([
      ...newLessons.map((newLesson: string) =>
        updateFileInUseByUrl({
          url: newLesson,
          action: "increase",
          fileCategory: "File",
          fileName: "Lesson File",
        }),
      ),
      ...existingLessons.map((existingLesson: string) =>
        updateFileInUseByUrl({
          url: existingLesson,
          action: "decrease",
          fileCategory: "File",
          fileName: "Lesson File",
        }),
      ),
    ]);
    clearCache("DASHBOARD:TOTAL_MODULES");
    return OK(res, {}, "Lessons added successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Update failed");
  }
};

export const deleteLesson = async (req: Request, res: Response) => {
  try {
    const { id } = req.query as { id?: string };

    if (!id) {
      throw new Error("lesson id is required");
    }

    // 1️⃣ Find the module containing this lesson
    const moduleDoc = await LessonModel.findOne({
      "lessons._id": id,
    });

    if (!moduleDoc) {
      throw new Error("Lesson doesn't exist");
    }
    if (moduleDoc?.lessons?.length > 0) {
      moduleDoc?.lessons?.forEach(async (lesson) => {
        if (lesson.fileLink) {
          await updateFileInUseByUrl({
            url: lesson.fileLink,
            action: "decrease",
            fileCategory: "File",
            fileName: lesson.lessonName || String(moduleDoc.module),
          });
        }
      });
    }
    // 2️⃣ Remove the lesson
    moduleDoc.lessons = moduleDoc.lessons.filter(
      (lesson: any) => lesson._id.toString() !== id,
    );

    // 3️⃣ Re-assign order
    moduleDoc.lessons = moduleDoc.lessons.map((lesson: any, index: number) => ({
      ...lesson.toObject(),
      order: index + 1,
    }));

    // 4️⃣ Save
    await moduleDoc.save();
    clearCache("DASHBOARD:TOTAL_MODULES");
    return OK(res, {}, "Lesson deleted and order rearranged successfully");
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteLessonModule = async (req: Request, res: Response) => {
  try {
    const { id } = req.query as { id?: string };

    if (!id) {
      throw new Error("module id is required");
    }
    const existing = await LessonModel.findById(id);
    if (!existing) {
      throw new Error("Module not found");
    }
    if (existing?.lessons?.length > 0) {
      existing?.lessons?.forEach(async (lesson) => {
        if (lesson.fileLink) {
          await updateFileInUseByUrl({
            url: lesson.fileLink,
            action: "decrease",
            fileCategory: "File",
            fileName: lesson.lessonName || String(existing.module),
          });
        }
      });
    }
    await LessonModel.findByIdAndUpdate(id, { $set: { status: "DELETED" } });
    clearCache("DASHBOARD:TOTAL_MODULES");
    return OK(res, {}, "Module deleted successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Failed to delete question");
  }
};

export const addQuestion = async (req: Request, res: Response) => {
  try {
    const {
      courseId,
      moduleId,
      question,
      type,
      mcq,
      fib,
      dnd,
      maxSelection,
      explaination,
      image,
    } = req.body;

    if (!courseId || !moduleId || !question || !type) {
      throw new Error("courseId, moduleId, question & type are required");
    }

    /* ---------- Check Course ---------- */
    const checkCourseId = await CheckCourseExist(courseId);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    /* ---------- Check Module ---------- */
    const checkModule = await LessonModel.findById(moduleId);
    if (!checkModule) {
      throw new Error("Module does not exist");
    }

    /* ---------- Type Validation ---------- */
    if (!["MCQ", "FIB", "DND"].includes(type)) {
      throw new Error("Invalid question type");
    }

    const payload: any = {
      courseId,
      lessonId: moduleId,
      question,
      type,
      maxSelection,
      explaination,
      image,
      status: "ACTIVE",
    };

    /* ======================================================
       MCQ VALIDATION
    ====================================================== */
    if (type === "MCQ") {
      if (!Array.isArray(mcq) || mcq.length < 2) {
        throw new Error("MCQ must have at least 2 options");
      }

      const correctCount = mcq.filter((m: any) => m.isCorrect).length;

      if (correctCount === 0) {
        throw new Error("At least one correct MCQ option is required");
      }

      if (maxSelection !== correctCount) {
        throw new Error(
          `maxSelection must match number of correct answers (${correctCount})`,
        );
      }

      payload.mcq = mcq;
    }

    /* ======================================================
       FIB VALIDATION (Multiple blanks in order)
    ====================================================== */
    if (type === "FIB") {
      if (!Array.isArray(fib) || fib.length === 0) {
        throw new Error("FIB answers are required");
      }

      const realAnswers = fib.filter((f: any) => f.correctOrder > 0);
      const fakeAnswers = fib.filter((f: any) => f.correctOrder === 0);

      if (realAnswers.length === 0) {
        throw new Error("At least one correct FIB answer is required");
      }

      /* -------- Validate correctOrder sequence -------- */
      const orders = realAnswers.map((f: any) => f.correctOrder);

      const uniqueOrders = new Set(orders);
      if (uniqueOrders.size !== orders.length) {
        throw new Error("Duplicate correctOrder values in FIB");
      }

      const maxOrder = Math.max(...orders);

      // Must be 1..N continuous (no gaps)
      for (let i = 1; i <= maxOrder; i++) {
        if (!orders.includes(i)) {
          throw new Error("FIB correctOrder must be continuous from 1");
        }
      }

      /* -------- maxSelection = number of blanks -------- */
      if (maxSelection !== realAnswers.length) {
        throw new Error(
          `maxSelection must be ${realAnswers.length} (number of blanks)`,
        );
      }

      payload.fib = fib;
    }

    /* ======================================================
       DND VALIDATION (Matching)
    ====================================================== */
    if (type === "DND") {
      if (!dnd || !Array.isArray(dnd.pairs) || !Array.isArray(dnd.options)) {
        throw new Error("DND pairs & options are required");
      }

      if (dnd.pairs.length === 0 || dnd.options.length === 0) {
        throw new Error("DND cannot be empty");
      }

      const rightIds = dnd.options.map((o: any) => o.id);

      for (const p of dnd.pairs) {
        if (!rightIds.includes(p.rightId)) {
          throw new Error(`Invalid rightId in DND pair: ${p.rightId}`);
        }
      }

      if (maxSelection !== dnd.pairs.length) {
        throw new Error("maxSelection must equal number of pairs");
      }

      payload.dnd = dnd;
    }

    /* ---------- Save ---------- */
    const questionDoc = await QuestionModel.create(payload);
    if (image) {
      await updateFileInUseByUrl({
        url: image,
        action: "increase",
        fileCategory: "Image",
        fileName: "Question",
      });
    }
    return OK(res, questionDoc, "Question added successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Failed to add question");
  }
};

export const getQuestionsLessons = async (req: Request, res: Response) => {
  try {
    const { moduleId, search } = req.query;
    let query;
    if (search && (search as any)?.trim() !== "") {
      query = { question: { $regex: search, $options: "i" } };
    }
    const result: any = await QuestionModel.find({
      status: "ACTIVE",
      lessonId: moduleId,
      ...query,
    });
    const questions = result.map((question: any) => ({
      ...question.toObject(),
      image: question.image ? getFileUrl(question.image) : null,
    }));

    return OK(res, questions, "Question fetched successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Failed to add question");
  }
};

export const updateQuestionsLessons = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const checkExisting = await QuestionModel.findById(id);
    if (!checkExisting) {
      throw new Error("Invalid question id");
    }
    const questions = await QuestionModel.findByIdAndUpdate(
      { _id: new mongoose.Types.ObjectId(id as string) },
      {
        $set: {
          ...req.body,
        },
      },
      {
        new: true,
      },
    );
    if (req.body.image) {
      if (checkExisting.image) {
        await updateFileInUseByUrl({
          url: checkExisting.image,
          action: "decrease",
          fileCategory: "Image",
          fileName: checkExisting.question,
        });
      }
      await updateFileInUseByUrl({
        url: req.body.image,
        action: "increase",
        fileCategory: "Image",
        fileName: "Question",
      });
    }
    return OK(res, questions, "Question fetched successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Failed to add question");
  }
};

export const deleteQuestionsLessons = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new Error("question id is required");
    }
    const questions = await QuestionModel.findByIdAndUpdate(
      { _id: new mongoose.Types.ObjectId(id as string) },
      { status: "DELETED" },
      { new: true },
    );
    if (questions?.image) {
      await updateFileInUseByUrl({
        url: questions.image,
        action: "decrease",
        fileCategory: "Image",
        fileName: "Question",
      });
    }
    return OK(res, questions, "Question deleted successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Failed to delete question");
  }
};

export const deleteAllQuestionsLessons = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.query;
    if (!id) {
      throw new Error("question id is required");
    }
    await QuestionModel.updateMany(
      { lessonId: new mongoose.Types.ObjectId(id as string) },
      { status: "DELETED" },
    );

    const questions = (await QuestionModel.find({
      lessonId: new mongoose.Types.ObjectId(id as string),
    })) as any;

    if (questions?.image) {
      await updateFileInUseByUrl({
        url: questions.image,
        action: "decrease",
        fileCategory: "Image",
        fileName: "Question",
      });
    }
    return OK(res, questions, "Question deleted successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Failed to delete question");
  }
};

export const downloadDNDSampleCSV = async (req: Request, res: Response) => {
  const headers = [
    "type",
    "isPractice",
    "domainName",
    "question",
    "left1",
    "right1",
    "left2",
    "right2",
    "explanation",
  ];

  const rows = [
    [
      "DND",
      "0",
      "Geo-1",
      "Match the capitals",
      "India",
      "Delhi",
      "France",
      "Paris",
      "Countries and capitals",
    ],
    [
      "DND",
      "0",
      "Geo-2",
      "Match the capitals",
      "Canada",
      "Ottawa",
      "Australia",
      "Canberra",
      "Countries and capitals",
    ],
    [
      "DND",
      "0",
      "Geo-3",
      "Match the capitals",
      "Brazil",
      "Brasília",
      "Italy",
      "Rome",
      "Countries and capitals",
    ],
    [
      "DND",
      "0",
      "Sci",
      "Match the element and symbol",
      "Hydrogen",
      "H",
      "Oxygen",
      "O",
      "Elements and symbols",
    ],
  ];

  const csv =
    headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=DND_sample.csv");

  return res.send(csv);
};

export const downloadFIBSampleCSV = async (req: Request, res: Response) => {
  const headers = [
    "type",
    "isPractice",
    "domainName",
    "question",
    "answer1",
    "answer2",
    "answer3",
    "answer4",
    "answer5",
    "answer6",
    "maxSelection",
    "explanation",
  ];

  const rows = [
    [
      "FIB",
      "0",
      "Geo-1",
      "Arrange the planets BLANK BLANK BLANK BLANK.",
      "Mercury",
      "Venus",
      "Earth",
      "Mars",
      "Jupiter",
      "Saturn",
      "4",
      "Solar system order",
    ],
    [
      "FIB",
      "0",
      "Space-1",
      "Arrange the first four planets from the Sun: BLANK BLANK BLANK BLANK.",
      "Mercury",
      "Venus",
      "Earth",
      "Mars",
      "",
      "",
      "4",
      "Solar system order",
    ],
    [
      "FIB",
      "0",
      "Space-2",
      "Arrange the gas giants from nearest to farthest from the Sun: BLANK BLANK BLANK BLANK.",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
      "",
      "",
      "4",
      "Solar system order",
    ],
    [
      "FIB",
      "0",
      "Math",
      "Arrange the numbers in ascending order: BLANK BLANK BLANK BLANK.",
      "12",
      "24",
      "36",
      "48",
      "",
      "",
      "4",
      "Number ordering",
    ],
  ];

  const csv =
    headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=FIB_sample.csv");

  return res.send(csv);
};
export const downloadMCQSampleCSV = async (req: Request, res: Response) => {
  const headers = [
    "type",
    "isPractice",
    "domainName",
    "question",
    "option1",
    "option2",
    "option3",
    "option4",
    "correctOptions",
    "maxSelection",
    "explanation",
  ];

  const rows = [
    [
      "MCQ",
      "0",
      "Planets",
      "Which planet is closest to the Sun?",
      "Mercury",
      "Venus",
      "Earth",
      "Mars",
      "1",
      "1",
      "Mercury is the closest planet",
    ],
    [
      "MCQ",
      "0",
      "Science-1",
      "What gas do plants absorb from the atmosphere?",
      "Oxygen",
      "Nitrogen",
      "Carbon Dioxide",
      "Hydrogen",
      "3",
      "1",
      "Plants absorb carbon dioxide during photosynthesis.",
    ],
    [
      "MCQ",
      "0",
      "History-1",
      "Who was the first President of the United States?",
      "Abraham Lincoln",
      "George Washington",
      "John Adams",
      "Thomas Jefferson",
      "2",
      "1",
      "George Washington was the first U.S. President.",
    ],
    [
      "MCQ",
      "0",
      "History-2",
      "Who built the Taj Mahal?",
      "Akbar",
      "Babur",
      "Shah Jahan",
      "Humayun",
      "3",
      "1",
      "The Taj Mahal was built by Shah Jahan.",
    ],
  ];

  const csv =
    headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=MCQ_sample.csv");

  return res.send(csv);
};

const handleMCQ = async (
  rows: any[],
  courseId: string,
  moduleId: string,
  session: mongoose.ClientSession,
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

    const correctIndexes = row?.correctOptions
      ?.split(",")
      ?.map((i: string) => Number(i) - 1);

    return {
      courseId,
      lessonId: moduleId,
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
  courseId: string,
  moduleId: string,
  session: mongoose.ClientSession,
) => {
  const questions = rows.map((row) => {
    const maxSelection = Number(row.maxSelection);

    const fib: { correctOrder: number; answer: string }[] = [];

    for (let i = 1; i <= maxSelection; i++) {
      const answer = row[`answer${i}`];
      if (answer) {
        fib.push({ correctOrder: i, answer: answer.trim() });
      }
    }

    for (let i = maxSelection + 1; i <= 6; i++) {
      const answer = row[`answer${i}`];
      if (answer) {
        fib.push({ correctOrder: 0, answer: answer.trim() });
      }
    }

    if (!fib.length) {
      throw new Error(`Invalid FIB question: ${row.question}`);
    }

    return {
      courseId,
      lessonId: moduleId,
      type: "FIB",
      question: row.question,
      explaination: row.explanation,
      maxSelection: maxSelection || fib.length,
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
  courseId: string,
  moduleId: string,
  session: mongoose.ClientSession,
) => {
  const questions = rows.map((row) => {
    const pairs: any = [];
    const options: any = [];

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
      lessonId: moduleId,
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

export const bulkUploadQuestions = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { courseId, moduleId } = req.query as any;

    if (!courseId || !moduleId) {
      throw new Error("courseId and moduleId are required");
    }

    const check = await CheckCourseExist(courseId);
    if (typeof check === "string") throw new Error(check);

    if (!mongoose.isValidObjectId(moduleId)) {
      throw new Error("Invalid moduleId");
    }

    if (!req.files) {
      throw new Error("CSV file is required");
    }

    const fileData = req.files as any;

    for (const file of fileData) {
      const rows: any[] = [];

      await new Promise<void>((resolve, reject) => {
        Readable.from(file.buffer)
          .pipe(csv())
          .on("data", (row) => rows.push(row))
          .on("end", resolve)
          .on("error", reject);
      });

      if (!rows.length) throw new Error("CSV is empty");

      switch (rows[0].type) {
        case "MCQ":
          await handleMCQ(rows, courseId, moduleId, session);
          break;
        case "FIB":
          await handleFIB(rows, courseId, moduleId, session);
          break;
        case "DND":
          await handleDND(rows, courseId, moduleId, session);
          break;
        default:
          throw new Error("Invalid question type");
      }
    }

    await session.commitTransaction();
    session.endSession();

    return OK(res, "Uploaded Successfully");
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
