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
import { FlashCardCategoryModel } from "../models/flash-card-category-schema.js";
import { uploadFileToS3 } from "../config/s3.js";
import { FlashCardModel } from "../models/flash-card-schema.js";
import csv from "csv-parser";
import { Readable } from "stream";
import mongoose from "mongoose";
import { updateFileInUseByUrl } from "./files-controller.js";

const getNextFlashcardCategoryOrder = async (
  courseId: string | mongoose.Types.ObjectId,
) => {
  const lastCategory = await FlashCardCategoryModel.findOne({
    courseId,
    status: "ACTIVE",
  })
    .sort({ order: -1 })
    .select("order")
    .lean();

  return (lastCategory?.order || 0) + 1;
};

const normalizeFlashcardCategoryOrder = async (
  courseId: string | mongoose.Types.ObjectId,
) => {
  const categories = await FlashCardCategoryModel.find({
    courseId,
    status: "ACTIVE",
  })
    .sort({ order: 1, createdAt: 1 })
    .select("_id order")
    .lean();

  const updates = categories
    .map((category, index) => ({
      id: category._id,
      nextOrder: index + 1,
      currentOrder: category.order,
    }))
    .filter((item) => item.currentOrder !== item.nextOrder)
    .map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { order: item.nextOrder } },
      },
    }));

  if (updates.length) {
    await FlashCardCategoryModel.bulkWrite(updates);
  }
};

const getNextFlashcardOrder = async (
  categoryId: string | mongoose.Types.ObjectId,
) => {
  const lastCard = await FlashCardModel.findOne({
    categoryId,
    status: "ACTIVE",
  })
    .sort({ order: -1 })
    .select("order")
    .lean();

  return (lastCard?.order || 0) + 1;
};

const normalizeFlashcardOrder = async (
  categoryId: string | mongoose.Types.ObjectId,
) => {
  const cards = await FlashCardModel.find({
    categoryId,
    status: "ACTIVE",
  })
    .sort({ order: 1, createdAt: 1 })
    .select("_id order")
    .lean();

  const updates = cards
    .map((card, index) => ({
      id: card._id,
      nextOrder: index + 1,
      currentOrder: card.order,
    }))
    .filter((item) => item.currentOrder !== item.nextOrder)
    .map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { order: item.nextOrder } },
      },
    }));

  if (updates.length) {
    await FlashCardModel.bulkWrite(updates);
  }
};

const parseReorderPayload = (node: any) => {
  const id = String(node?.id || "");
  const order = Number(node?.order);

  if (!mongoose.Types.ObjectId.isValid(id) || !Number.isInteger(order) || order < 1) {
    throw new Error("Invalid data");
  }

  return { id, order };
};

