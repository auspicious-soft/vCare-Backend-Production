import * as React from "react";
import { Html, Head, Container, Text, Link, Hr } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface EmailProps {
  email: string;
  password: string;
  name: string;
}

const LoginCredentials: React.FC<EmailProps> = ({ email, password, name }) => {
  return (
    <Html lang="en">
      <Head>
        <title>vCare - Your Login Credentials</title>
      </Head>
      <Container style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
        <Text style={{ color: "#000" }}>
          Hi {name || "there"},
        </Text>
        <Text style={{ color: "#000" }}>
          Please use the following credentials to access your account:
        </Text>
        <Text style={{ fontSize: "16px", fontWeight: "bold", color: "#000" }}>
          Login Page:{" "}
          <a
            href={
              process.env.FRONTEND_ADMIN_URL ||
              "https://dharma-admin-panel.vercel.app/login"
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            {process.env.FRONTEND_ADMIN_URL ||
              "https://dharma-admin-panel.vercel.app/login"}
          </a>
        </Text>
        <Text style={{ fontSize: "16px", fontWeight: "bold", color: "#000" }}>
          Email: {email}
        </Text>
        <Text style={{ fontSize: "16px", fontWeight: "bold", color: "#000" }}>
          Temporary Password: {password}
        </Text>
        <Text style={{ color: "#6c757d" }}>
          Please use the password above and change it after your first login for
          security purposes.
        </Text>
        <Text style={{ color: "#6c757d" }}>
          If you experience any issues accessing your account or require
          assistance, please contact our support team.
        </Text>
        {/* ── Footer ── */}
        <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0 12px" }} />

        <Text
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#374151",
            textAlign: "center",
            margin: "0 0 2px",
          }}
        >
          vCare Project Management
        </Text>
        <Text
          style={{
            fontSize: "12px",
            color: "#9ca3af",
            textAlign: "center",
            margin: "0 0 14px",
          }}
        >
          PMI Premier Authorized Training Partner
        </Text>

        {/* Social icons */}
        <div style={{ textAlign: "center", marginBottom: "10px" }}>
          <Link
            href="https://www.linkedin.com/company/vcareprojectmanagement"
            style={socialIconWrapStyle}
          >
            LinkedIn
          </Link>
          <Link href="https://x.com/vCare_official" style={socialIconWrapStyle}>
            X
          </Link>
          <Link
            href="https://www.facebook.com/vCareProjectManagement/"
            style={socialIconWrapStyle}
          >
            Facebook
          </Link>
          <Link
            href="https://www.youtube.com/channel/UCWg9sBRmPCcpVy2KY5AtjQQ"
            style={socialIconWrapStyle}
          >
            YouTube
          </Link>
          <Link
            href="https://www.instagram.com/vcareprojectmanagement/"
            style={socialIconWrapStyle}
          >
            Instagram
          </Link>
        </div>
      </Container>
    </Html>
  );
};

export default LoginCredentials;
