import * as React from "react";
import { Container, Head, Html, Text } from "@react-email/components";

interface ContactAdminNotificationEmailProps {
  fullName: string;
  email: string;
  phoneNumber: string;
  subject: string;
  message: string;
  pageUrl?: string;
}

const ContactAdminNotificationEmail: React.FC<Readonly<ContactAdminNotificationEmailProps>> = ({
  fullName,
  email,
  phoneNumber,
  subject,
  message,
  pageUrl,
}) => {
  console.log('phoneNumber: ', phoneNumber);
  return (
    <Html lang="en">
      <Head>
        <title>New Customer Message</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.6", color: "#111827", padding: "12px" }}>
        <Text>You received a new message from your LMS online store contact form.</Text>
        <Text>
          <strong>Subject:</strong> {subject}
        </Text>
        <Text>
          <strong>Full Name:</strong> {fullName}
        </Text>
        <Text>
          <strong>Email:</strong> {email}
        </Text>
        <Text>
          <strong>Phone Number:</strong> {phoneNumber}
        </Text>
        {pageUrl ? (
          <Text>
            <strong>Page URL:</strong> {pageUrl}
          </Text>
        ) : null}
        <Text>
          <strong>Message:</strong>
        </Text>
        <Text>{message}</Text>
      </Container>
    </Html>
  );
};

export default ContactAdminNotificationEmail;
