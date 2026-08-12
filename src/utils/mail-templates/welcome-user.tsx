import * as React from "react";
import { Container, Head, Hr, Html, Link, Section, Text } from "@react-email/components";

interface WelcomeUserEmailProps {
  fullName?: string;
  logoUrl?: string;
  payInFullUrl?: string;
  paymentPlanUrl?: string;
  customChoiceUrl?: string;
  guidanceCallUrl?: string;
}

const cardStyle: React.CSSProperties = {
  maxWidth: "640px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  padding: "28px",
  fontFamily: "Arial, sans-serif",
  color: "#1f2937",
};

const headingStyle: React.CSSProperties = {
  fontSize: "28px",
  lineHeight: "34px",
  fontWeight: 700,
  margin: "0 0 16px 0",
  color: "#0f172a",
  textAlign: "center",
};

export const socialIconWrapStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#f9fafb",
  textDecoration: "none",
  margin: "4px",
  fontSize: "12px",
  color: "#374151",
};

const WelcomeUserEmail: React.FC<Readonly<WelcomeUserEmailProps>> = ({
  fullName,
}) => {
  const name = fullName?.trim() || "there";
  const guidanceLink =  "https://www.vcareprojectmanagement.com/pages/book-appointment";

  return (
    <Html lang="en">
      <Head>
        <title>Welcome to vCare Project Management</title>
      </Head>
      <Section style={{ backgroundColor: "#f3f4f6", padding: "24px 12px" }}>
        <Container style={cardStyle}>
          {/* <Text style={headingStyle}>Welcome to vCare Project Management</Text> */}
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px" }}>Hello {name},</Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px" }}>
            Welcome to vCare Project Management!
          </Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px" }}>
            We are delighted to have you join our learning community and look forward to supporting you on your professional learning and career development journey.
          </Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px" }}>
            Your account setup is complete, and you can now access our learning platform.
          </Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px" }}>
            If you have already purchased a learning plan or package, you will now have access to your selected training resources and features.
          </Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px" }}>
            If you have not yet selected a plan, you may explore and purchase the learning package that best fits your goals and certification journey.
          </Text>

          <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px", fontWeight: 700, color: "#0f172a" }}>
            Need help selecting the right learning path?
          </Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px" }}>
            Talk to an Advisor:{" "}
            <Link href={guidanceLink} style={{ color: "#1d4ed8", textDecoration: "underline", fontWeight: 700 }}>
              Book a call
            </Link>
          </Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 10px" }}>
            If you need any assistance accessing the platform or your account, our support team is always happy to help.
          </Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 0" }}>
            We wish you great success in your learning journey.
          </Text>

          <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0 12px" }} />

          {/* Footer */}
          <Text style={{ fontSize: "13px", fontWeight: 600, color: "#374151", textAlign: "center", margin: "0 0 2px" }}>
            vCare Project Management
          </Text>
          <Text style={{ fontSize: "12px", color: "#9ca3af", textAlign: "center", margin: "0 0 14px" }}>
            PMI Premier Authorized Training Partner
          </Text>

          <div style={{ textAlign: "center", marginBottom: "10px" }}>
            <Link href="https://www.linkedin.com/company/vcareprojectmanagement" style={socialIconWrapStyle}>LinkedIn</Link>
            <Link href="https://x.com/vCare_official" style={socialIconWrapStyle}>X</Link>
            <Link href="https://www.facebook.com/vCareProjectManagement/" style={socialIconWrapStyle}>Facebook</Link>
            <Link href="https://www.youtube.com/channel/UCWg9sBRmPCcpVy2KY5AtjQQ" style={socialIconWrapStyle}>YouTube</Link>
            <Link href="https://www.instagram.com/vcareprojectmanagement/" style={socialIconWrapStyle}>Instagram</Link>
          </div>

          <Text style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center", margin: 0 }}>
            Want to change which emails you receive from us? You can{" "}
            <Link href="#" style={{ color: "#6b7280", textDecoration: "underline" }}>Manage Preferences</Link>
            {" "}or{" "}
            <Link href="#" style={{ color: "#6b7280", textDecoration: "underline" }}>Unsubscribe</Link>
            . You can view our{" "}
            <Link href="#" style={{ color: "#6b7280", textDecoration: "underline" }}>privacy policy</Link>
          </Text>
        </Container>
      </Section>
    </Html>
  );
};

export default WelcomeUserEmail;
