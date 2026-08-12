import mongoose, { Document, Schema } from "mongoose";

export interface ICourseIntro extends Document {
  courseId: mongoose.Types.ObjectId;
  description: string;

  section_1: {
    title: string;
    pointers: { value: string }[];
  };

  section_2: {
    title: string;
    pointers: { value: string }[];
  };

  accordion_1: {
    title: string;
    pointers: { title: string; description: string }[];
  };

  accordion_2: {
    title: string;
    pointers: { title: string; description: string }[];
  };

  uploadFiles: {
    title: string;
    files: {
      nameOfFile: string;
      type: string;
      url: string;
    }[];
  };

  status: "ACTIVE" | "DELETED" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

const emptySection = {
  title: "",
  pointers: [],
};

const emptyAccordion = {
  title: "",
  pointers: [],
};

const emptyUploadFiles = {
  title: "",
  files: [],
};

const courseIntroSchema = new Schema<ICourseIntro>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "course",
      required: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    section_1: {
      type: Object,
      default: emptySection,
    },

    section_2: {
      type: Object,
      default: emptySection,
    },

    accordion_1: {
      type: Object,
      default: emptyAccordion,
    },

    accordion_2: {
      type: Object,
      default: emptyAccordion,
    },

    uploadFiles: {
      type: Object,
      default: emptyUploadFiles,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const CourseIntroModel = mongoose.model<ICourseIntro>(
  "courseIntro",
  courseIntroSchema
);
