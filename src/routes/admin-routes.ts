import type { Request, Response } from "express";
import { Router } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/responses.js";
import { adminAuthGuard } from "../middleware/auth.js";
import {
  createCourse,
  createUpdateIntro,
  deleteCourse,
  getCourseIntro,
  getCourses,
  reorderCourses,
  updateCourse,
} from "../controllers/course-controller.js";
import { dashboard } from "../controllers/dashboard-controller.js";
import {
  deleteFiles,
  getFiles,
  handleFilesInFormData,
  multerUpload,
  uploadFiles,
  uploadToS3,
} from "../controllers/files-controller.js";
import {
  addQuestion,
  bulkUploadLessons,
  bulkUploadQuestions,
  createModule,
  deleteLesson,
  downloadSampleModuleCSV,
  getLessonById,
  getModules,
  updateLesson,
  getQuestionsLessons,
  downloadMCQSampleCSV,
  downloadDNDSampleCSV,
  downloadFIBSampleCSV,
  deleteLessonModule,
  updateQuestionsLessons,
  deleteQuestionsLessons,
  addLesson,
  hardDeleteModule,
  deleteAllQuestionsLessons,
} from "../controllers/lesson-controller.js";
import { uploadCSV, uploadMultiCSV } from "../middleware/multer.js";
import {
  addTaskQuestion,
  bulkUploadTaskQuestions,
  createDomain,
  deleteDomain,
  deleteTask,
  deleteTaskQuestion,
  downloadDomainSampleQuestionCSV,
  downloadTaskQuestionSampleCSV,
  getDomain,
  getQuestionsTasks,
  getTask,
  reorderDomain,
} from "../controllers/domain-controller.js";
import {
  addSimpleQuestion,
  deleteQuestion,
  deleteQuestionByDomain,
  getQuestions,
  getQuestionsSummary,
  updateQuestion,
  uploadQuestionCSV,
} from "../controllers/questions-controller.js";
import {
  createPlan,
  getAllProducts,
  getPlanData,
  getPlans,
  updatePlanPrice,
} from "../controllers/plan-controller.js";
import {
  addExamPrice,
  createMockExam,
  createPracticeExam,
  deleteMockExam,
  deletePracticeExam,
  downloadUserMockExamData,
  editPracticeExam,
  getExamQuestions,
  getExams,
  getMockExamDomains,
  getUserMockExamData,
  mockexamDropdown,
  updateMockExam,
} from "../controllers/exam-controller.js";
import {
  createNotification,
  createRating,
  createSystemUsers,
  createUpdateCompanyInfo,
  deleteNotifications,
  deleteRating,
  deleteSystemUser,
  getCompanyInfo,
  getNavigations,
  getNotifications,
  getRatingDropDown,
  getRatings,
  getReportedProblem,
  getReportedProblemById,
  getSystemUsers,
  updateNavigations,
  updatePlansDuration,
  updateRating,
  updateReportedProblemStatus,
  updateSystemUser,
} from "../controllers/additional-controller.js";
import {
  createApplicationSupport,
  deleteApplicationSupport,
  deleteApplicationSupportChild,
  getApplicationSupport,
  updateApplicationSupport,
} from "../controllers/application-support-controller.js";
import {
  bulkUploadFlashcards,
  createFlashcard,
  createFlashcardCategory,
  deleteFlashcard,
  deleteFlashcardCategory,
  downloadFlashcardSampleCSV,
  getFlashcard,
  getFlashcardCategory,
  reorderFlashCardCategory,
  reorderFlashcards,
  updateFlashcard,
  updateFlashcardCategory,
} from "../controllers/flash-card-controller.js";
import {
  createExamStrategy,
  deleteExamStrategy,
  deleteExamStrategyChild,
  getExamStrategy,
  updateExamStrategy,
} from "../controllers/exam-strategy-controller.js";
import {
  addAccess,
  blockUser,
  deleteAccess,
  downloadSample,
  exportUsersCSV,
  getAccessDropdown,
  getCertificates,
  getUserById,
  adminUpdateUser,
  getUsers,
  importUser,
  updateAccess,
  userExamResult,
} from "../controllers/user-controller.js";
import redis from "../config/redis.js";
import {
  createCertificateTemplate,
  createIssuingCertificate,
  deleteCertificateTemplate,
  generateCertificateFromModal,
  generateCertificateFromRequest,
  getCertificateTemplate,
  getCertificateTemplateById,
  exportIssuedCertificatesCSV,
  getIssuingCertificate,
  updateCertificateTemplate,
  updateAdminSendEmail,
} from "../controllers/template-controller.js";
import {
  exportPurchasesCSV,
  getAllPurchases,
} from "../controllers/purchase-controller.js";

