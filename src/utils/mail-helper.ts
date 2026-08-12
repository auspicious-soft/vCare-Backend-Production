import { configDotenv } from "dotenv";
import { Resend } from "resend";
import ForgotPasswordEmail from "./mail-templates/forget-password.js";
import VerifyEmail from "./mail-templates/email-verification.js";
import ResendOTPEmail from "./mail-templates/resend-otp.js";
import WelcomeUserEmail from "./mail-templates/welcome-user.js";
import LoginCredentials from "./mail-templates/login-credentials.js";
import ContactAdminNotificationEmail from "./mail-templates/contact-admin-notification.js";
import CertificateIssuedEmail from "./mail-templates/certificate-issued.js";
import IssueResolvedEmail from "./mail-templates/issue-resolved.js";
import ProblemReportedEmail from "./mail-templates/report-problem-notification.js";
import PurchaseExpiryReminderEmail from "./mail-templates/purchase-expiry-reminder.js";
import PlanEndedEmail from "./mail-templates/plan-ended.js";
import PaymentFailedEmail from "./mail-templates/payment-failed.js";
import WebsiteEnquiryEmail from "./mail-templates/enquiry-email.js";

configDotenv();
const resend = new Resend(process.env.RESEND_API_KEY);

export const sendContactMailToAdmin = async (payload: {
  fullName: string;
  email: string;
  message: string;
  phoneNumber: string;
  countryCode: string;
  subject: string;
  adminEmail: string;
  pageUrl?: string;
}) => {
  try {
    const now = new Date();
    const dateText = now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const timeText = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to:
        payload.adminEmail ||
        (process.env.ADMIN_RESEND_GMAIL_ACCOUNT as string),
      subject: `New customer message on ${dateText} at ${timeText}`,
      react: await ContactAdminNotificationEmail({
        fullName: payload.fullName,
        email: payload.email,
        phoneNumber: payload.countryCode + payload.phoneNumber,
        subject: payload.subject,
        message: payload.message,
        ...(payload.pageUrl ? { pageUrl: payload.pageUrl } : {}),
      }),
    });

    if (!result || result.error) {
      console.error("Failed to send contact mail to admin:", result?.error);
      throw new Error("Failed to send contact mail to admin");
    }

    return result;
  } catch (error) {
    console.error("Error sending contact mail to admin:", error);
    throw error;
  }
};
export const sendCertificateIssuedEmail = async (payload: {
  fullName: string;
  email: string;
  message?: string;
  phoneNumber?: string;
  certificateName?: string;
  claimCode?: string;
  pduText?: string;
  certificatePdf?: string;
  contactHoursText?: string;
  extraFields?: Array<{ label: string; value: string }>;
}) => {
  try {
    const attachments = [];

    if (payload.certificatePdf) {
      const pdfUrl = payload.certificatePdf;

      const response = await fetch(pdfUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }

      const pdfBuffer = Buffer.from(await response.arrayBuffer());

      attachments.push({
        filename: "Certificate.pdf",
        content: pdfBuffer,
      });
    }

    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: payload.email,
      subject: "Congratulations! Your Certificate Is Ready",
      react: await CertificateIssuedEmail({
        fullName: payload.fullName,
        ...(payload.certificateName
          ? { certificateName: payload.certificateName }
          : {}),
        ...(payload.claimCode ? { claimCode: payload.claimCode } : {}),
        ...(payload.pduText ? { pduText: payload.pduText } : {}),
        ...(payload.contactHoursText
          ? { contactHoursText: payload.contactHoursText }
          : {}),
        ...(payload.extraFields
          ? { extraFields: payload.extraFields }
          : {}),
      }),
      attachments,
    });

    if (!result || result.error) {
      console.error("Failed to send certificate email:", result?.error);
      throw new Error("Failed to send certificate email");
    }

    return result;
  } catch (error) {
    console.error("Error sending certificate email:", error);
    throw error;
  }
};

export const sendIssueResolvedEmailToUser = async (payload: {
  fullName: string;
  email: string;
  issueTitle?: string;
  issueDescription?: string;
  ticketId?: string;
  resolutionMessage?: string;
}) => {
  try {
    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: payload.email,
      subject: "Your Support Request Has Been Resolved",
      react: await IssueResolvedEmail({
        fullName: payload.fullName,
        ...(payload.resolutionMessage ||
        payload.issueDescription ||
        payload.issueTitle
          ? {
              resolutionSummary:
                payload.resolutionMessage ||
                payload.issueDescription ||
                payload.issueTitle,
            }
          : {}),
      }),
    });

    if (!result || result.error) {
      console.error("Failed to send issue resolved email:", result?.error);
      throw new Error("Failed to send issue resolved email");
    }

    return result;
  } catch (error) {
    console.error("Error sending issue resolved email:", error);
    throw error;
  }
};

