import mongoose from 'mongoose';

const worldCupUserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  lastLoginAt: Date,
}, {
  timestamps: true,
});

export default mongoose.models.WorldCupUser || mongoose.model('WorldCupUser', worldCupUserSchema);
