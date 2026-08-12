import type { Request, Response } from "express";
import {
  BADREQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  OK,
  UNAUTHORIZED,
} from "../utils/responses.js";
import { AdminModel } from "../models/admin-schema.js";
import bcrypt from "bcryptjs";

import {
  clearLoginFailures,
  isLoginBlocked,
  recordFailedLogin,
} from "../helpers/redis-helpers.js";
import jwt from "jsonwebtoken";
import { RefreshTokenModel } from "../models/refreshtoken-schema.js";
import dayjs from "dayjs";
import { hashToken, verifyAppleToken } from "../helpers/auth-helpers.js";
import { OTPModel } from "../models/otp-schema.js";
import { UserModel } from "../models/user-schema.js";
import { randomUUID } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { clearCache } from "../utils/helpers.js";
import {
  resendOTPMail,
  sendEmailVerificationMail,
  sendEnquiryEmail,
  sendPasswordResetEmail,
  sendWelcomeUserEmail,
} from "../utils/mail-helper.js";
import { getFileUrl } from "../helpers/index.js";

// Admin Login
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const IP = req.ip as string;
    const checkIP = await isLoginBlocked(email, IP);

    if (checkIP.blocked) {
      let reason = "";
      const waitTime = checkIP.retryAfterSeconds
        ? Math.ceil(checkIP.retryAfterSeconds / 60)
        : 15;
      if (checkIP.reason === "EMAIL") {
        reason = `Too many failed login attempts for this email. Try again in ${waitTime} minutes.`;
      } else if (checkIP.reason === "IP") {
        reason = `Too many failed login attempts from this IP address. Try again in ${waitTime} minutes.`;
      }
      return BADREQUEST(res, reason);
    }

    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const admin = (await AdminModel.findOne({ email })) as any;

    if (!admin) {
      await recordFailedLogin(email, IP);
      throw new Error("Invalid email or password");
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      await recordFailedLogin(email, IP);
      throw new Error("Invalid email or password");
    }

    // Generate token
    const accessToken = jwt.sign(
      {
        id: admin._id,
        role: admin.role,
        access: admin.access,
      },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: "50d" },
    );

    const refreshToken = randomUUID();

    await clearLoginFailures(email, IP);
    await RefreshTokenModel.create({
      adminId: admin._id,
      tokenHash: hashToken(refreshToken),
      ip: IP,
      userType: "ADMIN",
      expiresAt: dayjs().add(30, "day").toDate(),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return OK(
      res,
      {
        accessToken,
        admin: {
          id: admin._id,
          firstname: admin.firstname,
          lastname: admin.lastname,
          email: admin.email,
          role: admin.role,
          access: admin.access,
          image: getFileUrl(admin.image),
        },
      },
      "Login successful",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// Create User Account
export const createUserAccount = async (req: Request, res: Response) => {
  try {
    const {
      firstname,
      lastname,
      email,
      countryCode,
      phoneNumber,
      password,
      fcmToken,
      deviceType,
    } = req.body;

    if (
      !firstname ||
      !email ||
      !password ||
      // !fcmToken ||
      !deviceType
    ) {
      throw new Error("Required fields are missing");
    }

    await UserModel.deleteMany({ email, emailVerified: false });

    const checkExist =
      (await AdminModel.findOne({ email })) ||
      (await UserModel.findOne({ email, emailVerified: true }));

    if (checkExist) {
      throw new Error("Email already in use");
    }
    const checkPhone =
      (await AdminModel.findOne({ phoneNumber })) ||
      (await UserModel.findOne({ phoneNumber }));

    if (checkPhone) {
      throw new Error("Phone number already in use");
    }

    const userType = "USER" as string;

    const newUser = await UserModel.create({
      firstname,
      lastname,
      fullName: `${firstname} ${lastname}`,
      email,
      role: userType,
      countryCode,
      // fcmToken: [
      // 	{
      // 		token: fcmToken,
      // 		deviceType,
      // 	},
      // ],
      deviceType,
      phoneNumber,
      password: await bcrypt.hash(password, 10),
    });

    await OTPModel.deleteMany({
      userType: "USER",
      purpose: "VERIFY_EMAIL",
      userId: newUser._id,
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await OTPModel.create({
      adminId: undefined,
      userId: newUser._id,
      otp: process.env.NODE_ENV === "production" ? hashToken(otp) : otp,
      userType: "USER",
      purpose: "VERIFY_EMAIL",
      expiresAt: dayjs().add(10, "minute").toDate(),
    });

    //todo send otp via email service
    await sendEmailVerificationMail(email, otp);

    const verificationToken = jwt.sign(
      {
        id: newUser._id,
        userType: "USER",
        purpose: "VERIFY_EMAIL",
      },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: "10m" },
    );

    clearCache("DASHBOARD:TOTAL_USERS");
    clearCache("DASHBOARD:LAST_7_DAYS_USERS");

    return OK(res, { verificationToken }, "OTP sent successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return UNAUTHORIZED(res, "Session expired, please login again");
  }
};

export const userLogin = async (req: Request, res: Response) => {
  try {
    const { email, password, fcmToken, deviceType } = req.body;
    const IP = req.ip as string;
    const checkIP = await isLoginBlocked(email, IP);

    if (checkIP.blocked) {
      let reason = "";
      const waitTime = checkIP.retryAfterSeconds
        ? Math.ceil(checkIP.retryAfterSeconds / 60)
        : 15;
      if (checkIP.reason === "EMAIL") {
        reason = `Too many failed login attempts for this email. Try again in ${waitTime} minutes.`;
      } else if (checkIP.reason === "IP") {
        reason = `Too many failed login attempts from this IP address. Try again in ${waitTime} minutes.`;
      }
      return BADREQUEST(res, reason);
    }

    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const user = (await UserModel.findOne({
      email,
      emailVerified: true,
    })) as any;

    if (!user) {
      throw new Error(
        "No verified account was found with the provided information. Please register again and verify your email before signing in.",
      );
    }

    if (user && user.status == "BLOCKED") {
      await recordFailedLogin(email, IP);
      throw new Error(
        "We are unable to process your login request at this time. Please contact support for assistance.",
      );
    }

    if (user?.status === "DELETED" && user?.deletedAt) {
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      const deletedTime = new Date(user.deletedAt).getTime();
      const now = Date.now();
      const diff = now - deletedTime;

      if (diff > THIRTY_DAYS) {
        await recordFailedLogin(email, IP);
        throw new Error("Your account is permanently deleted");
      } else {
        await UserModel.findByIdAndUpdate(user._id, {
          $set: { deletedAt: null, status: "ACTIVE" },
        });
      }
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      await recordFailedLogin(email, IP);
      throw new Error("Invalid email or password");
    }

    if (fcmToken && deviceType) {
      await UserModel.updateOne(
        { _id: user._id },
        {
          $addToSet: {
            fcmToken: {
              token: fcmToken,
              deviceType,
            },
          },
        },
      );
    }

    // Generate token
    const accessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        access: [],
      },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: "30d" },
    );

    const refreshToken = randomUUID();

    await clearLoginFailures(email, IP);
    await RefreshTokenModel.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      ip: IP,
      userType: "USER",
      expiresAt: dayjs().add(30, "day").toDate(),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return OK(
      res,
      {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          firstname: user.firstname,
          lastname: user.lastname,
          email: user.email,
          role: user.role,
          image: getFileUrl(user.image),
          access: [],
        },
      },
      "Login successful",
    );
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }

    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
};

// Common for both Admin and User
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const refreshToken =
      req.cookies.refreshToken || (req.headers["x-refresh-token"] as string);

    // 1. No cookie → force login
    console.log(refreshToken);
    if (!refreshToken) {
      return UNAUTHORIZED(res, "Refresh token missing");
    }

    const tokenHash = hashToken(refreshToken);

    // 2. Find token in DB
    const storedToken = await RefreshTokenModel.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    });

    if (!storedToken) {
      return UNAUTHORIZED(res, "Invalid or expired refresh token");
    }

    // 3. Fetch admin/user details
    const user_admin =
      storedToken.userType === "ADMIN"
        ? await AdminModel.findById(storedToken.adminId)
        : ((await UserModel.findById(storedToken.userId)) as any);

    if (!user_admin || user_admin.status !== "ACTIVE") {
      return UNAUTHORIZED(res, "User not active");
    }

    // 4. ROTATE REFRESH TOKEN
    const newRefreshToken = randomUUID();
    const newTokenHash = hashToken(newRefreshToken);

    storedToken.tokenHash = newTokenHash;
    storedToken.expiresAt = dayjs().add(30, "day").toDate();
    storedToken.ip = req.ip as string;
    await storedToken.save();

    // 5. Issue new access token
    const accessToken = jwt.sign(
      {
        id: user_admin._id,
        role: user_admin.role,
        access: user_admin?.access || [],
      },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: "15m" },
    );

    if (
      user_admin?.deviceType &&
      (user_admin?.deviceType === "ANDROID" || user_admin?.deviceType === "IOS")
    ) {
      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return OK(res, { accessToken }, "Token refreshed");
    } else {
      return OK(
        res,
        { accessToken, refreshToken: newRefreshToken },
        "Token refreshed",
      );
    }
  } catch (error) {
    return UNAUTHORIZED(res, "Session expired, please login again");
  }
};

