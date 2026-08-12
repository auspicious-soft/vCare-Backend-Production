import * as React from "react";
import { Container, Head, Hr, Html, Link, Text } from "@react-email/components";
import { socialIconWrapStyle } from "./welcome-user.js";

interface PaymentFailedEmailProps {
  fullName?: string;
  subscriptionName?: string;
  paymentAmount?: string;
  supportUrl?: string;
}

const PaymentFailedEmail: React.FC<Readonly<PaymentFailedEmailProps>> = ({
  fullName,
  subscriptionName,
  paymentAmount,
  supportUrl = "https://www.vcareprojectmanagement.com/pages/contact-us",
}) => {
  return (
    <Html lang="en">
      <Head>
        <title>Payment Unsuccessful - Action Required</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>Hello {fullName?.trim() || "User"},</Text>
        <Text>We were unable to process your recent payment for your order.</Text>
        {subscriptionName ? (
          <Text>
            <strong>Plan:</strong> {subscriptionName}
          </Text>
        ) : null}
        {paymentAmount ? (
          <Text>
            <strong>Amount:</strong> {paymentAmount}
          </Text>
        ) : null}
        <Text>This may have occurred due to insufficient funds, expired payment details, banking restrictions, or a declined transaction.</Text>
        <Text>Please retry and resubmit your payment to activate access to your selected learning plan and resources.</Text>
        <Text>If you have already completed the payment, please disregard this email.</Text>
        <Text>
          Have a question or need help? Contact us: <Link href={supportUrl}>{supportUrl}</Link>
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

export default PaymentFailedEmail;