export const sendProblemReportedEmailToOwner = async (payload: {
  ownerEmail: string;
  ownerName?: string;
  reportId: string;
  courseName: string;
  reportType: string;
  reporterName?: string;
  reporterEmail?: string;
  relevantId?: string | null;
  comments?: string | null;
  reportedAt?: Date | string;
}) => {
  try {
    if (!payload.ownerEmail) {
      throw new Error("Owner email is required");
    }

    const reportedAtText = new Date(payload.reportedAt || new Date()).toLocaleString(
      "en-IN",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      },
    );

    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: payload.ownerEmail,
      subject: `New Problem Reported - ${payload.courseName}`,
      react: await ProblemReportedEmail({
        reportId: payload.reportId,
        courseName: payload.courseName,
        reportType: payload.reportType,
        reportedAt: reportedAtText,
        ...(payload.ownerName ? { ownerName: payload.ownerName } : {}),
        ...(payload.reporterName ? { reporterName: payload.reporterName } : {}),
        ...(payload.reporterEmail ? { reporterEmail: payload.reporterEmail } : {}),
        ...(payload.relevantId !== undefined && payload.relevantId !== null
          ? { relevantId: payload.relevantId }
          : {}),
        ...(payload.comments !== undefined && payload.comments !== null
          ? { comments: payload.comments }
          : {}),
      }),
    });

    if (!result || result.error) {
      console.error("Failed to send problem reported email:", result?.error);
      throw new Error("Failed to send problem reported email");
    }

    return result;
  } catch (error) {
    console.error("Error sending problem reported email:", error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email: string, token: string, name: string ) => {
  try {
    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: email,
      subject: "Reset Your Password - OTP Verification",
      react: await ForgotPasswordEmail({ otp: token , fullName: name }),
    });

    if (!result || result.error) {
      console.error("Failed to send password reset email:", result?.error);
      throw new Error("Failed to send password reset email");
    }

    return result;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};

export const sendLoginCredentials = async (email: string, password: string, name: string) => {
  try {
    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: email,
      subject: "Login Credentials",
      react: await LoginCredentials({ email, password, name }),
    });

    if (!result || result.error) {
      console.error("Failed to send login credentials email:", result?.error);
      throw new Error("Failed to send login credentials email");
    }

    return result;
  } catch (error) {
    console.error("Error sending login credentials email:", error);
    throw error;
  }
};

export const sendEmailVerificationMail = async (email: string, otp: string) => {
  try {
    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: email,
      subject: "vCare Project Management Verification Code",
      react: await VerifyEmail({ otp }),
    });

    if (!result || result.error) {
      console.error("Failed to send email verification:", result?.error);
      throw new Error("Failed to send email verification");
    }

    return result;
  } catch (error) {
    console.error("Error sending email verification:", error);
    throw error;
  }
};

export const resendOTPMail = async (
  email: string | null | undefined,
  otp: string,
  purpose: "LOGIN" | "FORGOT_PASSWORD" | "VERIFY_EMAIL",
) => {
  try {
    if (!email) {
      throw new Error("Email is required to send OTP");
    }
    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: email,
      subject: "vCare Project Management Verification Code",
      react: await ResendOTPEmail({ otp, purpose }),
    });

    if (!result || result.error) {
      console.error("Failed to send resend OTP email:", result?.error);
      throw new Error("Failed to send resend OTP email");
    }

    return result;
  } catch (error) {
    console.error("Error sending resend OTP email:", error);
    throw error;
  }
};

export const sendWelcomeUserEmail = async (
  email: string,
  fullName?: string,
) => {
  try {
    // const guidanceCallUrl =
    //   process.env.WELCOME_ADVISOR_LINK ||
    //   process.env.WELCOME_GUIDANCE_CALL_URL ||
    //   "https://www.vcareprojectmanagement.com/pages/contact-us";

    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: email,
      subject: "Welcome to vCare Project Management",
      react: await WelcomeUserEmail({
        ...(fullName ? { fullName } : {}),
      }),
    });

    if (!result || result.error) {
      console.error("Failed to send welcome email:", result?.error);
      throw new Error("Failed to send welcome email");
    }

    return result;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw error;
  }
};