const adminRoutes = Router();

// Admin Routes

// S3 Route
adminRoutes.post("/upload", multerUpload, uploadToS3);

// Dashboard ********************************************
adminRoutes.get("/dashboard", dashboard);

// Users ************************************************
adminRoutes.route("/users").get(getUsers);
adminRoutes.route("/users-exam-result").get(userExamResult);
adminRoutes.route("/users-by-id").get(getUserById).put(blockUser);
adminRoutes.route("/user-update").put( adminUpdateUser);
adminRoutes.route("/users-csv").get(exportUsersCSV);
adminRoutes
  .route("/import-user")
  .post(handleFilesInFormData, importUser)
  .get(downloadSample);
  
adminRoutes
  .route("/user-add-access")
  .post(addAccess)
  .get(getAccessDropdown)
  .delete(deleteAccess)
  .put(updateAccess);

// Upload Files *****************************************
adminRoutes
  .route("/upload-files")
  .post(uploadFiles)
  .get(getFiles)
  .delete(deleteFiles);

// Courses CRUD *****************************************
adminRoutes
  .route("/course")
  .post(createCourse)
  .get(getCourses)
  .patch(updateCourse)
  .put(reorderCourses)
  .delete(deleteCourse);
adminRoutes
  .route("/course-intro/:id")
  .get(getCourseIntro)
  .post(createUpdateIntro);

// Lessons & Videos ************************************
adminRoutes
  .route("/module")
  .post(createModule)
  .get(getModules)
  .delete(hardDeleteModule);

adminRoutes
  .route("/sample-csv-module")
  .get(downloadSampleModuleCSV)
  .post(uploadCSV, bulkUploadLessons);

adminRoutes
  .route("/lesson")
  .get(getLessonById)
  .put(updateLesson)
  .post(addLesson)
  .delete(deleteLesson);

adminRoutes.route("/delete-lessons-questions").delete(deleteAllQuestionsLessons)

adminRoutes.route("/lesson-module").delete(deleteLessonModule);

// Questions of Lessons & Videos ***********************
adminRoutes
  .route("/lesson-question")
  .post(addQuestion)
  .get(getQuestionsLessons);

adminRoutes
  .route("/questionsByDomain")
  .get(getQuestions)
  .delete(deleteQuestionByDomain);

adminRoutes
  .route("/lesson-questions/:id")
  .put(updateQuestionsLessons)
  .delete(deleteQuestionsLessons);

adminRoutes
  .route("/lesson-question-sample-CSV")
  .post(uploadMultiCSV, bulkUploadQuestions);
adminRoutes.route("/lesson-question-MCQ-sample-CSV").get(downloadMCQSampleCSV);
adminRoutes.route("/lesson-question-DND-sample-CSV").get(downloadDNDSampleCSV);
adminRoutes.route("/lesson-question-FIB-sample-CSV").get(downloadFIBSampleCSV);

// Domain & Tasks **************************************
adminRoutes
  .route("/domains")
  .post(handleFilesInFormData, createDomain)
  .get(getDomain)
  .put(reorderDomain)
  .delete(deleteDomain);

adminRoutes.route("/task").get(getTask).delete(deleteTask);
adminRoutes
  .route("/task-questions")
  .get(getQuestionsTasks)
  .post(addTaskQuestion)
  .delete(deleteTaskQuestion);
adminRoutes.route("/domain_question").get(downloadDomainSampleQuestionCSV);
adminRoutes
  .route("/task-question-sample-CSV")
  .get(downloadTaskQuestionSampleCSV);
adminRoutes
  .route("/task-question-bulk")
  .post(uploadMultiCSV, bulkUploadTaskQuestions);

// Questions ******************************************
adminRoutes
  .route("/questions")
  .post(uploadMultiCSV, uploadQuestionCSV)
  .get(getQuestionsSummary);

adminRoutes.post("/single-question", addSimpleQuestion);
adminRoutes
  .route("/single-question/:questionId")
  // .post(addSimpleQuestion)
  .put(updateQuestion)
  .delete(deleteQuestion);

// Exams **********************************************
adminRoutes
  .route("/mock-exam")
  .post(createMockExam)
  .get(getExams)
  .put(updateMockExam)
  .delete(deleteMockExam);
adminRoutes.route("/mock-exam-price").post(addExamPrice);

adminRoutes.route("/exam-questions").get(getExamQuestions);

adminRoutes.route("/mock-exam-domains/:courseId").get(getMockExamDomains);

adminRoutes
  .route("/practice-exam/:id")
  .post(uploadMultiCSV, createPracticeExam)
  .put(uploadMultiCSV, editPracticeExam)
  .delete(deletePracticeExam);