export const createFlashcardCategory = async (req: Request, res: Response) => {
  try {
    const { courseId, categoryName, price = 0 } = req.body;

    const checkCourseId = await CheckCourseExist(courseId);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    const checkExist = await FlashCardCategoryModel.findOne({
      courseId,
      categoryName,
      status: { $ne: "DELETED" },
    });

    if (checkExist) {
      throw new Error("Category name already exist");
    }

    const nextOrder = await getNextFlashcardCategoryOrder(courseId);

    const data = await FlashCardCategoryModel.create({
      courseId,
      categoryName,
      price,
      order: nextOrder,
    });

    return OK(res, data, "Created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getFlashcardCategory = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.query;

    if (!courseId) {
      throw new Error("Course Id is required");
    }

    const data = await FlashCardCategoryModel.aggregate([
      {
        $match: {
          courseId: new mongoose.Types.ObjectId(courseId as string),
          status: "ACTIVE",
        },
      },
      {
        $lookup: {
          from: "flashcards",
          localField: "_id",
          foreignField: "categoryId",
          pipeline: [
            {
              $match: { status: "ACTIVE" },
            },
          ],
          as: "flashcards",
        },
      },
      {
        $addFields: {
          flashcardCount: { $size: "$flashcards" },
        },
      },
      {
        $project: {
          flashcards: 0,
        },
      },
      {
        $sort: { order: 1 },
      },
    ]);

    return OK(res, data, "Fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteFlashcardCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;

    const data = await FlashCardCategoryModel.findByIdAndUpdate(id, {
      $set: { status: "DELETED" },
    });

    if (data?.courseId) {
      await normalizeFlashcardCategoryOrder(data.courseId);
    }

    return OK(res, {}, "Deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateFlashcardCategory = async (req: Request, res: Response) => {
  try {
    const { id, courseId, categoryName, price } = req.body;

    if (!id) {
      throw new Error("Category id is required");
    }

    const existing = await FlashCardCategoryModel.findById(id);
    if (!existing) {
      throw new Error("Category not found");
    }

    // If courseId is being changed, validate it
    if (courseId) {
      const checkCourseId = await CheckCourseExist(courseId);
      if (typeof checkCourseId === "string") {
        throw new Error(checkCourseId);
      }
    }

    const finalCourseId = courseId || existing.courseId;
    const finalCategoryName = categoryName || existing.categoryName;

    // 🔥 Check duplicate except current document
    const duplicate = await FlashCardCategoryModel.findOne({
      _id: { $ne: id }, // exclude current doc
      courseId: finalCourseId,
      categoryName: finalCategoryName,
      status: { $ne: "DELETED" }, // ignore deleted
    });

    if (duplicate) {
      throw new Error("Category name already exists for this course");
    }

    if (price !== undefined && price < 0) {
      throw new Error("Invalid Price");
    }

    const isCourseChanged =
      !!courseId && String(existing.courseId) !== String(courseId);

    const updated = await FlashCardCategoryModel.findByIdAndUpdate(
      id,
      {
        ...(courseId && { courseId }),
        ...(categoryName && { categoryName }),
        ...(price !== undefined && { price }),
        ...(isCourseChanged && {
          order: await getNextFlashcardCategoryOrder(courseId),
        }),
      },
      { new: true },
    );

    if (isCourseChanged) {
      await normalizeFlashcardCategoryOrder(existing.courseId);
    }

    return OK(res, updated, "Updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const reorderFlashCardCategory = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.body;
    const fromData = parseReorderPayload(from);
    const toData = parseReorderPayload(to);

    if (fromData.id === toData.id) {
      throw new Error("Invalid data");
    }

    const [fromCategory, toCategory] = await Promise.all([
      FlashCardCategoryModel.findById(fromData.id).lean(),
      FlashCardCategoryModel.findById(toData.id).lean(),
    ]);

    if (!fromCategory || !toCategory) {
      throw new Error("Invalid data");
    }
    if (
      fromCategory.status !== "ACTIVE" ||
      toCategory.status !== "ACTIVE" ||
      String(fromCategory.courseId) !== String(toCategory.courseId)
    ) {
      throw new Error("Invalid data");
    }

    await FlashCardCategoryModel.findByIdAndUpdate(fromData.id, {
      order: toData.order,
    });
    await FlashCardCategoryModel.findByIdAndUpdate(toData.id, {
      order: fromData.order,
    });

    // await redis.del("COURSES:ACTIVE");
    return OK(res, {}, "Courses updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const createFlashcard = async (req: Request, res: Response) => {
  try {
    let { categoryId, frontText, backText } = req.body;

    const checkExist = await FlashCardCategoryModel.findById(categoryId);

    if (!checkExist) {
      throw new Error("Invalid category Id");
    }

    const fileData = req.files as any;

    let frontImageUrl;
    let backImageUrl;

    const frontfile = fileData.find(
      (data: any) => data.fieldname === "frontImage",
    );
    const backfile = fileData.find(
      (data: any) => data.fieldname === "backImage",
    );

    if (frontfile) {
      const diagramFile = frontfile;

      const uploadResult: any = await uploadFileToS3(
        diagramFile.buffer,
        diagramFile.originalname,
        diagramFile.mimetype,
        (req as any).admin.id,
        "diagram",
        true,
      );

      frontImageUrl = uploadResult.key || uploadResult.url;
    }
    if (backfile) {
      const diagramFile = backfile;

      const uploadResult: any = await uploadFileToS3(
        diagramFile.buffer,
        diagramFile.originalname,
        diagramFile.mimetype,
        (req as any).admin.id,
        "diagram",
        true,
      );

      backImageUrl = uploadResult.key || uploadResult.url;
    }

    const nextOrder = await getNextFlashcardOrder(categoryId);

    const data = await FlashCardModel.create({
      categoryId,
      order: nextOrder,
      frontText,
      frontImage: frontImageUrl,
      backText,
      backImage: backImageUrl,
    });
    if (backImageUrl) {
      await updateFileInUseByUrl({
        url: backImageUrl,
        action: "increase",
        fileCategory: "Image",
        fileName: "Flashcard Back Image",
      });
    }
    if (frontImageUrl) {
      await updateFileInUseByUrl({
        url: frontImageUrl,
        action: "increase",
        fileCategory: "Image",
        fileName: "Flashcard Front Image",
      });
    }
    return OK(res, data, "Created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getFlashcard = async (req: Request, res: Response) => {
  try {
    let { categoryId, search } = req.query as any;

    const checkExist = await FlashCardCategoryModel.findById(categoryId);

    if (!checkExist) {
      throw new Error("Invalid category Id");
    }

    const query: any = {
      categoryId,
      status: "ACTIVE",
    };

    if (search && search.trim() !== "") {
      query.$or = [
        { frontText: { $regex: search, $options: "i" } },
        { backText: { $regex: search, $options: "i" } },
      ];
    }

    const data = await FlashCardModel.find(query).sort({ order: 1, createdAt: 1 });

    return OK(res, data, "Data fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const downloadFlashcardSampleCSV = async (
  req: Request,
  res: Response,
) => {
  try {
    const headers = [
      "frontText",
      "backText",
      "frontImage",
      "backImage",
      "price",
    ];

    const rows = [
      [
        "What is the capital of France?",
        "Paris",
        "",
        "",
        "0",
      ],
      [
        "Hello",
        "World",
        "https://cdn.example.com/flashcard-front.png",
        "https://cdn.example.com/flashcard-back.png",
        "0",
      ],
    ];

    const csvContent =
      headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=flashcard_bulk_upload_sample.csv",
    );

    return res.status(200).send(csvContent);
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const bulkUploadFlashcards = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.query as any;

    if (!categoryId) {
      throw new Error("categoryId is required");
    }

    const category = await FlashCardCategoryModel.findById(categoryId);
    if (!category) {
      throw new Error("Invalid category Id");
    }

    if (!req.file) {
      throw new Error("CSV file is required");
    }

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

    const nextOrder = await getNextFlashcardOrder(categoryId);

    const flashcards = rows.map((row, index) => {
      if (!row.frontText && !row.backText) {
        throw new Error("Each flashcard must contain frontText or backText");
      }

      return {
        categoryId,
        order: nextOrder + index,
        frontText: row.frontText || "",
        backText: row.backText || "",
        frontImage: row.frontImage || undefined,
        backImage: row.backImage || undefined,
        price: Number(row.price) || 0,
      };
    });

    const created = await FlashCardModel.insertMany(flashcards);

    await Promise.all(
      created.flatMap((card) => {
        const ops: Promise<any>[] = [];
        if (card.frontImage) {
          ops.push(
            updateFileInUseByUrl({
              url: card.frontImage,
              action: "increase",
              fileCategory: "Image",
              fileName: "Flashcard Front Image",
            }),
          );
        }
        if (card.backImage) {
          ops.push(
            updateFileInUseByUrl({
              url: card.backImage,
              action: "increase",
              fileCategory: "Image",
              fileName:  "Flashcard Back Image",
            }),
          );
        }
        return ops;
      }).flat(),
    );

    return OK(
      res,
      { createdCount: created.length },
      "Flashcards uploaded successfully",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateFlashcard = async (req: Request, res: Response) => {
  try {
    const { id, categoryId, frontText, backText, frontImage, backImage } =
      req.body;

    const existingFlashcard = await FlashCardModel.findById(id);

    if (!existingFlashcard) {
      throw new Error("Invalid flashcard Id");
    }

    // Optional: validate category if being changed
    if (categoryId) {
      const checkCategory = await FlashCardCategoryModel.findById(categoryId);
      if (!checkCategory) {
        throw new Error("Invalid category Id");
      }
    }

    const isCategoryChanged =
      !!categoryId && String(existingFlashcard.categoryId) !== String(categoryId);

    const files = (req.files as Express.Multer.File[]) || [];

    let frontImageUrl = existingFlashcard.frontImage;
    let backImageUrl = existingFlashcard.backImage;

    const frontFile = files.find((file) => file.fieldname === "frontImage");

    const backFile = files.find((file) => file.fieldname === "backImage");

    // ================= FRONT IMAGE =================
    if (frontFile) {
      const uploadResult: any = await uploadFileToS3(
        frontFile.buffer,
        frontFile.originalname,
        frontFile.mimetype,
        (req as any).admin.id,
        "flashcard",
        true,
      );

      frontImageUrl = uploadResult.key || uploadResult.url;
    } else if (frontImage !== undefined) {
      // If frontend sends link or empty string
      frontImageUrl = frontImage;
    }

    // ================= BACK IMAGE =================
    if (backFile) {
      const uploadResult: any = await uploadFileToS3(
        backFile.buffer,
        backFile.originalname,
        backFile.mimetype,
        (req as any).admin.id,
        "flashcard",
        true,
      );

      backImageUrl = uploadResult.key || uploadResult.url;
    } else if (backImage !== undefined) {
      backImageUrl = backImage;
    }

    const targetCategoryId = categoryId || existingFlashcard.categoryId;
    const nextOrder = isCategoryChanged
      ? await getNextFlashcardOrder(targetCategoryId)
      : existingFlashcard.order;

    const updatedData = await FlashCardModel.findByIdAndUpdate(
      id,
      {
        categoryId: targetCategoryId,
        order: nextOrder,
        frontText: frontText ?? existingFlashcard.frontText,
        backText: backText ?? existingFlashcard.backText,
        frontImage: frontImageUrl,
        backImage: backImageUrl,
      },
      { new: true },
    );

    const hasFrontImageChanged = frontImageUrl !== existingFlashcard.frontImage;
    const hasBackImageChanged = backImageUrl !== existingFlashcard.backImage;

    if (hasFrontImageChanged) {
      if (existingFlashcard.frontImage) {
        await updateFileInUseByUrl({
          url: existingFlashcard.frontImage,
          action: "decrease",
          fileCategory: "Image",
          fileName:  "Flashcard Front Image",
        });
      }
      if (frontImageUrl) {
        await updateFileInUseByUrl({
          url: frontImageUrl,
          action: "increase",
          fileCategory: "Image",
          fileName: "Flashcard Front Image",
        });
      }
    }
    if (hasBackImageChanged) {
      if (existingFlashcard.backImage) {
        await updateFileInUseByUrl({
          url: existingFlashcard.backImage,
          action: "decrease",
          fileCategory: "Image",
          fileName: "Flashcard Back Image",
        });
      }
      if (backImageUrl) {
        await updateFileInUseByUrl({
          url: backImageUrl,
          action: "increase",
          fileCategory: "Image",
          fileName:"Flashcard Back Image",
        });
      }
    }

    if (isCategoryChanged) {
      await normalizeFlashcardOrder(existingFlashcard.categoryId);
    }

    return OK(res, updatedData, "Updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteFlashcard = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;

    const existingFlashcard = await FlashCardModel.findById(id);

    if (!existingFlashcard) {
      throw new Error("Invalid flashcard Id");
    }

    await FlashCardModel.findByIdAndUpdate(id, { $set: { status: "DELETED" } });
    if (existingFlashcard.frontImage) {
      await updateFileInUseByUrl({
        url: existingFlashcard.frontImage,
        action: "decrease",
        fileCategory: "Image",
        fileName: "Flashcard Front Image",
      });
    }
    if (existingFlashcard.backImage) {
      await updateFileInUseByUrl({
        url: existingFlashcard.backImage,
        action: "decrease",
        fileCategory: "Image",
        fileName: "Flashcard Back Image",
      });
    }

    await normalizeFlashcardOrder(existingFlashcard.categoryId);
    return OK(res, {}, "Deleted successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const reorderFlashcards = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.body;
    const fromData = parseReorderPayload(from);
    const toData = parseReorderPayload(to);

    if (fromData.id === toData.id) {
      throw new Error("Invalid data");
    }

    const [fromCard, toCard] = await Promise.all([
      FlashCardModel.findById(fromData.id).lean(),
      FlashCardModel.findById(toData.id).lean(),
    ]);

    if (!fromCard || !toCard) {
      throw new Error("Invalid data");
    }
    if (
      fromCard.status !== "ACTIVE" ||
      toCard.status !== "ACTIVE" ||
      String(fromCard.categoryId) !== String(toCard.categoryId)
    ) {
      throw new Error("Invalid data");
    }

    await FlashCardModel.findByIdAndUpdate(fromData.id, { order: toData.order });
    await FlashCardModel.findByIdAndUpdate(toData.id, { order: fromData.order });

    // await redis.del("COURSES:ACTIVE");
    return OK(res, {}, "Flashcards updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
