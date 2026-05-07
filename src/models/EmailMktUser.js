import mongoose from 'mongoose';

const emailMktUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  rango: {
    type: String,
    enum: ['pendiente', 'emailmkt', 'admin', 'superadmin', 'bloqueado'],
    default: 'pendiente',
    index: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  lastLoginAt: Date,
}, {
  timestamps: true,
});

export default mongoose.models.EmailMktUser || mongoose.model('EmailMktUser', emailMktUserSchema);
