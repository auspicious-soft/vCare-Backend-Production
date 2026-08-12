import type { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import { CourseModel } from "../models/course-schema.js";
// import redis from "../config/redis.js";
import { CourseIntroModel } from "../models/course-intro-schema.js";
import { createPlansDirectlyToStripe, updatePlans } from "./plan-controller.js";
import { updateFileInUseByUrl } from "./files-controller.js";
import { getFileUrl } from "../helpers/index.js";

export const createCourse = async (req: Request, res: Response) => {
  try {
    let {
      name,
      image = null,
      status = "ACTIVE",
      hasLessons = true,
      hasDomainTask = true,
      hasPracticeQuestion = true,
      hasMockExam = true,
      hasFlashCards = true,
      hasApplicationSupport = true,
      hasExamStrategy = true,
      hasCertificates = true,
    } = req.body;

    if (!name) {
      throw new Error("Name is required");
    }

    if (status !== "ACTIVE" && status !== "INACTIVE") {
      throw new Error("Invalid status");
    }

    const checkCourse = await CourseModel.findOne({name, status: "ACTIVE"});

    if(checkCourse) {
      throw new Error("Course name already exist, try a different name")
    }

    const order = await CourseModel.countDocuments();

    const data = await CourseModel.create({
      name,
      order: order + 1,
      image,
      status,
      hasLessons,
      hasDomainTask,
      hasPracticeQuestion,
      hasMockExam,
      hasFlashCards,
      hasApplicationSupport,
      hasExamStrategy,
      hasCertificates,
    });
    if(image) {
      await updateFileInUseByUrl({ url: image, action: "increase", fileCategory: "Image", fileName: name });
    }
    await createPlansDirectlyToStripe({ courseName: name, courseId: data._id }, res);
    // await redis.del("COURSES:ACTIVE");
    return OK(res, data, "Course created successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const getCourses = async (req: Request, res: Response) => {
  try {
    // const cacheKey = "COURSES:ACTIVE";
    let courseData = [] as any;
    // // 1. Try Redis
    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   courseData = JSON.parse(cached);
    // } else {
      courseData = (await CourseModel.find({ status: { $ne: "DELETED" } })
        .sort({ order: 1 })
        .lean()) as any;
    // }

    const result = courseData?.map((val: any)=> {
      if(val?.image){
        return {...val, image: getFileUrl(val.image)}
      } else{
        return val
      }
    })

    // await redis.set(cacheKey, JSON.stringify(result));


    return OK(res, result, "Courses fetched successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const updateCourse = async (req: Request, res: Response) => {
  try {
    const {
      id,
      name,
      image = null,
      status = "ACTIVE",
      hasLessons = true,
      hasDomainTask = true,
      hasPracticeQuestion = true,
      hasMockExam = true,
      hasFlashCards = true,
      hasApplicationSupport = true,
      hasExamStrategy = true,
      hasCertificates = true,
    } = req.body;

    if (!id) {
      throw new Error("Id is required");
    }

    if (status !== "ACTIVE" && status !== "INACTIVE") {
      throw new Error("Invalid status");
    }
    const oldData = await CourseModel.findById(id);
    if(image) {
      if (oldData?.image) {
        await updateFileInUseByUrl({ url: oldData.image, action: "decrease", fileCategory: "Image", fileName: oldData.name || "Course Image" });
      }
      await updateFileInUseByUrl({ url: image, action: "increase", fileCategory: "Image", fileName: name || oldData?.name || "Course Image" });
    }
    const newData = await CourseModel.findByIdAndUpdate(
      id,
      {
        name,
        image,
        status,
        hasLessons,
        hasDomainTask,
        hasPracticeQuestion,
        hasMockExam,
        hasFlashCards,
        hasApplicationSupport,
        hasExamStrategy,
        hasCertificates,
      },
      { new: true },
    );

    // await redis.del("COURSES:ACTIVE");
    // await redis.del(`COURSE_INTRO:${id}`);
    if(newData?.status !== oldData?.status) await updatePlans({  courseId: id, status }, res);
    return OK(res, newData, "Courses updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const reorderCourses = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.body;

    if (!from.order || !to.order || !from.id || !to.id) {
      throw new Error("Invalid data");
    }

    await CourseModel.findByIdAndUpdate(from.id, { order: to.order });
    await CourseModel.findByIdAndUpdate(to.id, { order: from.order });

    // await redis.del("COURSES:ACTIVE");
    return OK(res, {}, "Courses updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const deleteCourse = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    if (!id) throw new Error("Id is required");

    // 1. Soft delete
    const data = await CourseModel.findByIdAndUpdate(id, { status: "DELETED" });
    if(data?.image){
      await updateFileInUseByUrl({ url: data.image, action: "decrease", fileCategory: "Image", fileName: data.name || "Course Image" });
    }
    // await redis.del("COURSES:ACTIVE");
    return OK(res, {}, "Course deleted & reordered successfully");
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

export const createCourseIntro = async (req: Request, res: Response) => {
  try {
    return OK(res, {}, "Course deleted & reordered successfully");
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// Course Intro
export const getCourseIntro = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new Error("Id is required");
    }
    // const cacheKey = `COURSE_INTRO:${id}`;
    // const cached = await redis.get(cacheKey);
    let courseData = null
    // if (cached) {
    //   courseData = JSON.parse(cached)
    // } else {
      courseData = await CourseIntroModel.findOne({
      courseId: id,
    }).populate({ path: "courseId", select: "name" }).lean();
    // }

    // if (!cached) {
    //   await redis.set(cacheKey, JSON.stringify(courseData));
    // }
  
    if(!courseData){
      return OK(res, [], "Course intro fetched");
    }
    const fileData = courseData?.uploadFiles?.files?.map((val:any)=>{
      if(val?.url){
        return {...val, url: getFileUrl(val.url)}
      }else{
        return val
      }
    })

    return OK(res, {...courseData, uploadFiles: {...courseData.uploadFiles, files: fileData}}, "Course intro fetched");
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
export const createUpdateIntro = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new Error("Id is required");
    }
    
    const data = await CourseIntroModel.findOneAndUpdate(
      { courseId: id },
      { $set: req.body },
      { upsert: true, new: true, runValidators: true },
    );

    const uploadFileUrls = Array.isArray(req.body?.uploadFiles?.files)
      ? req.body.uploadFiles.files
          .map((file: { url?: string }) => file?.url)
          .filter((url: unknown): url is string => typeof url === "string" && !!url.trim())
      : [];

    if (uploadFileUrls.length > 0) {
      await Promise.all(
        uploadFileUrls.map((url: string) =>
          updateFileInUseByUrl({ url, action: "increase", fileCategory: "File", fileName: "Course Intro Asset" }),
        ),
      );
    }
    // const cacheKey = `COURSE_INTRO:${id}`;
    // await redis.del(cacheKey);
    return OK(res, data, "Course-intro saved successfully");
  } catch (err: any) {
    return err.message
      ? BADREQUEST(res, err.message)
      : INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};
