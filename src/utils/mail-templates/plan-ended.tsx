import * as React from "react";
import { Container, Head, Hr, Html, Link, Text } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface PlanEndedEmailProps {
  fullName?: string;
  subscriptionName?: string;
  renewalLink?: string;
  coursesLink?: string;
  consultationLink?: string;
}

const PlanEndedEmail: React.FC<Readonly<PlanEndedEmailProps>> = ({
  fullName,
  subscriptionName = "your plan",
  renewalLink,
  coursesLink,
  consultationLink,
}) => {
  return (
    <Html lang="en">
      <Head>
        <title>Need More Time for Your Certification Journey?</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>Hello {fullName?.trim() || "User"},</Text>
        <Text>We hope you found your learning experience with vCare Project Management valuable and enriching.</Text>
        <Text>
          This is a friendly notification that your access to {subscriptionName} has ended. As a result, access to your premium learning resources may now be limited.
        </Text>
        <Text>If you need additional time to complete your preparation, require more learning resources, or are planning another certification journey, we are here to help.</Text>
        {/* {renewalLink ? ( */}
          <Text>
            Continue Your Learning Journey: <Link href={process.env.FRONTEND_URL}>{process.env.FRONTEND_URL}</Link>
          </Text>
        {/* ) : null} */}
        <Text>If you have already renewed your plan, please disregard this message.</Text>
        <Text>Thank you for choosing vCare Project Management for your professional learning journey. </Text>
        {coursesLink ? (
          <Text>
            Explore More Certifications and Resources: <Link href={coursesLink}>{coursesLink}</Link>
          </Text>
        ) : null}
          <Text>
            Have questions? Book a free consultation with our team: <Link href={"https://www.vcareprojectmanagement.com/pages/book-appointment"}>https://www.vcareprojectmanagement.com/pages/book-appointment</Link>
          </Text>
        <Text>Thank you for choosing vCare Project Management. We look forward to continuing to support your professional growth and certification success.</Text>
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

export default PlanEndedEmail;
