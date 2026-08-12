import mongoose, { Document, Schema, Types } from "mongoose";

export interface INavigation extends Document {
  name: string;
  key: string;
  createdAt: Date;
  updatedAt: Date;
}

const navigationSchema = new Schema<INavigation>(
  {
    name: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export const NavigationModel = mongoose.model<INavigation>(
  "navigation",
  navigationSchema,
);
