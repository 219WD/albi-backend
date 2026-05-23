import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  preheader: {
    type: String,
    default: '',
    trim: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
  },
  buttons: [{
    label: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
  }],
  createdBy: {
    type: String,
    default: '',
    trim: true,
  },
  updatedBy: {
    type: String,
    default: '',
    trim: true,
  },
}, {
  timestamps: true,
});

emailTemplateSchema.index({ updatedAt: -1 });

export default mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', emailTemplateSchema);
