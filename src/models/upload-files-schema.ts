import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUploadFiles extends Document {
  courseId?: Types.ObjectId;
  url: string;
  fileCategory?: string;
  fileName?: string;
  inUse?:number;
  createdAt?: Date;
  updatedAt?: Date;
}

const uploadFilesSchema = new Schema<IUploadFiles>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
      index: true,
    },
    url: {
      type: String,
      unique: true,
      required: true,
    },
    fileCategory: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    inUse:{
      type:Number,
      default:0
    }
  },
  { timestamps: true }
);

export const UploadedFilesModel = mongoose.model<IUploadFiles>(
  "uploadedFiles",
  uploadFilesSchema
);
