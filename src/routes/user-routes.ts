import type { Request, Response } from "express";
import { Router } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import {
  createUpdateIntro,
  getCourseIntro,
  getCourses,
} from "../controllers/course-controller.js";
import { multerUpload, uploadToS3 } from "../controllers/files-controller.js";
import {
  attemptQuestionOfTheDay,
  bookmark,
  changePassword,
  deleteAccount,
  deleteProfileImage,
  examReport,
  examReportQuestion,
  getAllMockExamsResult,
  getAllPracticeExamResultBoard,
  getBookmarks,
  getCertificates,
  getDropdownOfReport,
  getMockExamResultBoard,
  getNotificationsUser,
  getPlatformInfo,
  getPracticeExam,
  getPracticeExamQuestions,
  getPracticeExamResultBoard,
  getPracticeExamResultQuestion,
  getUserApplicationSupport,
  getUserCourses,
  getUserExamStrategy,
  getUserFlashcard,
  getUserFlashcardCategory,
  getUserMockExam,
  getUserMockExamQuestions,
  getUserQuestions,
  getUserTaskQuestions,
  logout,
  markAttempted,
  pauseMockExam,
  profileStats,
  putNotificationsUser,
  reportAProblem,
  saveRating,
  scheduleExam,
  submitMockQuestionsResponse,
  submitQuestionsResponse,
  updateProfile,
  updateUserName,
  userHome,
  usersDomainsAndTasks,
  usersLessonsAndVideos,
} from "../controllers/user-controller.js";

import {
  createRating,
  getNavigations,
  getRatingDropDown,
  postEnquiry,
  putNotifications,
} from "../controllers/additional-controller.js";
import { createCheckoutSessionService, getCurrentSubscription } from "../controllers/purchase-controller.js";
import { getAllProducts, getPlans } from "../controllers/plan-controller.js";

const userRoutes = Router();

// S3 Route
userRoutes.post("/upload", multerUpload, uploadToS3);
userRoutes.get("/navigations", getNavigations)

userRoutes.route("/rating").post(saveRating).get(getRatingDropDown);

// Course Data
userRoutes.route("/course").get(getUserCourses);
userRoutes.route("/course-intro/:id").get(getCourseIntro);

// Home Data
userRoutes.route("/home/:id").get(userHome);
userRoutes.route("/schedule-exam").post(scheduleExam);
userRoutes.route("/question-of-the-day/:id").post(attemptQuestionOfTheDay);

// User Profile
userRoutes.route("/profile-stats/:id").get(profileStats);
userRoutes.route("/profile-update").put(updateProfile).delete(deleteProfileImage);
userRoutes.route("/update-user-name").put(updateUserName);
userRoutes.route("/change-password").post(changePassword);
userRoutes.post("/logout", logout);

// Lessons and Videos
userRoutes.route("/lessons-videos/:id").get(usersLessonsAndVideos);
userRoutes.route("/bookmark").post(bookmark);
userRoutes.route("/mark-attempted").post(markAttempted);
userRoutes.route("/get-questions").get(getUserQuestions);

// Domains and Tasks
userRoutes.route("/domain-tasks/:id").get(usersDomainsAndTasks);
userRoutes.route("/domain-task-questions").get(getUserTaskQuestions);

// Flash Cards
userRoutes.route("/flashcard-categories").get(getUserFlashcardCategory);
userRoutes.route("/flashcards").get(getUserFlashcard);

// Application Support
userRoutes.route("/application-support/:id").get(getUserApplicationSupport);

// Exam Strategy
userRoutes.route("/exam-strategy/:id").get(getUserExamStrategy);

// Practice Exam
userRoutes.route("/practice-exam/:id").get(getPracticeExam);
userRoutes
  .route("/practice-exam-questions")
  .get(getPracticeExamQuestions)
  .post(submitQuestionsResponse);
userRoutes.route("/practice-exam-result-board").get(getPracticeExamResultBoard);
userRoutes.route("/practice-exam-result-board-question").get(getPracticeExamResultQuestion);
userRoutes
  .route("/all-practice-exam-result-board")
  .get(getAllPracticeExamResultBoard);

// Mock Exam
userRoutes.route("/mock-exam/:id").get(getUserMockExam);
userRoutes
  .route("/mock-exam-questions/:id")
  .get(getUserMockExamQuestions)
  .put(pauseMockExam);
userRoutes.route("/submit-question-response").post(submitMockQuestionsResponse);
userRoutes.route("/mock-exam-result").get(getMockExamResultBoard);
userRoutes.route("/all-mock-exam-result").get(examReport);

// Exam Report
userRoutes.route("/exam-report").get(examReport);
userRoutes.route("/exam-report-questions").get(examReportQuestion);
userRoutes.route("/notifications").get(getNotificationsUser).put(putNotificationsUser);
userRoutes.route("/enquiry").post(postEnquiry);

// Report a Problem
userRoutes
  .route("/report-problem")
  .get(getDropdownOfReport)
  .post(reportAProblem);

userRoutes.route("/delete-account").delete(deleteAccount);
// Stripe ROUTES*************************************
userRoutes.route("/get-plans").get(getPlans);
userRoutes.route("/current-subscription").get(getCurrentSubscription);
userRoutes.route("/create-purchase").post(createCheckoutSessionService);

// Certificates
userRoutes.route("/certificates").get(getCertificates);
// Test Routes
userRoutes.get("/test", async (req: Request, res: Response) => {
  try {
    console.log("Test API Working");
    return OK(res, "Test successfully");
  } catch (err: any) {
    if (err.message) {
      BADREQUEST(res, err.message);
    }
    return INTERNAL_SERVER_ERROR(res, "Internal Server Error");
  }
});

export default userRoutes;
