import { Container, Head, Hr, Html, Link, Text } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

type Purpose = "LOGIN" | "FORGOT_PASSWORD" | "VERIFY_EMAIL";

interface EmailProps {
  otp: string;
  purpose: Purpose;
  fullName?: string;
  expiryMinutes?: number;
  supportUrl?: string;
}

const purposeContent: Record<Purpose, { title: string; message: string }> = {
  LOGIN: {
    title: "vCare Project Management Verification Code",
    message: "As requested, we have generated a new One-Time Password (OTP) for your account.",
  },
  FORGOT_PASSWORD: {
    title: "vCare Project Management Verification Code",
    message: "As requested, we have generated a new One-Time Password (OTP) for your account.",
  },
  VERIFY_EMAIL: {
    title: "vCare Project Management Verification Code",
    message: "As requested, we have generated a new One-Time Password (OTP) for your account.",
  },
};

const ResendOTPEmail: React.FC<Readonly<EmailProps>> = ({
  otp,
  purpose,
  fullName,
  expiryMinutes = 10,
  supportUrl = "https://www.vcareprojectmanagement.com/pages/contact-us",
}) => {
  const content = purposeContent[purpose];

  return (
    <Html lang="en">
      <Head>
        <title>{content.title}</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>Hello {fullName?.trim() || "User"},</Text>
        <Text>{content.message}</Text>
        <Text>
          OTP Code: <strong>{otp}</strong>
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

export default ResendOTPEmail;
