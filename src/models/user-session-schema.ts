import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUserSession extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  userType: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSessionSchema = new Schema<IUserSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    userType: {
      type: String,
      default: "USER",
    },
    // Access-token session records are retained only for the lifetime of the
    // corresponding JWT. This lets tabs finish requests made before a refresh.
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

userSessionSchema.index({ userId: 1, tokenHash: 1 }, { unique: true });
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserSessionModel = mongoose.model<IUserSession>(
  "userSession",
  userSessionSchema,
);
