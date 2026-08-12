import * as React from "react";
import { Container, Head, Hr, Html, Link, Text } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface ForgotPasswordEmailProps {
  otp: string;
  fullName?: string;
  expiryMinutes?: number;
  supportUrl?: string;
}

const footerStyle: React.CSSProperties = { color: "#6c757d", fontSize: "13px" };

const ForgotPasswordEmail: React.FC<Readonly<ForgotPasswordEmailProps>> = ({
  otp,
  fullName,
  expiryMinutes = 10,
  supportUrl = "https://www.vcareprojectmanagement.com/pages/contact-us",
}) => {
  return (
    <Html lang="en">
      <Head>
        <title>Reset Your Password - OTP Verification</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>Hello {fullName?.trim() || "User"},</Text>
        <Text>We received a request to reset the password for your vCare Project Management account.</Text>
        <Text>
          Your OTP Code: <strong>{otp}</strong>
        </Text>
        <Text>
          This OTP is valid for <strong>{expiryMinutes}</strong> minutes.
        </Text>
        <Text>Please do not share this code with anyone.</Text>
        <Text>
          If you have any questions, or did not make this request, please contact us by clicking{" "}
          <Link href={supportUrl}>here</Link>.
        </Text>
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

export default ForgotPasswordEmail;
