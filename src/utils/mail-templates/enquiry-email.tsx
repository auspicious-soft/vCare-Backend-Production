import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WebsiteEnquiryEmailProps {
  type: string;
  data: Record<string, any>;
}

const containerStyle: React.CSSProperties = {
  maxWidth: "700px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "24px",
  fontFamily: "Arial, sans-serif",
};

const headingStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  marginBottom: "8px",
  color: "#111827",
};

const labelStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#111827",
};

const valueStyle: React.CSSProperties = {
  color: "#374151",
};

const WebsiteEnquiryEmail: React.FC<
  Readonly<WebsiteEnquiryEmailProps>
> = ({ type, data }) => {
  const formattedType = type
    ?.replace(/_/g, " ")
    ?.replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Html>
      <Head />
      <Preview>New Website Enquiry Received</Preview>

      <Body
        style={{
          backgroundColor: "#f3f4f6",
          padding: "20px",
        }}
      >
        <Container style={containerStyle}>
          <Heading style={headingStyle}>
            New Website Enquiry
          </Heading>

          <Text>
            A new enquiry has been submitted from the website.
          </Text>

          <Hr />

          <Section>
            <Text>
              <span style={labelStyle}>Enquiry Type:</span>{" "}
              <span style={valueStyle}>{formattedType}</span>
            </Text>
          </Section>

          <Hr />

          <Section>
            {Object.entries(data || {}).map(([key, value]) => (
              <Text key={key}>
                <span style={labelStyle}>
                  {key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (s) => s.toUpperCase())}
                  :
                </span>{" "}
                <span style={valueStyle}>
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </span>
              </Text>
            ))}
          </Section>

          <Hr />

          <Text
            style={{
              fontSize: "12px",
              color: "#6b7280",
            }}
          >
            Any uploaded files are attached to this email.
          </Text>

          <Text
            style={{
              fontSize: "12px",
              color: "#9ca3af",
            }}
          >
            Generated automatically from the website enquiry form.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default WebsiteEnquiryEmail;