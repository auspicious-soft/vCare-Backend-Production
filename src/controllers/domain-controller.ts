import type { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import { CheckCourseExist } from "../utils/helpers.js";
import { DomainModel } from "../models/domains-schema.js";
import { TaskModel } from "../models/tasks-schema.js";
import { uploadFileToS3 } from "../config/s3.js";
import csv from "csv-parser";
import { Readable } from "stream";
import mongoose from "mongoose";
import { QuestionModel } from "../models/questions-schema.js";
import { updateFileInUseByUrl } from "./files-controller.js";
import { getFileUrl } from "../helpers/index.js";

const handleMCQ = async (
  rows: any[],
  courseId: string,
  task_id: string,
  session: any,
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
      courseId,
      taskId: task_id,
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
  task_id: string,
  session: any,
) => {
  const questions = rows.map((row) => {
    const answers = [
      row.answer1,
      row.answer2,
      row.answer3,
      row.answer4,
      row.answer5,
      row.answer6,
    ].filter(Boolean);

    return {
      courseId,
      taskId: task_id,
      type: "FIB",
      question: row.question,
      explaination: row.explanation,
      maxSelection: Number(row.maxSelection),
      status: "ACTIVE",
      fib: answers.map((ans, idx) => ({
        correctOrder: idx + 1,
        answer: ans,
      })),
      mcq: [],
      dnd: { pairs: [], options: [] },
    };
  });

  await QuestionModel.insertMany(questions, { session });
};

const handleDND = async (
  rows: any[],
  courseId: string,
  task_id: string,
  session: any,
) => {
  const questions = rows.map((row) => {
    const pairs = [];
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
      taskId: task_id,
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

export const createDomain = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { courseId } = req.query;

    const checkCourseId = await CheckCourseExist(courseId as string);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    let {
      domainId = null,
      domain,
      price,
      task_id = null,
      taskLabel,
      taskName,
      taskDetails,
      examples,
      keywords,
      task_label,
      task_name,
      task_details,
      task_example,
      task_keywords,
    } = req.body;

    taskLabel = taskLabel || task_label;
    taskName = taskName || task_name;
    taskDetails = taskDetails || task_details;
    examples = examples || task_example;
    keywords = keywords || task_keywords;

    const fileData = req.files as any;

    let domainData: any;
    let taskData: any;

    // ================= DOMAIN CREATE / UPDATE =================

    if (domainId) {
      const checkOrder = await DomainModel.findOne({
        _id: domainId,
      }).session(session);

      if (!checkOrder) throw new Error(`Domain does not exists`);

      domainData = await DomainModel.findByIdAndUpdate(
        domainId,
        {
          domain,
          price,
        },
        { new: true, session },
      );
    } else {
      const checkOrder = (await DomainModel.countDocuments({
        courseId,
      }).session(session)) as any;
      let order = checkOrder + 1;
      const [createdDomain] = (await DomainModel.create(
        [
          {
            courseId,
            domain,
            order: parseInt(order),
            price: parseFloat(price),
            status: "ACTIVE",
          },
        ],
        { session },
      )) as any;

      domainData = createdDomain;
      domainId = createdDomain._id;
    }

    // ================= DIAGRAM UPLOAD =================

    let diagramUrl;

    if (fileData.find((f: any) => f.fieldname === "task_diagram")) {
      const diagramFile = fileData.find(
        (f: any) => f.fieldname === "task_diagram",
      );

      const uploadResult: any = await uploadFileToS3(
        diagramFile.buffer,
        diagramFile.originalname,
        diagramFile.mimetype,
        (req as any).admin.id,
        "diagram",
        true,
      );

      diagramUrl = uploadResult.key || uploadResult.url;
    }

    // ================= TASK CREATE / UPDATE =================

    if (!task_id) {
      const checkOrder = (await TaskModel.find({
        domainId,
      }).session(session)) as any;
      let task_order = checkOrder.length > 0 ? checkOrder.length : 1;
      const taskPayload: any = {
        domainId,
        order: parseInt(task_order),
        taskLabel,
        taskName,
        taskDetails,
        examples,
        keywords,
        status: "ACTIVE",
      };

      if (diagramUrl) {
        taskPayload.flowDiagram = diagramUrl;
      }

      const [createdTask] = await TaskModel.create([taskPayload], {
        session,
      });

      taskData = createdTask;
    } else {
      const checkOrder = await TaskModel.findOne({
        domainId,
        _id: task_id,
      }).session(session);

      if (!checkOrder) throw new Error(`Task does not exists`);

      const updateData: any = {
        taskLabel,
        taskName,
        taskDetails,
        examples,
        keywords,
      };

      if (diagramUrl) {
        updateData.flowDiagram = diagramUrl;
      }

      taskData = await TaskModel.findByIdAndUpdate(task_id, updateData, {
        new: true,
        session,
      });
    }

    // ================= CSV PROCESSING =================

    const csvFiles = fileData.filter(
      (f: any) => f.fieldname === "task_question_CSV",
    );

    if (csvFiles.length) {
      if (task_id) {
        await QuestionModel.deleteMany({ taskId: task_id }).session(session);
      }

      for (const file of csvFiles) {
        const csvBuffer = file.buffer;
        const rows: any[] = [];

        await new Promise<void>((resolve, reject) => {
          Readable.from(csvBuffer)
            .pipe(csv())
            .on("data", (row) => rows.push(row))
            .on("end", resolve)
            .on("error", reject);
        });

        if (!rows.length) {
          throw new Error(`CSV file ${file.originalname} is empty`);
        }

        switch (rows[0].type) {
          case "MCQ":
            await handleMCQ(rows, courseId as any, taskData._id, session);
            break;
          case "FIB":
            await handleFIB(rows, courseId as any, taskData._id, session);
            break;
          case "DND":
            await handleDND(rows, courseId as any, taskData._id, session);
            break;
          default:
            throw new Error(
              `Invalid question type in file ${file.originalname}`,
            );
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    return OK(
      res,
      { domain: domainData, task: taskData },
      task_id
        ? "Task updated successfully"
        : "Domain and task created successfully",
    );
  } catch (err: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    session.endSession();

    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getDomain = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.query as any;

    const checkCourseId = await CheckCourseExist(courseId as string);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    const domains = await DomainModel.aggregate([
      {
        $match: {
          courseId: new mongoose.Types.ObjectId(courseId),
          status: "ACTIVE",
        },
      },
      {
        $sort: {
          order: 1,
        },
      },
      {
        $project: {
          _id: 1,
          domain: 1,
          order: 1,
          price: 1,
        },
      },
      {
        $lookup: {
          from: "tasks",
          let: { domainId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$domainId", "$$domainId"] },
                    { $eq: ["$status", "ACTIVE"] },
                  ],
                },
              },
            },
            {
              $sort: {
                order: 1,
              },
            },
            {
              $project: {
                _id: 1,
                taskLabel: 1,
                taskName: 1,
                taskDetails: 1,
                examples: 1,
                keywords: 1,
              },
            },
          ],
          as: "tasks",
        },
      },
    ]);

    return OK(res, domains, "Domain and task created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.query as any;

    const task = await TaskModel.findById(id).select("-flowDiagram");
    return OK(res, task, "Domain and task created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.query as any;

    await TaskModel.findByIdAndUpdate(id, {
      $set: {
        status: "DELETED",
      },
    });
    return OK(res, {}, "Task deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const reorderDomain = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.body;

    if (!from.order || !to.order || !from.id || !to.id) {
      throw new Error("Invalid data");
    }

    await DomainModel.findByIdAndUpdate(from.id, { order: to.order });
    await DomainModel.findByIdAndUpdate(to.id, { order: from.order });

    return OK(res, {}, "Courses updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteDomain = async (req: Request, res: Response) => {
  try {
    const { id } = req.query as any;

    const checkCourseId = await DomainModel.findById(id);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    await DomainModel.findByIdAndUpdate(id, {
      $set: {
        status: "DELETED",
      },
    });

    return OK(res, {}, "Domain deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const downloadDomainSampleQuestionCSV = async (
  req: Request,
  res: Response,
) => {
  try {
    const headers = [
      "type",
      "question",
      "maxSelection",
      "explaination",
      "mcqOptions",
      "mcqCorrectIndexes",
      "fibAnswers",
      "dndLeft",
      "dndRight",
    ];

    const rows = [
      [
        "MCQ",
        "Which planet is closest to the Sun?",
        "1",
        "Mercury is the closest planet",
        "Mercury|Earth|Venus|Mars",
        "0",
        "",
        "",
        "",
      ],
      [
        "FIB",
        "Arrange the planets from Sun",
        "4",
        "Solar system order",
        "",
        "",
        "1:Mercury|2:Venus|3:Earth|4:Mars|0:Sun|0:Jupiter",
        "",
        "",
      ],
      [
        "DND",
        "Match the capitals",
        "2",
        "Countries and capitals",
        "",
        "",
        "",
        "1:India|2:France",
        "a:Delhi|b:Paris|c:London",
      ],
    ];

    const csvContent =
      headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=questions_bulk_upload_sample.csv",
    );

    return res.status(200).send(csvContent);
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const downloadTaskQuestionSampleCSV = async (
  req: Request,
  res: Response,
) => {
  try {
    const headers = [
      "domainName",
      "domainPrice",
      "taskName",
      "taskLabel",
      "taskDetails",
      "examples",
      "keywords",
    ];

    const rows = [
      [
        "Biology",
        10,
        "Cell Structure",
        "Basic",
        "Introduction to cell organelles",
        "Cell structure overview",
        "cells|organelles",
      ],
      [
        "Chemistry",
        10,
        "Periodic Table",
        "Advanced",
        "Learn the organization of elements",
        "Periodic table concepts",
        "elements|periodic table",
      ],
    ];

    const csvContent =
      headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=task_question_bulk_upload_sample.csv",
    );

    return res.status(200).send(csvContent);
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const bulkUploadTaskQuestions = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { courseId } = req.query as any;

    if (!courseId) {
      throw new Error("courseId is required");
    }

    const checkCourseId = await CheckCourseExist(courseId as string);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    const fileData = req.files as any;
    if (!fileData?.length) {
      throw new Error("CSV file is required");
    }

    let domainsCreated = 0;
    let tasksCreated = 0;

    for (const file of fileData) {
      const rows: any[] = [];

      await new Promise<void>((resolve, reject) => {
        Readable.from(file.buffer)
          .pipe(csv())
          .on("data", (row) => rows.push(row))
          .on("end", resolve)
          .on("error", reject);
      });

      if (!rows.length) {
        throw new Error(`CSV file ${file.originalname} is empty`);
      }

      // Group rows by domain and task
      const grouped = new Map<
        string,
        {
          domainName: string;
          domainPrice: number;
          taskName: string;
          taskLabel: string;
          taskDetails: string;
          examples: string;
          keywords: string;
        }
      >();

      for (const row of rows) {
        const {
          domainName,
          domainPrice,
          taskName,
          taskLabel,
          taskDetails,
          examples,
          keywords,
        } = row;

        if (
          !domainName ||
          !taskName ||
          !taskLabel ||
          !taskDetails ||
          !examples ||
          !keywords ||
          domainPrice === undefined ||
          domainPrice === null
        ) {
          throw new Error(
            `Missing required fields: domainName, price, taskName, taskLabel, taskDetails, examples, keywords`,
          );
        }

        const parsedPrice = Number(domainPrice);
        if (Number.isNaN(parsedPrice)) {
          throw new Error(`Invalid price value for domain ${domainName}`);
        }

        const key = `${domainName}|${taskName}`;

        if (!grouped.has(key)) {
          grouped.set(key, {
            domainName,
            domainPrice: parsedPrice,
            taskName,
            taskLabel,
            taskDetails,
            examples,
            keywords,
          });
        }
      }

      // Process each domain-task combination
      for (const groupData of grouped.values()) {
        const {
          domainName,
          domainPrice,
          taskName,
          taskLabel,
          taskDetails,
          examples,
          keywords,
        } = groupData;

        // Check or create domain
        let domain: any = await DomainModel.findOne({
          courseId,
          domain: domainName,
          status: { $ne: "DELETED" },
        }).session(session);

        if (!domain) {
          const domainCount = await DomainModel.countDocuments({
            courseId,
            status: { $ne: "DELETED" },
          }).session(session);

          const createdDomains = await DomainModel.create(
            [
              {
                courseId,
                domain: domainName,
                order: domainCount + 1,
                price: domainPrice,
                status: "ACTIVE",
              },
            ],
            { session },
          );

          domain = createdDomains[0] as any;
          if (!domain) {
            throw new Error("Failed to create domain");
          }
          domainsCreated++;
        } else if (domain.price !== domainPrice) {
          domain = await DomainModel.findByIdAndUpdate(
            domain._id,
            { price: domainPrice },
            { new: true, session },
          );
        }

        // Check or create task
        let task: any = await TaskModel.findOne({
          domainId: domain._id,
          taskName,
          status: { $ne: "DELETED" },
        }).session(session);

        if (!task) {
          const taskCount = await TaskModel.countDocuments({
            domainId: domain._id,
            status: { $ne: "DELETED" },
          }).session(session);

          const createdTasks = await TaskModel.create(
            [
              {
                domainId: domain._id,
                taskName,
                taskLabel,
                taskDetails,
                examples,
                keywords,
                order: taskCount + 1,
                status: "ACTIVE",
              },
            ],
            { session },
          );

          task = createdTasks[0] as any;
          if (!task) {
            throw new Error("Failed to create task");
          }
          tasksCreated++;
        } else {
          task = await TaskModel.findByIdAndUpdate(
            task._id,
            {
              taskLabel,
              taskDetails,
              examples,
              keywords,
            },
            { new: true, session },
          );
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    return OK(
      res,
      {
        domainsCreated,
        tasksCreated,
      },
      "Domains and tasks uploaded successfully",
    );
  } catch (err: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getQuestionsTasks = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.query as any;

    const questions = await QuestionModel.find({
      taskId,
      status: "ACTIVE",
    }).populate("taskId");

    return OK(
      res,
      questions.map((val) => {
        if (val.image) {
          return { ...val, image: getFileUrl(val.image) };
        } else {
          return val;
        }
      }),
      "Questions fetched successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const addTaskQuestion = async (req: Request, res: Response) => {
  try {
    const {
      id, // ✅ NEW (for update)
      courseId,
      taskId,
      question,
      type,
      mcq,
      fib,
      dnd,
      maxSelection,
      explaination,
      image,
    } = req.body;

    if (!courseId || !taskId || !question || !type) {
      throw new Error("courseId, taskId, question & type are required");
    }

    /* ---------- Check Course ---------- */
    const checkCourseId = await CheckCourseExist(courseId);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    /* ---------- Check Task ---------- */
    const checkTask = await TaskModel.findById(taskId);
    if (!checkTask) {
      throw new Error("Module does not exist");
    }

    /* ---------- Type Validation ---------- */
    if (!["MCQ", "FIB", "DND"].includes(type)) {
      throw new Error("Invalid question type");
    }

    const payload: any = {
      courseId,
      taskId,
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

      // ❗ Remove other types
      payload.fib = undefined;
      payload.dnd = undefined;
    }

    /* ======================================================
       FIB VALIDATION
    ====================================================== */
    if (type === "FIB") {
      if (!Array.isArray(fib) || fib.length === 0) {
        throw new Error("FIB answers are required");
      }

      const realAnswers = fib.filter((f: any) => f.correctOrder > 0);

      if (realAnswers.length === 0) {
        throw new Error("At least one correct FIB answer is required");
      }

      const orders = realAnswers.map((f: any) => f.correctOrder);

      const uniqueOrders = new Set(orders);
      if (uniqueOrders.size !== orders.length) {
        throw new Error("Duplicate correctOrder values in FIB");
      }

      const maxOrder = Math.max(...orders);

      for (let i = 1; i <= maxOrder; i++) {
        if (!orders.includes(i)) {
          throw new Error("FIB correctOrder must be continuous from 1");
        }
      }

      if (maxSelection !== realAnswers.length) {
        throw new Error(
          `maxSelection must be ${realAnswers.length} (number of blanks)`,
        );
      }

      payload.fib = fib;

      payload.mcq = undefined;
      payload.dnd = undefined;
    }

    /* ======================================================
       DND VALIDATION
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

      payload.mcq = undefined;
      payload.fib = undefined;
    }

    /* ======================================================
       UPDATE FLOW
    ====================================================== */
    if (id) {
      const existing = await QuestionModel.findById(id);
      if (!existing) {
        throw new Error("Question not found");
      }

      const updated = await QuestionModel.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true },
      );

      return OK(res, updated, "Question updated successfully");
    }

    /* ======================================================
       CREATE FLOW
    ====================================================== */
    if (payload.image) {
      await updateFileInUseByUrl({
        url: image,
        action: "increase",
        fileCategory: "Image",
        fileName: "Question",
      });
    }
    const questionDoc = await QuestionModel.create(payload);

    return OK(res, questionDoc, "Question added successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Failed to process question");
  }
};

export const deleteTaskQuestion = async (req: Request, res: Response) => {
  try {
    const { id } = req.query as any;

    if (!id) throw new Error("id is required");

    const question = await QuestionModel.findByIdAndUpdate(
      id,
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
    return BADREQUEST(res, err.message || "Failed to process question");
  }
};
