// s3Service.ts
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { config } from "dotenv";
import { Readable } from "stream";
config();

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_BUCKET_NAME,
} = process.env;

if (
  !AWS_BUCKET_NAME ||
  !AWS_REGION ||
  !AWS_ACCESS_KEY_ID ||
  !AWS_SECRET_ACCESS_KEY
) {
  throw new Error("Missing required AWS environment variables");
}

export const createS3Client = () => {
  return new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID as string,
      secretAccessKey: AWS_SECRET_ACCESS_KEY as string,
    },
  });
};

/**
 * Uploads a file (buffer or stream) to S3 using multipart under the hood for large files.
 */
export const uploadFileToS3 = async (
  fileInput: Buffer | NodeJS.ReadableStream,
  originalName: string,
  mimetype: string,
  userId: string,
  fileCategory: string,
  isAdmin = false
) => {
  const ext = path.extname(originalName) || mimeToExt(mimetype);
  const fileName = `${uuidv4()}${ext}`;
  const folder = isAdmin
    ? `admin/${fileCategory}s`
    : `users/${userId}/${fileCategory}s`;
  const key = `${folder}/${fileName}`;

  // Normalize input to a stream if buffer
  let bodyStream: NodeJS.ReadableStream;
  if (Buffer.isBuffer(fileInput)) {
    bodyStream = Readable.from(fileInput);
  } else {
    bodyStream = fileInput;
  }

  const params: PutObjectCommandInput = {
    Bucket: AWS_BUCKET_NAME,
    Key: key,
    Body: bodyStream as any,
    ContentType: mimetype,
  };

  // Use the high-level Upload helper which does multipart uploads properly
  const upload = new Upload({
    client: createS3Client(),
    params,
    queueSize: 4, // concurrency; tweak if needed
    partSize: 5 * 1024 * 1024, // 5MB minimum part size
    leavePartsOnError: false, // cleanup on failure
  });

  // Optional: you can listen to progress like:
  upload.on("httpUploadProgress", (progress) => {
    console.log("Upload progress:", progress);
  });

  await upload.done();

  return { key };
};

export const deleteFileFromS3 = async (imageKey: string) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: imageKey,
  };
  try {
    const s3Client = await createS3Client();
    const command = new DeleteObjectCommand(params);
    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    console.error("Error deleting file from S3:", error);
    throw error;
  }
};

const mimeToExt = (mime: string) => {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
  };
  return map[mime] || ".bin";
};
