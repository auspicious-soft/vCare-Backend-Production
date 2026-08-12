import * as React from "react";
import { Container, Head, Hr, Html, Link, Text } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface CertificateIssuedEmailProps {
  fullName?: string;
  certificateName?: string;
  claimCode?: string;
  pduText?: string;
  contactHoursText?: string;
  certificatePdf?: string;
  extraFields?: Array<{ label: string; value: string }>;
}

const CertificateIssuedEmail: React.FC<Readonly<CertificateIssuedEmailProps>> = ({
  fullName,
  certificateName,
  claimCode,
  pduText,
  contactHoursText,
  certificatePdf,
  extraFields = [],
}) => {
  return (
    <Html lang="en">
      <Head>
        <title>Congratulations! Your Certificate Is Ready</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>Hello  {fullName?.trim() || ""},</Text>
        <Text>Congratulations on successfully completing your {certificateName || "course"}!</Text>
        <Text>Your certificate has been issued and is now available for you.</Text>
        {claimCode ? (
          <Text style={{ margin: "8px 0", lineHeight: "1.5" }}>
            <strong>{claimCode}</strong> 
          </Text>
        ) : null}
        {pduText ? (
          <Text style={{ margin: "8px 0", lineHeight: "1.5" }}>
            <strong>{pduText}</strong> 
          </Text>
        ) : null}
        {contactHoursText ? (
          <Text style={{ margin: "8px 0", lineHeight: "1.5" }}>
            <strong>{contactHoursText}</strong> 
          </Text>
        ) : null}
        {extraFields.map((item) => (
          <Text style={{ margin: "8px 0", lineHeight: "1.5" }} key={`${item.label}-${item.value}`}>
            <strong>{item.label}:</strong> {item.value}
          </Text>
        ))}
        <Text>
          Your certificate has been attached to this email as a PDF for your convenience.
        </Text>
        <Text>If you experience any issues accessing your certificate or require assistance, please feel free to contact our support team.</Text>
        <Text>Thank you for choosing vCare Project Management for your professional development and certification journey. We wish you continued success in your career.</Text>
        <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0 12px" }} />

        {/* ── Footer ── */}
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

export default CertificateIssuedEmail;
