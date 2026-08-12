import mongoose, { Document, Schema, Types } from "mongoose";

export interface IRefreshToken extends Document {
  adminId: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  ip?: string;
  userType?: string;
  expiresAt: Date;
  revoked: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "admin",
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "user",
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    ip: {
      type: String,
    },
    userType: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Auto-delete expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = mongoose.model<IRefreshToken>(
  "refreshToken",
  refreshTokenSchema
);
