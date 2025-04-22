import mongoose, { Document, Schema } from 'mongoose';

export interface IFile extends Document {
  name: string;
  fileUrl: string;
  access: string[];
  creator: string;
  createdAt: Date;
  scheduledDeleteDate: Date | null;
  type: 'docs' | 'sheets' | 'media' | 'other';
  previewImage: string | null;
}

const FileSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  access: {
    type: [String],
    default: []
  },
  creator: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  scheduledDeleteDate: {
    type: Date,
    default: null
  },
  type: {
    type: String,
    enum: ['docs', 'sheets', 'media', 'other'],
    default: 'other'
  },
  previewImage: {
    type: String,
    default: null
  }
});

export default mongoose.model<IFile>('File', FileSchema);