export const forgetPassword = async (req: Request, res: Response) => {
  try {
    const userType = (req.headers["x-user-type"] as string) || "ADMIN";
    const email = req.body.email as string;

    if (!email) {
      throw new Error("Email is required");
    }

    const checkUser =
      userType === "ADMIN"
        ? await AdminModel.findOne({ email })
        : await UserModel.findOne({ email });

    if (!checkUser) {
      return NOT_FOUND(res, "User not found");
    }

    await OTPModel.deleteMany({
      userType,
      purpose: "FORGOT_PASSWORD",
      $or: [{ adminId: checkUser._id }, { userId: checkUser._id }],
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await sendPasswordResetEmail(
      checkUser.email as string,
      otp,
      checkUser.firstname,
    );
    await OTPModel.create({
      adminId: userType === "ADMIN" ? checkUser._id : undefined,
      userId: userType === "USER" ? checkUser._id : undefined,
      otp: process.env.NODE_ENV === "production" ? hashToken(otp) : otp,
      userType,
      purpose: "FORGOT_PASSWORD",
      expiresAt: dayjs().add(10, "minute").toDate(),
    });

    //todo send otp via email service
    const resetToken = jwt.sign(
      {
        id: checkUser._id,
        userType,
        purpose: "FORGOT_PASSWORD",
      },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: "10m" },
    );

    return OK(res, { resetToken, otp }, "OTP sent successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return UNAUTHORIZED(res, "Session expired, please login again");
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const resetToken = req.headers["authorization"]?.split(" ")[1];
    const userType = (req.headers["x-user-type"] as string) || "ADMIN";
    const otp = req.body.otp as string;

    if (!resetToken) {
      return UNAUTHORIZED(res, "Reset token missing");
    }

    if (!otp) {
      throw new Error("OTP is required");
    }

    const verifyResetToken = jwt.verify(
      resetToken!,
      process.env.JWT_SECRET_KEY!,
    ) as any;

    if (
      !verifyResetToken ||
      userType !== verifyResetToken.userType ||
      !verifyResetToken.purpose
    ) {
      return UNAUTHORIZED(res, "Invalid reset token");
    }

    if (verifyResetToken.purpose === "RESET_PASSWORD") {
    }

    const otpRecord = await OTPModel.findOne({
      userType,
      purpose: verifyResetToken.purpose,
      expiresAt: { $gt: new Date() },
      ...(userType === "ADMIN"
        ? { adminId: verifyResetToken.id }
        : { userId: verifyResetToken.id }),
    });

    if (process.env.NODE_ENV === "production") {
      if (!otpRecord || otpRecord.otp !== hashToken(otp)) {
        throw new Error("Invalid OTP");
      }
    } else {
      if (!otpRecord || otpRecord.otp !== otp) {
        throw new Error("Invalid OTP");
      }
    }

    await OTPModel.deleteMany({
      userType,
      purpose: verifyResetToken.purpose,
      ...(userType === "ADMIN"
        ? { adminId: verifyResetToken.id }
        : { userId: verifyResetToken.id }),
    });

    if (verifyResetToken.purpose == "FORGOT_PASSWORD") {
      const changePasswordToken = jwt.sign(
        {
          id: verifyResetToken.id,
          userType,
          purpose: "CHANGE_PASSWORD",
        },
        process.env.JWT_SECRET_KEY!,
        { expiresIn: "10m" },
      );

      return OK(res, { changePasswordToken }, "OTP verified successfully");
    } else if (verifyResetToken.purpose === "VERIFY_EMAIL") {
      const user = await UserModel.findByIdAndUpdate(
        verifyResetToken.id,
        {
          emailVerified: true,
        },
        { new: true },
      );

      if (!user) {
        return BADREQUEST(res, "Something went wrong");
      }

      try {
        await sendWelcomeUserEmail(user.email, user.fullName);
      } catch (welcomeMailError) {
        console.error(
          "Welcome email send failed after verification:",
          welcomeMailError,
        );
      }

      const accessToken = jwt.sign(
        {
          id: user._id,
          role: user.role,
          access: [],
        },
        process.env.JWT_SECRET_KEY!,
        { expiresIn: "15m" },
      );

      const refreshToken = randomUUID();

      await RefreshTokenModel.create({
        userId: user._id,
        tokenHash: hashToken(refreshToken),
        ip: req.ip as string,
        userType: "USER",
        expiresAt: dayjs().add(30, "day").toDate(),
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return OK(
        res,
        {
          accessToken,
          user: {
            id: user._id,
            firstname: user.firstname,
            lastname: user.lastname,
            email: user.email,
            role: user.role,
            access: [],
            image: user.image,
          },
        },
        "Login successful",
      );
    }
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return UNAUTHORIZED(res, "Session expired, please login again");
  }
};

export const resendOtp = async (req: Request, res: Response) => {
  try {
    const resetToken = req.headers["authorization"]?.split(" ")[1];
    const userType = (req.headers["x-user-type"] as string) || "ADMIN";
    let email;
    if (!resetToken) {
      return UNAUTHORIZED(res, "Reset token missing");
    }

    const verifyResetToken = jwt.verify(
      resetToken!,
      process.env.JWT_SECRET_KEY!,
    ) as any;
    if (
      !verifyResetToken ||
      userType !== verifyResetToken.userType ||
      !verifyResetToken.purpose
    ) {
      return UNAUTHORIZED(res, "Invalid reset token");
    }

    await OTPModel.deleteMany({
      userType,
      purpose: verifyResetToken.purpose,
      ...(userType === "ADMIN"
        ? { adminId: verifyResetToken.id }
        : { userId: verifyResetToken.id }),
    });
    if (userType === "ADMIN") {
      const user = await AdminModel.findById(verifyResetToken.id);
      email = user?.email;
    } else {
      const user = await UserModel.findById(verifyResetToken.id);
      email = user?.email;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    //todo send otp via email service
    await resendOTPMail(email, otp, verifyResetToken.purpose);
    await OTPModel.create({
      adminId: userType === "ADMIN" ? verifyResetToken.id : undefined,
      userId: userType === "USER" ? verifyResetToken.id : undefined,
      otp: otp,
      userType,
      purpose: verifyResetToken.purpose,
      expiresAt: dayjs().add(10, "minute").toDate(),
    });

    const resetTokenNew = jwt.sign(
      {
        id: verifyResetToken.id,
        userType,
        purpose: verifyResetToken.purpose,
      },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: "10m" },
    );

    return OK(res, { resetToken: resetTokenNew }, "OTP resent successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return UNAUTHORIZED(res, "Session expired, please login again");
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const resetToken = req.headers["authorization"]?.split(" ")[1];
    const userType = (req.headers["x-user-type"] as string) || "ADMIN";
    const password = req.body.password as string;

    if (!resetToken) {
      return UNAUTHORIZED(res, "Reset token missing");
    }

    if (!password) {
      throw new Error("Password is required");
    }

    const verifyResetToken = jwt.verify(
      resetToken!,
      process.env.JWT_SECRET_KEY!,
    ) as any;

    if (
      !verifyResetToken ||
      verifyResetToken.purpose !== "CHANGE_PASSWORD" ||
      userType !== verifyResetToken.userType
    ) {
      return UNAUTHORIZED(res, "Invalid reset token");
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    if (userType === "ADMIN") {
      await AdminModel.findByIdAndUpdate(verifyResetToken.id, {
        password: hashedPassword,
      });
    } else {
      await UserModel.findByIdAndUpdate(verifyResetToken.id, {
        password: hashedPassword,
      });
    }

    return OK(res, {}, "Password updated successfully");
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message);
    }
    return UNAUTHORIZED(res, "Session expired, please login again");
  }
};

export const socialLogin = async (req: Request, res: Response) => {
  try {
    const IP = req.ip as string;

    const {
      authType,
      idToken,
      fcmToken,
      //   country,
      //   language,
      deviceType,
    } = req.body;

    // ✅ Validation
    const validAuthTypes = ["GOOGLE", "APPLE"];
    const validDevices = ["ANDROID", "IOS", "WEB"];

    if (
      !authType ||
      !idToken ||
      !fcmToken ||
      //   !country ||
      //   !language ||
      !validAuthTypes.includes(authType) ||
      !validDevices.includes(deviceType)
    ) {
      return BADREQUEST(res, "Invalid input parameters");
    }

    let email: string | undefined;
    let name: string | undefined;
    let firstName: string | undefined;
    let lastName: string | undefined;
    let picture: string | null | undefined;

    // GOOGLE LOGIN
    if (authType === "GOOGLE") {
      let googleClientId: string | undefined;

      switch (deviceType) {
        case "ANDROID":
          googleClientId = process.env.GOOGLE_CLIENT_ID;
          break;
        case "IOS":
          googleClientId = process.env.GOOGLE_CLIENT_ID_IOS;
          break;
        case "WEB":
          googleClientId = process.env.GOOGLE_CLIENT_ID_WEB;
          break;
      }

      if (!googleClientId) {
        return BADREQUEST(res, "Google client ID not configured");
      }

      const client = new OAuth2Client(googleClientId);

      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();

      if (!payload) {
        return BADREQUEST(res, "Invalid Google token");
      }

      email = payload.email;
      ((firstName = payload.given_name),
        (lastName = payload.family_name),
        (name = payload.name));
      picture = payload.picture;
    }

    // APPLE LOGIN
    if (authType === "APPLE") {
      if (deviceType === "ANDROID") {
        return BADREQUEST(res, "Apple login not supported on Android");
      }

      const appleData = await verifyAppleToken(idToken);

      email = `${appleData?.sub}@appleId.com`;
      name = appleData?.name || "Apple User";
      picture = null;
    }

    // ✅ Final email check
    if (!email) {
      return BADREQUEST(res, "Unable to fetch email from provider");
    }

    // ✅ Find or Create User
    let user = await UserModel.findOne({ email });

    if (user && user.status == "BLOCKED") {
      await recordFailedLogin(email, IP);
      throw new Error(
        "We are unable to process your login request at this time. Please contact support for assistance.",
      );
    }

    if (!user) {
      user = await UserModel.create({
        email,
        fullName: name,
        lastname: lastName,
        firstname: firstName,
        image: picture,
        // language,
        fcmToken: [
          {
            token: fcmToken,
            deviceType,
          },
        ],
        // country,
        authType,
        isVerifiedEmail: true,
      });

      clearCache("DASHBOARD:TOTAL_USERS");
      clearCache("DASHBOARD:LAST_7_DAYS_USERS");
    } else {
      if (fcmToken && deviceType) {
        await UserModel.updateOne(
          { _id: user._id },
          {
            $addToSet: {
              fcmToken: {
                token: fcmToken,
                deviceType,
              },
            },
          },
        );
      }
      await user.save();
    }

    // ✅ Generate Tokens
    const accessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        access: [],
      },
      process.env.JWT_SECRET_KEY as string,
      { expiresIn: "30d" },
    );

    const refreshToken = randomUUID();

    await clearLoginFailures(email, IP);

    await RefreshTokenModel.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      ip: IP,
      userType: "USER",
      expiresAt: dayjs().add(30, "day").toDate(),
    });

    // ✅ Cookie (important for WEBAPP)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: deviceType === "WEBAPP" ? "lax" : "strict", // 👈 important change
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return OK(
      res,
      {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          firstname: user.firstname,
          lastname: user.lastname,
          email: user.email,
          role: user.role,
          image: user.image,
          access: [],
        },
      },
      "Login successful",
    );
  } catch (err: any) {
    console.error("Social Login Error:", err);
    return BADREQUEST(res, err?.message || "Internal Server Error");
  }
};

export const submitEnquiry = async (req: Request, res: Response) => {
  try {
    const { type, emailSubject } = req.body;

    const data = JSON.parse(req.body.data || "{}");

    const files = req.files as Express.Multer.File[];

    await sendEnquiryEmail({
      type,
      data,
      emailSubject,
      files,
    });

    return OK(res, {}, "Enquiry submitted successfully");
  } catch (err: any) {
    return BADREQUEST(res, err.message || "Something went wrong");
  }
};
