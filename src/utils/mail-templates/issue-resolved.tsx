import * as React from "react";
import { Container, Head, Hr, Html, Link, Text } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface IssueResolvedEmailProps {
  fullName?: string;
  resolutionSummary?: string;
}

const IssueResolvedEmail: React.FC<Readonly<IssueResolvedEmailProps>> = ({
  fullName,
  resolutionSummary,
}) => {
  return (
    <Html lang="en">
      <Head>
        <title>Your Support Request Has Been Resolved</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>Hello {fullName?.trim() || "User"},</Text>
        <Text>This is to let you know that your support request has been resolved.</Text>
        <Text>
          <strong>Resolution Summary:</strong> {resolutionSummary || "Resolved by support team"}
        </Text>
        <Text>If you continue to experience any issues or require further assistance, please contact our support team through the portal.</Text>
        <Text>Thank you for your patience and for choosing vCare Project Management.</Text>
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

export default IssueResolvedEmail;
