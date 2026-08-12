import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface ProblemReportedEmailProps {
  ownerName?: string;
  reportId: string;
  courseName: string;
  reportType: string;
  reporterName?: string;
  reporterEmail?: string;
  relevantId?: string | null;
  comments?: string | null;
  reportedAt?: string;
}

const cardStyle: React.CSSProperties = {
  maxWidth: "680px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "28px",
  fontFamily: "Arial, sans-serif",
  color: "#111827",
};

const headingStyle: React.CSSProperties = {
  fontSize: "26px",
  lineHeight: "32px",
  fontWeight: 700,
  margin: "0 0 16px 0",
  color: "#0f172a",
};

const labelStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#111827",
};

const valueStyle: React.CSSProperties = {
  color: "#374151",
};

const ProblemReportedEmail: React.FC<Readonly<ProblemReportedEmailProps>> = ({
  ownerName,
  reportId,
  courseName,
  reportType,
  reporterName,
  reporterEmail,
  relevantId,
  comments,
  reportedAt,
}) => {
  const owner = ownerName?.trim() || "Owner";
  const course = courseName?.trim() || "Selected course";
  const reporter = reporterName?.trim() || "User";
  const safeComments = comments?.trim();
  const safeRelevantId = relevantId?.toString().trim();

  return (
    <Html lang="en">
      <Head>
        <title>New Problem Reported</title>
      </Head>
      <Preview>New problem reported for {course}</Preview>
      <Body style={{ backgroundColor: "#f3f4f6", padding: "24px 12px" }}>
        <Container style={cardStyle}>
          <Heading style={headingStyle}>New Problem Reported</Heading>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 12px" }}>
            Hello {owner},
          </Text>
          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" }}>
            A learner has reported a problem from the course portal. Please review the details below.
          </Text>

          <Section>
            <Text style={{ margin: "0 0 8px" }}>
              <span style={labelStyle}>Report ID:</span>{" "}
              <span style={valueStyle}>{reportId}</span>
            </Text>
            <Text style={{ margin: "0 0 8px" }}>
              <span style={labelStyle}>Course:</span>{" "}
              <span style={valueStyle}>{course}</span>
            </Text>
            <Text style={{ margin: "0 0 8px" }}>
              <span style={labelStyle}>Problem Type:</span>{" "}
              <span style={valueStyle}>{reportType}</span>
            </Text>
            <Text style={{ margin: "0 0 8px" }}>
              <span style={labelStyle}>Reported By:</span>{" "}
              <span style={valueStyle}>{reporter}</span>
            </Text>
            {reporterEmail ? (
              <Text style={{ margin: "0 0 8px" }}>
                <span style={labelStyle}>Reporter Email:</span>{" "}
                <span style={valueStyle}>{reporterEmail}</span>
              </Text>
            ) : null}
            {safeRelevantId ? (
              <Text style={{ margin: "0 0 8px" }}>
                <span style={labelStyle}>Relevant ID:</span>{" "}
                <span style={valueStyle}>{safeRelevantId}</span>
              </Text>
            ) : null}
            <Text style={{ margin: "0 0 8px" }}>
              <span style={labelStyle}>Reported At:</span>{" "}
              <span style={valueStyle}>{reportedAt}</span>
            </Text>
            {safeComments ? (
              <Text style={{ margin: "0 0 8px" }}>
                <span style={labelStyle}>Comments:</span>{" "}
                <span style={valueStyle}>{safeComments}</span>
              </Text>
            ) : null}
          </Section>

          <Text style={{ fontSize: "15px", lineHeight: "24px", margin: "16px 0 0" }}>
            Please review this report in the admin dashboard and take the necessary action.
          </Text>

          <Hr style={{ borderColor: "#e5e7eb", margin: "22px 0 12px" }} />

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
        </Container>
      </Body>
    </Html>
  );
};

export default ProblemReportedEmail;
