// templates/certificateTemplate.ts

import type { CertificateTemplate } from "./sample-template.js";


export const modernCertificateTemplate: CertificateTemplate = {
  templateName: "modern-blue-certificate",

  layout: {
    width: 1200,
    height: 850,
    backgroundColor: "#f4f6f8",
  },

  staticTexts: [
    {
      text: "CERTIFICATE",
      x: 600,
      y: 120,
      fontSize: 42,
      fontFamily: "Arial",
      color: "#333",
    },
    {
      text: "OF APPRECIATION",
      x: 600,
      y: 160,
      fontSize: 18,
      color: "#666",
    },
    {
      text: "PROUDLY PRESENTED TO",
      x: 600,
      y: 220,
      fontSize: 14,
      color: "#777",
    },
  ],

  fields: [
    {
      key: "name",
      x: 600,
      y: 320,
      fontSize: 60,
      fontFamily: "Brush Script MT, cursive",
      align: "center",
      color: "#111",
    },
    {
      key: "description",
      x: 600,
      y: 400,
      fontSize: 18,
      fontFamily: "Arial",
      align: "center",
      color: "#666",
    },
    {
      key: "date",
      x: 250,
      y: 760,
      fontSize: 14,
      align: "center",
    },
    {
      key: "trainer",
      x: 950,
      y: 760,
      fontSize: 14,
      align: "center",
    },
  ],

  images: [
    {
      key: "badge", // top-left badge
      x: 80,
      y: 60,
      width: 120,
      height: 120,
    },
    {
      key: "signatureLeft",
      x: 150,
      y: 700,
      width: 150,
      height: 60,
    },
    {
      key: "signatureRight",
      x: 900,
      y: 700,
      width: 150,
      height: 60,
    },
  ],
};