import type { NextFunction, Request, Response } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createRequire } from "module";
import multer from "multer";
import sharp from "sharp";
import {
  BADREQUEST,
  CREATED,
  INTERNAL_SERVER_ERROR,
  OK,
} from "../utils/responses.js";
import { deleteFileFromS3, uploadFileToS3 } from "../config/s3.js";
import { UploadedFilesModel } from "../models/upload-files-schema.js";
import redis from "../config/redis.js";
import { CourseModel } from "../models/course-schema.js";
import { CheckCourseExist } from "../utils/helpers.js";
import { getFileUrl } from "../helpers/index.js";

const require = createRequire(import.meta.url);
const ffmpegBinaryPath = require("ffmpeg-static") as string | null;
const execFileAsync = promisify(execFile);
const storage = multer.memoryStorage();

const replaceExtension = (fileName: string, nextExt: string) => {
  const parsed = path.parse(fileName);
  return `${parsed.name}${nextExt}`;
};

const compressVideoBuffer = async (inputBuffer: Buffer): Promise<Buffer> => {
  if (!ffmpegBinaryPath) {
    throw new Error("ffmpeg binary not found for video compression");
  }

  const inputPath = path.join(
    os.tmpdir(),
    `upload-in-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );
  const outputPath = path.join(
    os.tmpdir(),
    `upload-out-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    await execFileAsync(ffmpegBinaryPath, [
      "-y",
      "-i",
      inputPath,
      "-vcodec",
      "libx264",
      "-crf",
      "30",
      "-preset",
      "veryfast",
      "-acodec",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    return await fs.promises.readFile(outputPath);
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(inputPath),
      fs.promises.unlink(outputPath),
    ]);
  }
};

export const getS3KeyFromUrlOrKey = (urlOrKey: string): string => {
  const rawValue = (urlOrKey || "").trim();
  if (!rawValue) {
    return "";
  }

  const bucketBaseUrl = (process.env.NEXT_PUBLIC_AWS_BUCKET_PATH || "")
    .trim()
    .replace(/\/+$/, "");
  if (bucketBaseUrl) {
    const directPrefix = `${bucketBaseUrl}/`;
    if (rawValue.startsWith(directPrefix)) {
      return rawValue.slice(directPrefix.length).replace(/^\/+/, "");
    }
    if (rawValue === bucketBaseUrl) {
      return "";
    }
  }

  if (!/^https?:\/\//i.test(rawValue)) {
    return rawValue.replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(rawValue);
    let key = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    const bucketName = process.env.AWS_BUCKET_NAME;

    // Handle path-style URL like: s3.amazonaws.com/<bucket>/<key>
    if (bucketName && key.startsWith(`${bucketName}/`)) {
      key = key.slice(bucketName.length + 1);
    }

    return key;
  } catch {
    return rawValue.replace(/^\/+/, "");
  }
};

export const multerUpload = multer({
  storage,
  limits: { fileSize: 1000 * 1024 * 1024 },
}).single("file");

export const multerUpload2 = multer({
  storage,
  limits: { fileSize: 1000 * 1024 * 1024 },
}).fields([
  { name: "frontImage", maxCount: 1 },
  { name: "backImage", maxCount: 1 },
]);

