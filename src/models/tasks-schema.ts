import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITasks extends Document {
  domainId: Types.ObjectId;
  order: number;
  taskLabel: string;
  taskName: string;
  taskDetails: string;
  flowDiagram: string;
  examples: string;
  keywords: string;
  status: "ACTIVE" | "DELETED" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITasks>(
  {
    domainId: {
      type: Schema.Types.ObjectId,
      ref: "domain",
      index: true,
    },
    taskLabel: {
      type: String,
      default: "",
    },
    taskName: {
      type: String,
      default: "",
    },
    taskDetails: {
      type: String,
      default: "",
    },
    flowDiagram: {
      type: String,
      default: "",
    },
    examples: {
      type: String,
      default: "",
    },
    keywords: {
      type: String,
      default: "",
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
  { timestamps: true }
);


export const TaskModel = mongoose.model<ITasks>("task", taskSchema);
