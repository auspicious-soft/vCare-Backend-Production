import jwt from "jsonwebtoken";
import { UNAUTHORIZED } from "../utils/responses.js";
import { AdminModel } from "../models/admin-schema.js";
import { UserModel } from "../models/user-schema.js";
import type { NextFunction, Request, Response } from "express";
import { access } from "../utils/constant.js";
import { trackDailyActiveUser } from "../utils/helpers.js";
import { getFileUrl } from "../helpers/index.js";

export interface AuthRequest extends Request {
  user?: any;
}

export const adminAuthGuard = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return UNAUTHORIZED(res, "Access token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY!) as any;

    const checkAdmin = await AdminModel.findById(decoded?.id).lean();
    console.log("Requested URL =======> ", req.url);

    if (checkAdmin?.status !== "ACTIVE") {
      throw new Error("Account is Blocked");
    }

    const requiredAccess = Object.values(access).find((data) =>
      req.url.startsWith(data.url),
    ) as any;

    if (!checkAdmin?.access?.includes(requiredAccess?.value)) {
      throw new Error("Invalid Access");
    }
    (req as any).admin = {
      ...checkAdmin,
      image: checkAdmin?.image
        ? getFileUrl(checkAdmin.image)
        : checkAdmin.image,
    };
    next();
  } catch (err: any) {
    return UNAUTHORIZED(res, err.message || "Invalid or expired token");
  }
};

export const userAuthGuard = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return UNAUTHORIZED(res, "Access token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY!) as any;

    const checkUser = await UserModel.findById(decoded?.id).lean();

    if (checkUser?.status === "BLOCKED") {
      throw new Error("Account is Blocked by the Admin");
    }

    if (checkUser?.status === "DELETED" && checkUser?.deletedAt) {
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      const deletedTime = new Date(checkUser.deletedAt).getTime();
      const now = Date.now();
      const diff = now - deletedTime;

      if (diff > THIRTY_DAYS) {
        throw new Error("Account is permanently deleted");
      } else {
        await UserModel.findByIdAndUpdate(checkUser._id, {
          $set: { deletedAt: null, status: "ACTIVE" },
        });
      }
    }

    if (checkUser && checkUser.status === "ACTIVE") {
      trackDailyActiveUser(checkUser?._id.toString());

      (req as any).user = {
        ...checkUser,
        id: checkUser._id,
        image: checkUser?.image ? getFileUrl(checkUser.image) : checkUser.image,
      };
      next();
    } else {
      return UNAUTHORIZED(res, "Invalid or expired token");
    }
  } catch (err: any) {
    return UNAUTHORIZED(res, err.message || "Invalid or expired token");
  }
};