export const uploadToS3 = async (req: Request, res: Response) => {
  try {
    const info = req as any;
    let userData, role, id;

    if (info?.user) {
      userData = info.user as any;
      role = "USER";
      id = info.user._id;
    } else {
      userData = info.admin as any;
      role = "ADMIN";
      id = info.admin._id;
    }
    const file = info.file;

    if (!file || !id) {
      return BADREQUEST(res, "Missing file or user");
    }

    let fileBuffer = file.buffer;
    let uploadMimeType = file.mimetype;
    let uploadFileName = file.originalname;

    if (file.mimetype.startsWith("image/")) {
      fileBuffer = await sharp(file.buffer)
        .resize({ width: 1280 }) // optional: resize max width
        .jpeg({ quality: 50 }) // compress JPEG to ~50% quality
        .toBuffer();
      uploadMimeType = "image/jpeg";
      uploadFileName = replaceExtension(file.originalname, ".jpg");
    }

    if (file.mimetype.startsWith("video/")) {
      fileBuffer = await compressVideoBuffer(file.buffer);
      uploadMimeType = "video/mp4";
      uploadFileName = replaceExtension(file.originalname, ".mp4");
    }

    const fileCategory = uploadMimeType.split("/")[0] || "other";
    const result = await uploadFileToS3(
      fileBuffer,
      uploadFileName,
      uploadMimeType,
      id,
      fileCategory,
      role === "ADMIN",
    );

    return CREATED(res, result);
  } catch (err: any) {
    console.error("S3 Upload Error:", err);
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res);
  }
};
export const uploadFiles = async (req: Request, res: Response) => {
  try {
    const { courseId, url, fileName, fileCategory } = req.body;
    if (!courseId || !url || !fileName || !fileCategory) {
      throw new Error("All fields are required");
    }
    const checkCourseId = await CheckCourseExist(courseId);
    if (typeof checkCourseId === "string") {
      throw new Error(checkCourseId);
    }

    await UploadedFilesModel.create({
      ...req.body,
    });
    return OK(res, {}, "File uploaded successfully");
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const getFiles = async (req: Request, res: Response) => {
  try {
    let { type = "All", page = 1, limit = 10, search = "" } = req.query as any;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    if (!["All", "Image", "Video", "File"].includes(type)) {
      throw new Error("Invalid file type");
    }
    const filter: any = {};
    if (type !== "All") {
      filter.fileCategory = type;
    }

    if (search) {
      filter.$or = [
        { fileName: { $regex: search, $options: "i" } },
        { fileCategory: { $regex: search, $options: "i" } },
        { url: { $regex: search, $options: "i" } },
      ];
    }

    const [data, totalCount] = await Promise.all([
      UploadedFilesModel.find(filter)
        .populate({
          path: "courseId",
          select: "name",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      UploadedFilesModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return OK(
      res,
      {
        data: data?.map((val)=>{
          if(val.url){
            return {...val, newUrl: getFileUrl(val.url) }
          } else {
            return val
          }
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
      "Data fetched successfully",
    );
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const deleteFiles = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;

    const checkExist:any = await UploadedFilesModel.findById(id);
    if (!checkExist) {
      throw new Error("File doesn't exist");
    }
    if(checkExist && checkExist?.inUse > 0){
      throw new Error("File is in use");
    }
    await deleteFileFromS3(checkExist?.url);

    await UploadedFilesModel.findByIdAndDelete(id);

    return OK(res, {}, "File deleted successfully");
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateFileInUseByUrl = async (req: {
  url: string;
  action: "increase" | "decrease";
  fileCategory?: string;
  fileName?: string;
}) => {
  const { url, action, fileCategory, fileName } = req;
  if (!url) {
    throw new Error("url is required");
  }

  const key = getS3KeyFromUrlOrKey(url);
  if (!key) {
    throw new Error("Invalid url");
  }

  const normalizedUrl = url.trim();
  const loweredKey = key.toLowerCase();
  const derivedCategory =
    fileCategory?.trim() ||
    (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(loweredKey)
      ? "Image"
      : /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(loweredKey)
        ? "Video"
        : "File");
  const derivedFileName = fileName?.trim() || `${derivedCategory} Asset`;

  const existingFile = await UploadedFilesModel.findOne({
    $or: [{ url: key }, { url: normalizedUrl }],
  });

  if (action === "increase") {
    if (existingFile) {
      existingFile.inUse = (existingFile.inUse || 0) + 1;
      await existingFile.save();
      return existingFile;
    }

    const createdFile = await UploadedFilesModel.create({
      url: key,
      fileCategory: derivedCategory,
      fileName: derivedFileName,
      inUse: 1,
    });
    return createdFile;
  }

  if (!existingFile) {
    return null;
  }

  existingFile.inUse = Math.max((existingFile.inUse || 0) - 1, 0);
  await existingFile.save();
  return existingFile;
};

export const handleFilesInFormData = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const storage = multer.memoryStorage();

  const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    const imageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    const isCSV =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");

    switch (file.fieldname) {
      case "task_diagram":
        if (imageTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error("Invalid image format for task_diagram"));
        }
        break;
      case "frontImage":
        if (imageTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error("Invalid image format for task_diagram"));
        }
        break;
      case "backImage":
        if (imageTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error("Invalid image format for task_diagram"));
        }
        break;

      case "task_question_CSV":
        if (isCSV) {
          cb(null, true);
        } else {
          cb(new Error("Invalid CSV format"));
        }
        break;

      default:
        // Allow other fields dynamically (optional)
        cb(null, true);
    }
  };

  const upload = multer({
    storage,
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter,
  }).any(); // 🔥 IMPORTANT CHANGE

  upload(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    next();
  });
};
