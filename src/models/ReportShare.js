import mongoose from 'mongoose';

const reportShareSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  periodLabel: {
    type: String,
    default: '',
    trim: true,
  },
  range: {
    type: String,
    default: 'custom',
    enum: ['7d', '30d', '90d', 'custom'],
  },
  from: String,
  to: String,
  filters: {
    producto: { type: String, default: '' },
    tipo: { type: String, default: '' },
    ubicacion: { type: String, default: '' },
    sistema: { type: String, default: '' },
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  expiresAt: Date,
  createdBy: String,
  updatedBy: String,
}, {
  timestamps: true,
});

reportShareSchema.index({ active: 1, createdAt: -1 });

export default mongoose.models.ReportShare || mongoose.model('ReportShare', reportShareSchema);
