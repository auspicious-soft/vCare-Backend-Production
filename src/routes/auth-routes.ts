import type { Request, Response } from "express";
import { Router } from "express";
import * as fs from 'node:fs';
import { access as accessList } from "../utils/constant.js";
import bcrypt from "bcryptjs";
import { AdminModel } from "../models/admin-schema.js";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import {
  adminLogin,
  createUserAccount,
  forgetPassword,
  resendOtp,
  refreshToken,
  socialLogin,
  updatePassword,
  userLogin,
  verifyOTP,
  submitEnquiry,
} from "../controllers/auth-controller.js";
import { getPlatformInfo } from "../controllers/user-controller.js";
import { rawBodyMiddleware } from "../middleware/plan.js";
import { decodeSignedPayload } from "../helpers/plans-helpers.js";
import { handleInAppIOSWebhook } from "../controllers/purchase-controller.js";
import { sendPasswordResetEmail } from "../utils/mail-helper.js";
import { PurchaseModel } from "../models/purchase-schema.js";
import { enquiryRateLimiter } from "../utils/helpers.js";
import { uploadMultiCSV } from "../middleware/multer.js";
import { generateKeyPairSync } from "crypto";

const authRoutes = Router();

// Admin Routes
authRoutes.get("/platform-info", getPlatformInfo);
authRoutes.post("/admin-login", adminLogin);

// User Routes
authRoutes.post("/create-user", createUserAccount);
authRoutes.post("/user-login", userLogin);
authRoutes.post("/social-login", socialLogin);

// Common Routes
authRoutes.post("/refresh-token", refreshToken);
authRoutes.post("/forget-password", forgetPassword);
authRoutes.post("/verify-otp", verifyOTP);
authRoutes.post("/update-password", updatePassword);
authRoutes.get("/resend-otp", resendOtp);

// Public routes to handle website users

authRoutes.post(
  "/public/enquiry",
  enquiryRateLimiter,
  uploadMultiCSV,
  submitEnquiry,
);



const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

// Test Routes
authRoutes.post("/test", async (req: Request, res: Response) => {
  try {
    console.log("Test API Working");
    fs.writeFileSync("cloudfront-public-key.pem", publicKey);
    fs.writeFileSync("cloudfront-private-key.pem", privateKey);
    return OK(res, "Admin created successfully");
  } catch (err) {
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
});

export default authRoutes;