export const sendPurchaseExpiryReminderEmail = async (payload: {
  email: string;
  name?: string | null;
  type: "FREE_TRIAL" | "SUBSCRIPTION" | string;
  endDate: Date;
  subscriptionName?: string;
  renewalLink?: string;
  consultationLink?: string;
  liveClassLink?: string;
}) => {
  try {
    const formattedDate = new Date(payload.endDate ).toLocaleDateString(
      "en-IN",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );

    const isFreeTrial = payload.type === "FREE_TRIAL";

    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: payload.email,
      subject: isFreeTrial
        ? "Your Free Trial is Ending Soon - vCare Project Management"
        : "Your Access Plan is Ending Soon - vCare Project Management",
      react: await PurchaseExpiryReminderEmail({
        ...(payload.name ? { fullName: payload.name } : {}),
        subscriptionName: payload.subscriptionName || "Elite Plan",
        expiryDateText: formattedDate,
        ...(payload.renewalLink ? { renewalLink: payload.renewalLink } : {}),
        ...(payload.consultationLink
          ? { consultationLink: payload.consultationLink }
          : {}),
        ...(payload.liveClassLink
          ? { liveClassLink: payload.liveClassLink }
          : {}),
        isFreeTrial,
      }),
    });

    if (!result || result.error) {
      console.error("Failed to send purchase expiry reminder:", result?.error);
      throw new Error("Failed to send purchase expiry reminder");
    }

    return result;
  } catch (error) {
    console.error("Error sending purchase expiry reminder:", error);
    throw error;
  }
};

export const sendPlanEndedEmail = async (payload: {
  email: string;
  fullName?: string;
  subscriptionName?: string;
  renewalLink?: string;
  coursesLink?: string;
  consultationLink?: string;
}) => {
  try {
    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: payload.email,
      subject: "Need More Time for Your Certification Journey?",
      react: await PlanEndedEmail({
        ...(payload.fullName ? { fullName: payload.fullName } : {}),
        ...(payload.subscriptionName
          ? { subscriptionName: payload.subscriptionName }
          : {}),
        ...(payload.renewalLink ? { renewalLink: payload.renewalLink } : {}),
        ...(payload.coursesLink ? { coursesLink: payload.coursesLink } : {}),
        ...(payload.consultationLink
          ? { consultationLink: payload.consultationLink }
          : {}),
      }),
    });

    if (!result || result.error) {
      console.error("Failed to send plan ended email:", result?.error);
      throw new Error("Failed to send plan ended email");
    }

    return result;
  } catch (error) {
    console.error("Error sending plan ended email:", error);
    throw error;
  }
};

export const sendPaymentFailedEmail = async (payload: {
  email: string;
  fullName?: string;
  subscriptionName?: string;
  paymentAmount?: string;
  supportUrl?: string;
}) => {
  try {
    const result = await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: payload.email,
      subject: "Payment Unsuccessful - Action Required",
      react: await PaymentFailedEmail({
        ...(payload.fullName ? { fullName: payload.fullName } : {}),
        ...(payload.subscriptionName
          ? { subscriptionName: payload.subscriptionName }
          : {}),
        ...(payload.paymentAmount
          ? { paymentAmount: payload.paymentAmount }
          : {}),
        ...(payload.supportUrl ? { supportUrl: payload.supportUrl } : {}),
      }),
    });

    if (!result || result.error) {
      console.error("Failed to send payment failed email:", result?.error);
      throw new Error("Failed to send payment failed email");
    }

    return result;
  } catch (error) {
    console.error("Error sending payment failed email:", error);
    throw error;
  }
};

export const sendEnquiryEmail = async ({
  type,
  data,
  emailSubject,
  files,
}: {
  type: string;
  data: any;
  emailSubject: string;
  files: Express.Multer.File[];
}) => {
  const attachments =
    files?.map((file) => ({
      filename: file.originalname,
      content: file.buffer,
    })) || [];

  return resend.emails.send({
    from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT!,
    to: [
     "support@vcareprojectmanagement.com",
      "team@vcareprojectmanagement.com",
    ],
    subject: emailSubject,
    react: await WebsiteEnquiryEmail({
      type,
      data,
    }),
    attachments,
  });
};