// Flash Card
adminRoutes
  .route("/flashcard-category")
  .post(createFlashcardCategory)
  .get(getFlashcardCategory)
  .delete(deleteFlashcardCategory)
  .put(updateFlashcardCategory);

adminRoutes.route("/flashcard-reorder").post(reorderFlashCardCategory);

adminRoutes
  .route("/flashcard")
  .post(handleFilesInFormData, createFlashcard)
  .put(handleFilesInFormData, updateFlashcard)
  .delete(deleteFlashcard)
  .patch(reorderFlashcards)
  .get(getFlashcard);
adminRoutes.route("/flashcard-sample-CSV").get(downloadFlashcardSampleCSV);
adminRoutes.route("/flashcard-bulk").post(uploadCSV, bulkUploadFlashcards);

// Application Support
adminRoutes
  .route("/application-support/:id")
  .post(createApplicationSupport)
  .patch(deleteApplicationSupportChild)
  .put(updateApplicationSupport)
  .get(getApplicationSupport)
  .delete(deleteApplicationSupport);

// Exam Strategy
adminRoutes
  .route("/exam-strategy/:id")
  .post(createExamStrategy)
  .put(updateExamStrategy)
  .get(getExamStrategy)
  .delete(deleteExamStrategy)
  .patch(deleteExamStrategyChild);

// Mock Exam Result
adminRoutes.route("/mock-exam-results").get(getUserMockExamData);
adminRoutes.route("/download-mock-exam-result").get(downloadUserMockExamData);

// Certificates
// Annoucements
// Notifications

// Reviews & Ratings **********************************
adminRoutes
  .route("/ratings")
  .get(getRatings)
  .post(createRating)
  .put(updateRating)
  .delete(deleteRating);
adminRoutes.route("/ratings-dropdown").get(getRatingDropDown);
adminRoutes.route("/users").get(getUsers);

// Plans **********************************************
adminRoutes.route("/plans").post(createPlan);
adminRoutes.route("/exam-data").get(getPlanData);
adminRoutes.route("/get-plans").get(getPlans);
adminRoutes.route("/plan-prices").put(updatePlanPrice);
adminRoutes.route("/subscriptions").get(getAllPurchases);
adminRoutes.route("/export-csv-subscriptions").get(exportPurchasesCSV);
adminRoutes.route("/mock-exam-dropdown").get(mockexamDropdown);

adminRoutes.route("/stripe-products").get(getAllProducts);

// Reported Problem ***********************************
adminRoutes
  .route("/reported-problems")
  .get(getReportedProblem)
  .post(updateReportedProblemStatus);
adminRoutes.route("/reported-problems-byId").get(getReportedProblemById);

// Company Information ********************************
adminRoutes
  .route("/company-info")
  .post(createUpdateCompanyInfo)
  .get(getCompanyInfo);

// Certificates Template ********************************
adminRoutes
  .route("/certificate-template")
  .get(getCertificateTemplate)
  .post(createCertificateTemplate)
  .put(updateCertificateTemplate);
adminRoutes
  .route("/certificate-template/:id")
  .get(getCertificateTemplateById)
  .delete(deleteCertificateTemplate);
adminRoutes.route("/generate-certificate").post(generateCertificateFromRequest);
adminRoutes
  .route("/generate-certificate-modal")
  .post(generateCertificateFromModal);

// Certificates  ***********************
adminRoutes
  .route("/certificates")
  .post(createIssuingCertificate)
  .get(getIssuingCertificate)
  .put(updateAdminSendEmail);

adminRoutes.route("/certificates-export-csv").get(exportIssuedCertificatesCSV);

adminRoutes
  .route("/system-users")
  .get(getSystemUsers)
  .delete(deleteSystemUser)
  .put(updateSystemUser)
  .post(createSystemUsers);

// Notifications & Annoncements ***********************
adminRoutes
  .route("/notifications")
  .post(createNotification)
  .get(getNotifications)
  .delete(deleteNotifications);

// User Mock Exam *************************************
adminRoutes.route("/plans-duration").put(updatePlansDuration);
 
adminRoutes
  .route("/clear-redis-data")
  .get(async (req: Request, res: Response) => {
    try {
      // Clear current redis DB
      await redis.flushdb();

      // Verify
      const keys = await redis.keys("*");

      return OK(
        res,
        {
          remainingKeys: keys.length,
        },
        "Redis data cleared successfully",
      );
    } catch (err: any) {
      console.error("Error clearing Redis data:", err);

      return INTERNAL_SERVER_ERROR(res, "Failed to clear Redis data");
    }
  });

// Navigations
adminRoutes.route("/navigations").get(getNavigations).post(updateNavigations);

// Test Routes
adminRoutes.get("/test", async (req: Request, res: Response) => {
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

export default adminRoutes;
