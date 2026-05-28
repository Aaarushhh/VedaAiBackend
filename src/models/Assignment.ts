import mongoose, { Schema } from 'mongoose';

export interface IQuestionType {
  type: string;
  count: number;
  marks: number;
}

export interface IAssignment {
  title: string;
  dueDate: string;
  questionTypes: IQuestionType[];
  additionalInstructions: string;
  totalQuestions: number;
  totalMarks: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  generatedPaper: any;
  createdAt: Date;
}

const AssignmentSchema = new Schema<IAssignment>({
  title: { type: String, required: true },
  dueDate: { type: String },
  questionTypes: [{
    type: { type: String },
    count: { type: Number },
    marks: { type: Number }
  }],
  additionalInstructions: { type: String },
  totalQuestions: { type: Number },
  totalMarks: { type: Number },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  generatedPaper: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IAssignment>('Assignment', AssignmentSchema);
