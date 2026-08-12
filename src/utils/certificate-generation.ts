import { createCanvas, loadImage } from "canvas";
import type { IDefaultVariable } from "../models/template-schema.js";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { getS3Url } from "./helpers.js";
import { getFileUrl } from "../helpers/index.js";

const resolveAssetPath = (asset?: string): string | undefined => {
  if (!asset) return undefined;
  if (/^https?:\/\//i.test(asset)) return asset;
  const candidates = [
    path.resolve(asset),
    path.resolve(process.cwd(), asset),
    path.resolve(process.cwd(), "src", "static", asset),
    path.resolve(process.cwd(), "static", asset),
    path.resolve(process.cwd(), "src", asset),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return getS3Url(asset);
};
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;

    if (ctx.measureText(testLine).width <= maxWidth) {
      line = testLine;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);

  return lines;
}

const hasRenderableText = (value: unknown): boolean =>
  value !== undefined && value !== null && String(value).trim() !== "";

const isTinyPlaceholderAsset = (asset?: string): boolean => {
  const resolved = resolveAssetPath(asset);
  if (!resolved || /^https?:\/\//i.test(resolved)) return false;
  try {
    const stat = fs.statSync(resolved);
    return stat.isFile() && stat.size <= 1024;
  } catch {
    return false;
  }
};

const drawImageContain = (
  ctx: CanvasRenderingContext2D,
  image: any,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const srcW = image.width || width;
  const srcH = image.height || height;
  const scale = Math.min(width / srcW, height / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const drawX = x + (width - drawW) / 2;
  const drawY = y + (height - drawH) / 2;
  ctx.drawImage(image, drawX, drawY, drawW, drawH);
};

/**
 * Draws the blue geometric diamond/triangle cluster decoration.
 * Mirrors the top-right corner cluster to bottom-left.
 */
const drawDiamondCluster = (
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  flipX: number,
  flipY: number,
  scale: number,
) => {
  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(flipX * scale, flipY * scale);

  // Define diamond shapes as polygon points (relative to origin)
  // Approximate the clustered diamond shapes from the image
  const shapes: { points: [number, number][]; color: string }[] = [
    // Large dark blue diamond - top-right anchor
    {
      points: [
        [0, -160],
        [100, -60],
        [60, 40],
        [-40, -60],
      ],
      color: "#1565c0",
    },
    // Medium blue diamond - second row
    {
      points: [
        [60, -20],
        [160, 60],
        [110, 140],
        [20, 60],
      ],
      color: "#1976d2",
    },
    // Light blue diamond - third
    {
      points: [
        [-50, 20],
        [50, 100],
        [10, 180],
        [-80, 100],
      ],
      color: "#42a5f5",
    },
    // Small accent diamond top
    {
      points: [
        [90, -150],
        [160, -90],
        [130, -20],
        [60, -80],
      ],
      color: "#1e88e5",
    },
    // Tiny bright diamond
    {
      points: [
        [140, -70],
        [190, -20],
        [165, 40],
        [115, -10],
      ],
      color: "#64b5f6",
    },
    // Medium mid-cluster
    {
      points: [
        [110, 40],
        [175, 100],
        [145, 160],
        [85, 100],
      ],
      color: "#1565c0",
    },
    // Bright small top-edge
    {
      points: [
        [160, -130],
        [210, -80],
        [190, -20],
        [145, -70],
      ],
      color: "#90caf9",
    },
    // Bottom accent
    {
      points: [
        [-20, 130],
        [70, 200],
        [30, 260],
        [-50, 200],
      ],
      color: "#1976d2",
    },
    // Far bottom small
    {
      points: [
        [40, 200],
        [110, 250],
        [85, 300],
        [20, 255],
      ],
      color: "#42a5f5",
    },
    // Edge sliver right
    {
      points: [
        [185, -50],
        [230, 0],
        [210, 60],
        [170, 10],
      ],
      color: "#bbdefb",
    },
  ];

  for (const shape of shapes) {
    const [firstPoint, ...restPoints] = shape.points;
    if (!firstPoint) continue;

    ctx.beginPath();
    ctx.moveTo(firstPoint[0], firstPoint[1]);
    for (const point of restPoints) {
      ctx.lineTo(point[0], point[1]);
    }
    ctx.closePath();
    ctx.fillStyle = shape.color;
    ctx.fill();
  }

  ctx.restore();
};

/**
 * Draws the circular PMI ATP badge (left side of certificate).
 */
const drawPMIBadge = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) => {
  // Outer circle - dark navy ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#0d2b5e";
  ctx.fill();

  // Inner white circle
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // PMI text - colored letters
  const fs1 = Math.round(r * 0.48);
  ctx.font = `bold ${fs1}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // P - dark blue
  ctx.fillStyle = "#1565c0";
  ctx.fillText("P", cx - r * 0.32, cy - r * 0.02);
  // M - red
  ctx.fillStyle = "#e53935";
  ctx.fillText("M", cx + r * 0.01, cy - r * 0.02);
  // I - green
  ctx.fillStyle = "#2e7d32";
  ctx.fillText("I", cx + r * 0.3, cy - r * 0.02);

  // Outer ring arc text "PROJECT MANAGEMENT INSTITUTE"
  const arcR = r * 0.93;
  const text = "PROJECT MANAGEMENT INSTITUTE";
  const charCount = text.length;
  const arcSpan = Math.PI * 1.3; // spans top 230 degrees
  const startAngle = -Math.PI / 2 - arcSpan / 2;

  ctx.font = `bold ${Math.round(r * 0.1)}px Arial`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < charCount; i++) {
    const angle = startAngle + (i / (charCount - 1)) * arcSpan;
    ctx.save();
    ctx.translate(cx + arcR * Math.cos(angle), cy + arcR * Math.sin(angle));
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(text[i] || "", 0, 0);
    ctx.restore();
  }

  // "AUTHORIZED TRAINING PARTNER" arc on bottom
  const bottomText = "AUTHORIZED TRAINING PARTNER";
  const bottomArcR = r * 0.93;
  const bottomArcSpan = Math.PI * 1.05;
  const bottomStart = Math.PI / 2 - bottomArcSpan / 2;

  ctx.font = `bold ${Math.round(r * 0.09)}px Arial`;
  ctx.fillStyle = "#ffffff";

  for (let i = 0; i < bottomText.length; i++) {
    const angle = bottomStart + (i / (bottomText.length - 1)) * bottomArcSpan;
    ctx.save();
    ctx.translate(
      cx + bottomArcR * Math.cos(angle),
      cy + bottomArcR * Math.sin(angle),
    );
    ctx.rotate(angle - Math.PI / 2);
    ctx.fillText(bottomText[i] || "", 0, 0);
    ctx.restore();
  }

  ctx.textBaseline = "alphabetic";
};
export const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
};
export const generateCertificate = async (
  template: any,
  runtimeData: any,
): Promise<{ pngBuffer: Buffer; pdfBuffer: Buffer }> => {
  const finalData = {
    ...template.defaults,
    ...template.defaults?.assets,
    ...runtimeData,
  } as Record<string, any>;

  const templateVariables: IDefaultVariable[] = Array.isArray(
    template?.defaults?.variables,
  )
    ? template.defaults.variables
    : [];
  for (const variable of templateVariables) {
    finalData[`${variable.key}Label`] =
      finalData[`${variable.key}Label`] || variable.label;
    finalData[`${variable.key}Value`] =
      finalData[`${variable.key}Value`] || variable.value;
  }

  const canvas = await drawCertificate(template, finalData);
  const pngBuffer = canvas.toBuffer("image/png");

  const doc = new PDFDocument({
    size: [template.layout?.width || 1122, template.layout?.height || 794],
  });

  const pdfChunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer | Uint8Array) => {
    pdfChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  doc.image(pngBuffer, 0, 0, {
    width: template.layout?.width || 1122,
    height: template.layout?.height || 794,
  });

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(pdfChunks)));
    doc.on("error", reject);
    doc.end();
  });

  return { pngBuffer, pdfBuffer };
};

export const drawCertificate = async (template: any, data: any) => {
  // Landscape A4 proportions: 1122 x 794
  const layout = template.layout || {
    width: 1122,
    height: 794,
    backgroundColor: "#ffffff",
  };

  const canvas = createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const { width, height } = layout;
  const cx = width / 2;

  ///////////////////////////////////////////////////////////
  // 1. WHITE BACKGROUND
  ///////////////////////////////////////////////////////////
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ///////////////////////////////////////////////////////////
  // 2. BLUE GEOMETRIC DIAMOND CLUSTERS
  //    Top-right corner + Bottom-left corner (mirrored)
  ///////////////////////////////////////////////////////////
  const clusterScale = width / 1122;

  // Top-right cluster
  // drawDiamondCluster(ctx, width, 0, -1, 1, clusterScale);
  // Bottom-left cluster
  // drawDiamondCluster(ctx, 0, height, 1, -1, clusterScale);

  ///////////////////////////////////////////////////////////
  // 3. DATA EXTRACTION
  ///////////////////////////////////////////////////////////
  // const asText = (v: unknown): string =>
  //   v !== undefined && v !== null && String(v).trim() !== "" ? String(v).trim() : "";
  const asText = (v: unknown): string => {
    const text =
      v !== undefined && v !== null && String(v).trim() !== ""
        ? String(v).trim()
        : "";

    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  };
  // Participant name: First Name + Last Name (account-generated certificates)
  // OR a manually entered <Name> field (certificates added manually).
  const composedName = [data.firstName, data.lastName]
    .filter(hasRenderableText)
    .join(" ");
  const participantName =
    asText(data.name) || asText(composedName) || asText(data.fullName) || "";

  // Course name field must always come from the Template's own name
  // (<Name of Template>) — it is NOT the legacy "courseName" value.
  const courseName = data.templateName || template?.templateName;

  const trainerName = data.trainerName || "";
  const trainerTitle = data.trainerTitle || "Founder & Managing Director";
  const trainerCompany = data.issuingCompany || "";
  const pduText = data.totalPDUsClaimable || data.totalPDUs;
  const contactHoursText =
    data.totalContactHoursEligible || data.totalContactHours;
  const badgeNumber = data.pmiATP;
  const orgName = data.atpName;

  const certificateTitle = data.deliveryFormat || "CERTIFICATE OF ACHIEVEMENT";

  const templateType =
    data.templateType || template?.templateType || template?.type;
  const completionDateAdded = formatDate(data.completionDate);
  const autoCompletionDate =
    templateType === "Mock Exams"
      ? asText(data.dateMockExamCompleted)
      : asText(data.dateOnlineCourseCompleted);
  const completionDateText = completionDateAdded || autoCompletionDate;

  ///////////////////////////////////////////////////////////
  // 4. COMPANY LOGO — top left
  ///////////////////////////////////////////////////////////
  const logoSlotX = width * 0.025;
  const logoSlotY = height * 0.04;
  const logoW = width * 0.16;
  const logoH = height * 0.14;

  // Fallback placeholder text if no logo image
  const companyLogoUrl = getFileUrl(data.companyLogo);
  let companyLogoLoaded = false;
  if (companyLogoUrl && !isTinyPlaceholderAsset(companyLogoUrl)) {
    try {
      const img = await loadImage(resolveAssetPath(companyLogoUrl)!);
      drawImageContain(ctx, img, logoSlotX, logoSlotY, logoW, logoH);
      companyLogoLoaded = true;
    } catch {
      // fall through to text placeholder
    }
  }
  // if (!companyLogoLoaded) {
  // 	// Draw a simple text-based placeholder
  // 	ctx.save();
  // 	ctx.fillStyle = "#1565c0";
  // 	ctx.font = `bold ${Math.round(width * 0.018)}px Arial`;
  // 	ctx.textAlign = "left";
  // 	ctx.fillText("vCare Project Management", logoSlotX, logoSlotY + logoH * 0.7);
  // 	ctx.restore();
  // }

  ///////////////////////////////////////////////////////////
  // 5. PMI LOGO + HEADER TEXT — side by side with a small gap,
  //    centered together as one group. Falls back to whichever
  //    of the two actually exists.
  ///////////////////////////////////////////////////////////
  // const headerRowY  = height * 0.13;   // shared vertical center for logo + text
  // const headerLogoW = width * 0.045;
  // const headerLogoH = height * 0.045;
  // const headerGap   = width * 0.012;

  // const pmiLogoUrl = data.pmiLogo;
  // let pmiLogoImage: any = null;
  // if (pmiLogoUrl && !isTinyPlaceholderAsset(pmiLogoUrl)) {
  //   try {
  //     pmiLogoImage = await loadImage(resolveAssetPath(pmiLogoUrl)!);
  //   } catch {
  //     pmiLogoImage = null;
  //   }
  // }

  // ctx.fillStyle = "#555555";
  // ctx.font = `bold ${Math.round(width * 0.013)}px Arial`;

  // if (orgName && pmiLogoImage) {
  //   // Logo + text drawn together as a single centered group
  //   const textWidth   = ctx.measureText(orgName).width;
  //   const groupWidth  = headerLogoW + headerGap + textWidth;
  //   const groupStartX = cx - groupWidth / 2;

  //   drawImageContain(ctx, pmiLogoImage, groupStartX, headerRowY - headerLogoH / 2, headerLogoW, headerLogoH);

  //   ctx.textAlign = "left";
  //   ctx.textBaseline = "middle";
  //   ctx.fillText(orgName, groupStartX + headerLogoW + headerGap, headerRowY);
  //   ctx.textBaseline = "alphabetic";
  // } else if (pmiLogoImage) {
  //   // Logo only, centered
  //   drawImageContain(ctx, pmiLogoImage, cx - headerLogoW / 2, headerRowY - headerLogoH / 2, headerLogoW, headerLogoH);
  // } else if (orgName) {
  //   // Text only, centered (original behavior)
  //   ctx.textAlign = "center";
  //   ctx.textBaseline = "middle";
  //   ctx.fillText(orgName, cx, headerRowY);
  //   ctx.textBaseline = "alphabetic";
  // }

  const headerLogoW = width * 0.07; // combined logo + text
  const headerLogoH = height * 0.07;
  const singleHeaderLogoW = width * 0.15;
  const singleHeaderLogoH = height * 0.15;
  const headerGap = width * 0.0001;
  const headerRowY = height * 0.13; // shared vertical center for logo + text

  ctx.fillStyle = "#555555";
  ctx.font = `bold ${Math.round(width * 0.013)}px Arial`;
  const pmiLogoUrl = getFileUrl(data.pmiLogo);
  let pmiLogoImage: any = null;
  if (pmiLogoUrl && !isTinyPlaceholderAsset(pmiLogoUrl)) {
    try {
      pmiLogoImage = await loadImage(resolveAssetPath(pmiLogoUrl)!);
    } catch {
      pmiLogoImage = null;
    }
  }
  if (orgName && pmiLogoImage) {
    const textWidth = ctx.measureText(orgName).width;

    const groupWidth = headerLogoW + headerGap + textWidth;

    const groupStartX = cx - groupWidth / 2;

    drawImageContain(
      ctx,
      pmiLogoImage,
      groupStartX,
      headerRowY - headerLogoH / 2,
      headerLogoW,
      headerLogoH,
    );

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const textX = groupStartX + headerLogoW + headerGap;

    ctx.fillText(orgName, textX, headerRowY);

    ctx.textBaseline = "alphabetic";
  }
  if (orgName && !pmiLogoImage) {
    ctx.font = `bold ${Math.round(width * 0.016)}px Arial`;

    const textCenterX = cx;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(orgName, textCenterX, headerRowY);

    ctx.textBaseline = "alphabetic";
  }
  if (!orgName && pmiLogoImage) {
    drawImageContain(
      ctx,
      pmiLogoImage,
      cx - singleHeaderLogoW / 2,
      headerRowY - singleHeaderLogoH / 2,
      singleHeaderLogoW,
      singleHeaderLogoH,
    );
  }
  ///////////////////////////////////////////////////////////
  // 6. CERTIFICATE TITLE — bold large blue title
  ///////////////////////////////////////////////////////////
  const titleY = height * 0.245;
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `bold ${Math.round(width * 0.04)}px Arial`;
  ctx.textAlign = "center";
  ctx.fillText(certificateTitle, cx, titleY);

  // Short decorative line below title  (the small horizontal accent from the image)
  // const lineLen = width * 0.035;
  // const lineY = titleY + height * 0.022;
  // ctx.strokeStyle = "#1565c0";
  // ctx.lineWidth = 3;
  // ctx.beginPath();
  // ctx.moveTo(cx - lineLen, lineY);
  // ctx.lineTo(cx + lineLen, lineY);
  // ctx.stroke();

  ///////////////////////////////////////////////////////////
  // 7. "Is hereby granted to"
  ///////////////////////////////////////////////////////////
  const grantedY = height * 0.345;
  ctx.fillStyle = "#777777";
  ctx.font = `${Math.round(width * 0.016)}px Georgia`;
  ctx.textAlign = "center";
  ctx.fillText("Is hereby granted to", cx, grantedY);

  ///////////////////////////////////////////////////////////
  // 8. PARTICIPANT NAME  — large cursive/script, blue, bold
  ///////////////////////////////////////////////////////////
  const nameY = height * 0.47;
  ctx.fillStyle = "#1a1a1a";
  // Use a serif italic that resembles a script/cursive signature style
  ctx.font = `italic bold ${Math.round(width * 0.029)}px "Times New Roman"`;
  ctx.textAlign = "center";
  ctx.fillText(participantName, cx, nameY);

  // Horizontal line below name spanning ~55% of width
  const nameLineY = nameY + height * 0.028;
  const nameLineHalf = width * 0.275;
  ctx.strokeStyle = "#aaaaaa";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - nameLineHalf, nameLineY);
  ctx.lineTo(cx + nameLineHalf, nameLineY);
  ctx.stroke();

  ///////////////////////////////////////////////////////////
  // 9. "For achieving and completing..."
  ///////////////////////////////////////////////////////////
  const achieveY = height * 0.565;
  ctx.fillStyle = "#555555";
  ctx.font = `${Math.round(width * 0.016)}px Georgia`;
  ctx.textAlign = "center";
  ctx.fillText("FOR SUCCESSFULLY COMPLETING ", cx, achieveY);

  ///////////////////////////////////////////////////////////
  // 10. COURSE NAME  — bold large dark text
  ///////////////////////////////////////////////////////////
  const courseY = height * 0.645;
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `bold ${Math.round(width * 0.025)}px Arial`;
  ctx.textAlign = "center";

  // Wrap if needed
  const maxCourseW = width * 0.65;
  const words = courseName.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxCourseW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const courseLineH = height * 0.054;
  const courseStartY = courseY - ((lines.length - 1) * courseLineH) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] || "", cx, courseStartY + i * courseLineH);
  }

  ///////////////////////////////////////////////////////////
  // 11. COMPLETION DATE LINE — "on <date>", date in the same
  //     blue used for the participant's name
  ///////////////////////////////////////////////////////////
  const completionLineY = height * 0.705;
  if (completionDateText) {
    const onLabel = "on ";
    ctx.font = `${Math.round(width * 0.014)}px Georgia`;
    ctx.textAlign = "left";
    const onWidth = ctx.measureText(onLabel).width;
    const dateWidth = ctx.measureText(completionDateText).width;
    const startX = cx - (onWidth + dateWidth) / 2;

    ctx.fillStyle = "#555555";
    ctx.fillText(onLabel, startX, completionLineY);

    ctx.fillStyle = "#555555";
    ctx.fillText(completionDateText, startX + onWidth, completionLineY);
  }

  ///////////////////////////////////////////////////////////
  // 12. PDU CLAIM LINE  — "and in recognition thereof is awarded X hours PMI"
  ///////////////////////////////////////////////////////////
  const pduLineY = height * 0.74;
  const pduValue = asText(pduText) || asText(contactHoursText);
  if (pduValue) {
    const pduDisplay = `and in recognition thereof is awarded ${pduValue}`;
  ctx.fillStyle = "#555555";
  ctx.font = `${Math.round(width * 0.014)}px Georgia`;
  ctx.textAlign = "center";
  ctx.fillText(pduDisplay, cx, pduLineY);
  }

  ///////////////////////////////////////////////////////////
  // 13. PMI ATP BADGE  — left side, vertically centered in lower half
  ///////////////////////////////////////////////////////////
  const badgeR = width * 0.075;
  const badgeCX = width * 0.135;
  const badgeCY = height * 0.72;

  // Draw the circular badge (or load image if provided)
  const badgeLogoUrl = getFileUrl(data.badgeLogo);
  let badgeImageLoaded = false;
  if (badgeLogoUrl && !isTinyPlaceholderAsset(badgeLogoUrl)) {
    try {
      const img = await loadImage(resolveAssetPath(badgeLogoUrl)!);
      const bSize = badgeR * 2;
      // drawImageContain(ctx, img, badgeCX - badgeR, badgeCY - badgeR, bSize, bSize);
      drawImageContain(
        ctx,
        img,
        badgeCX - badgeR,
        badgeCY - badgeR + 145,
        logoW,
        logoH,
      );
      // drawImageContain(ctx, img, logoSlotX, logoSlotY, logoW, logoH);

      badgeImageLoaded = true;
    } catch {
      // fall through to drawn badge
    }
  }
  // if (!badgeImageLoaded) {
  //   drawPMIBadge(ctx, badgeCX, badgeCY, badgeR);
  // }

  // Badge number below the badge
  ctx.fillStyle = "#333333";
  ctx.font = `bold ${Math.round(width * 0.017)}px Arial`;
  ctx.textAlign = "center";
  if (badgeNumber) {
    // ctx.fillText(badgeNumber, badgeCX, badgeCY + badgeR + height * 0.036);
    ctx.fillText(badgeNumber, badgeCX, badgeCY + badgeR + 76 + height * 0.036);
  }

  ///////////////////////////////////////////////////////////
  // 14. SIGNATURE SECTION  — right side
  ///////////////////////////////////////////////////////////
  const sigAreaX = width * 0.68;
  const sigAreaW = width * 0.27;
  const sigLineY2 = height * 0.82;
  const signatureX = sigAreaX - 55;
  // Trainer signature image
  const sigUrl = getFileUrl(data.trainerSignature);
  let sigLoaded = false;
  if (sigUrl && !isTinyPlaceholderAsset(sigUrl)) {
    try {
      const img = await loadImage(resolveAssetPath(sigUrl)!);

      drawImageContain(
        ctx,
        img,
        signatureX,
        height * 0.76,
        sigAreaW,
        height * 0.09,
      );
      sigLoaded = true;
    } catch {
      // fall through
    }
  }
  if (!sigLoaded) {
    // Draw a cursive-style placeholder signature
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `italic ${Math.round(width * 0.026)}px "Times New Roman"`;
    ctx.textAlign = "left";
    ctx.fillText(trainerName, sigAreaX, sigLineY2 - height * 0.02);
  }

  // Signature underline
  const signatureLineWidth = sigAreaW * 0.8;
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sigAreaX, sigLineY2 + 12);
  ctx.lineTo(sigAreaX + signatureLineWidth, sigLineY2 + 12);
  ctx.stroke();

  // Trainer name bold below line
  const sigNameY = sigLineY2 + height * 0.038;
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `bold ${Math.round(width * 0.019)}px Arial`;
  ctx.textAlign = "left";
  ctx.fillText(trainerName, sigAreaX, sigNameY + 16);

  // Trainer title
  ctx.fillStyle = "#555555";
  ctx.font = `${Math.round(width * 0.015)}px Arial`;
  ctx.fillText(trainerTitle, sigAreaX, sigNameY + height * 0.039 + 16);

  // Company name
  ctx.fillText(trainerCompany, sigAreaX, sigNameY + height * 0.075 + 16);

  ///////////////////////////////////////////////////////////
  // 15. PMI LOGO  — between badge and signature
  ///////////////////////////////////////////////////////////
  return canvas;
};
