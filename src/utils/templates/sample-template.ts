export interface CertificateField {
  key: string; // e.g. "name", "course"
  x: number;
  y: number;
  fontSize: number;
  fontFamily?: string;
  align?: "left" | "center" | "right";
  color?: string;
}

export interface StaticText {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily?: string;
  color?: string;
}

export interface ImageField {
  key: string; // e.g. "logo", "signature"
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CertificateTemplate {
  templateName: string;
  layout: {
    width: number;
    height: number;
    backgroundColor: string;
  };
  staticTexts: StaticText[];
  fields: CertificateField[];
  images?: ImageField[];
}
export const sampleTemplate: CertificateTemplate = {
  templateName: "default-template",

  layout: {
    width: 1200,
    height: 850,
    backgroundColor: "#f5f5f5",
  },

  staticTexts: [
    { text: "CERTIFICATE", x: 600, y: 120, fontSize: 40 },
    { text: "OF APPRECIATION", x: 600, y: 160, fontSize: 20 },
    { text: "PROUDLY PRESENTED TO", x: 600, y: 220, fontSize: 16 },
  ],

  fields: [
    { key: "name", x: 600, y: 320, fontSize: 60, fontFamily: "Brush Script MT, cursive", align: "center" },
    { key: "description", x: 600, y: 400, fontSize: 18, fontFamily: "Arial", align: "center", color: "#666" },
    { key: "date", x: 275, y: 760, fontSize: 14 },
    { key: "trainer", x: 925, y: 760, fontSize: 14 },
  ],

  images: [
    { key: "logo", x: 1000, y: 50, width: 120, height: 120 },
    { key: "signature", x: 850, y: 700, width: 200, height: 80 },
  ],
};