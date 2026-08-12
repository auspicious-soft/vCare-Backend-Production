import mongoose, { Document, Schema, Types } from "mongoose";

export interface IFlashCards extends Document {
  categoryId: Types.ObjectId;
  price: number;
  order: number;
  frontText: string;
  frontImage: string;
  backText: string;
  backImage: string;
  status: "ACTIVE" | "DELETED" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

const flashcardSchema = new Schema<IFlashCards>(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "flashcardcategory",
      index: true,
    },
    price: {
      type: Number,
      default: 0,
    },
    frontText: {
      type: String,
    },
    frontImage: {
      type: String,
    },
    backImage: {
      type: String,
    },
    backText: {
      type: String,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    order: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

export const FlashCardModel = mongoose.model<IFlashCards>(
  "flashcard",
  flashcardSchema,
);
