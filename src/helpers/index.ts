import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

export const shuffleArray = <T>(array: T[]): T[] => {
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }

  return arr;
};

const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN!;
const KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID!;
const PRIVATE_KEY = process.env.CLOUDFRONT_PRIVATE_KEY!.replace(/\\n/g, "\n");

/**
 * Generates a signed CloudFront URL.
 *
 * @param objectKey Example: admin/videos/abc.mp4
 * @param expiresInSeconds Default: 5 minutes
 */
export const generateSignedVideoUrl = (
  objectKey: string,
  expiresInSeconds = 300,
) => {
  return getSignedUrl({
    url: `${CLOUDFRONT_DOMAIN}/${objectKey}`,
    keyPairId: KEY_PAIR_ID,
    privateKey: PRIVATE_KEY,
    dateLessThan: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  });
};

export const getS3ObjectKey = (url: string) => {
  return new URL(url).pathname.substring(1);
};

const protectedPaths = ["/admin/videos/", "/admin/applications/"];

export const getFileUrl = (fileLink?: string | null): string => {
  if (!fileLink) return "";

  // Remove extra spaces
  fileLink = fileLink.trim();

  // If it's an external URL (Google, YouTube, etc.), return as-is
  if (
    /^https?:\/\//i.test(fileLink) &&
    !fileLink.includes(".amazonaws.com") &&
    !fileLink.includes("cloudfront.net")
  ) {
    return fileLink;
  }

  let pathname: string;

  // Full S3 URL or CloudFront URL
  if (/^https?:\/\//i.test(fileLink)) {
    pathname = new URL(fileLink).pathname;
  } else {
    // Object key
    pathname = fileLink.startsWith("/") ? fileLink : `/${fileLink}`;
  }

  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  // Public files
  if (!isProtected) {
    return `${CLOUDFRONT_DOMAIN}${pathname}`;
  }
  // Private files
  return generateSignedVideoUrl(pathname.substring(1));
};

export const getFileUrlUser = (fileLink?: string | null): string => {
  if (!fileLink) return "";

  // Remove extra spaces
  fileLink = fileLink.trim();

  // If it's an external URL (Google, YouTube, etc.), return as-is
  if (
    /^https?:\/\//i.test(fileLink) &&
    !fileLink.includes(".amazonaws.com") &&
    !fileLink.includes("cloudfront.net")
  ) {
    return fileLink;
  }

  let pathname: string;

  // Full S3 URL or CloudFront URL
  if (/^https?:\/\//i.test(fileLink)) {
    pathname = new URL(fileLink).pathname;
  } else {
    // Object key
    pathname = fileLink.startsWith("/") ? fileLink : `/${fileLink}`;
  }

  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  // Public files
  if (!isProtected) {
    return `${CLOUDFRONT_DOMAIN}${pathname}`;
  }
  // Private files
  return generateSignedVideoUrl(pathname.substring(1), 1200);
};
