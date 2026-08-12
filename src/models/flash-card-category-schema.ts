import mongoose, { Document, Schema, Types } from "mongoose";

export interface IFlashCardsCategory extends Document {
  courseId: Types.ObjectId;
  categoryName: string;
  price: number;
  status: "ACTIVE" | "DELETED" | "INACTIVE";
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const flashcardCategorySchema = new Schema<IFlashCardsCategory>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
      index: true,
    },
    categoryName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    order: {
      type: Number,
      required: true,
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

flashcardCategorySchema.index(
  { courseId: 1, categoryName: 1 },
  { unique: true },
);

export const FlashCardCategoryModel = mongoose.model<IFlashCardsCategory>(
  "flashcardcategory",
  flashcardCategorySchema,
);
