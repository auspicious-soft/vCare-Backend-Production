import * as React from "react";
import { Container, Head, Hr, Html, Link, Text } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface PurchaseExpiryReminderEmailProps {
  fullName?: string;
  subscriptionName?: string;
  expiryDateText: string;
  renewalLink?: string;
  consultationLink?: string;
  liveClassLink?: string;
  isFreeTrial?: boolean;
}

const PurchaseExpiryReminderEmail: React.FC<Readonly<PurchaseExpiryReminderEmailProps>> = ({
  fullName,
  subscriptionName = "your plan",
  expiryDateText,
  renewalLink,
  consultationLink,
  liveClassLink,
  isFreeTrial = false,
}) => {
  const showRenewalLink = renewalLink?.trim();
  const showConsultationLink = consultationLink?.trim();
  const showLiveClassLink = liveClassLink?.trim();

  return (
    <Html lang="en">
      <Head>
        <title>{isFreeTrial ? "Your Free Trial is Ending Soon - vCare Project Management" : "Your Access Plan is Ending Soon - vCare Project Management"}</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>Hello {fullName?.trim() || "User"},</Text>
        {isFreeTrial ? (
          <>
            <Text>Your free trial for {subscriptionName} is ending on {expiryDateText}.</Text>
            <Text>To continue accessing your learning resources without interruption, please upgrade to a paid plan before the trial ends.</Text>
          </>
        ) : (
          <>
            <Text>We hope you are enjoying your learning experience with vCare Project Management.</Text>
            <Text>
              This is a friendly reminder that your access to {subscriptionName} is scheduled to end on {expiryDateText}.
            </Text>
            <Text>To continue enjoying uninterrupted access to your learning resources, please renew your plan before the end date.</Text>
            <Text>
              <strong>Plan:</strong> {subscriptionName}
            </Text>
            <Text>
              <strong>End Date:</strong> {expiryDateText}
            </Text>
          </>
        )}
        {/* {showRenewalLink ? ( */}
          <Text>
            Continue Your Access: <Link href={process.env.FRONTEND_URL}>{process.env.FRONTEND_URL}</Link>
          </Text>
        {/* ) : null} */}
          <Text>
            Have questions? Book a free consultation with our team:{" "}
            <Link href={"https://www.vcareprojectmanagement.com/pages/book-appointment"}>https://www.vcareprojectmanagement.com/pages/book-appointment</Link>
          </Text>
          <Text>
            Interested in attending a live class? Register here: <Link href={process.env.EXPIRY_FRONTEND_URL}>Register Now</Link>
          </Text>
        <Text>If you have already renewed or upgraded your access, please disregard this email.</Text>
        {/* ── Footer ── */}
        <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0 12px" }} />

        <Text style={{ fontSize: "13px", fontWeight: 600, color: "#374151", textAlign: "center", margin: "0 0 2px" }}>
          vCare Project Management
        </Text>
        <Text style={{ fontSize: "12px", color: "#9ca3af", textAlign: "center", margin: "0 0 14px" }}>
          PMI Premier Authorized Training Partner
        </Text>

        {/* Social icons */}
        <div style={{ textAlign: "center", marginBottom: "10px" }}>
          <Link href="https://www.linkedin.com/company/vcareprojectmanagement" style={socialIconWrapStyle}>LinkedIn</Link>
          <Link href="https://x.com/vCare_official" style={socialIconWrapStyle}>X</Link>
          <Link href="https://www.facebook.com/vCareProjectManagement/" style={socialIconWrapStyle}>Facebook</Link>
          <Link href="https://www.youtube.com/channel/UCWg9sBRmPCcpVy2KY5AtjQQ" style={socialIconWrapStyle}>YouTube</Link>
          <Link href="https://www.instagram.com/vcareprojectmanagement/" style={socialIconWrapStyle}>Instagram</Link>
        </div>

      </Container>
    </Html>
  );
};

export default PurchaseExpiryReminderEmail;
