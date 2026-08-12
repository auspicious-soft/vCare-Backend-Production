import mongoose, { Document, Schema, Types } from "mongoose";

export interface IDomain extends Document {
  courseId: Types.ObjectId;
  domain: string | Types.ObjectId;
  order: number;
  price: number;
  status: "ACTIVE" | "DELETED" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

const domainSchema = new Schema<IDomain>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
      index: true,
    },
    domain: {
      type: String,
      required: true,
      index: true,
    },
    order: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true },
);

export const DomainModel = mongoose.model<IDomain>("domain", domainSchema);
