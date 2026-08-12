import * as React from "react";
import { Container, Head, Hr, Html, Link, Text } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface PasswordUpdateRequestEmailProps {
  fullName?: string;
}

const PasswordUpdateRequestEmail: React.FC<Readonly<PasswordUpdateRequestEmailProps>> = ({
  fullName,
}) => {
  return (
    <Html lang="en">
      <Head>
        <title>Action Required: Please Update Your Account Password</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>Hello {fullName?.trim() || "User"},</Text>
        <Text>As part of our regular account maintenance, we request you to update your password to ensure uninterrupted access to your LMS account.</Text>
        <Text>
          <strong>What you need to do:</strong> Use the Forgot Password option or login with your existing credentials to set a new password.
        </Text>
        <Text>
          <strong>Helpful tips while setting your new password:</strong>
        </Text>
        <Text>- Choose a strong and unique password</Text>
        <Text>- Avoid reusing previously used passwords</Text>
        <Text>- Keep your login details confidential</Text>
        <Text>Updating your password will help ensure a smooth and secure learning experience on our platform.</Text>
        <Text>If you need any assistance, please feel free to reach out to us through our website.</Text>
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

export default PasswordUpdateRequestEmail;
