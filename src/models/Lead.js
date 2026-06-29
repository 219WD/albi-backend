import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
  nombre: {
    type: String,
    default: '',
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
  telefono: {
    type: String,
    default: '',
    trim: true,
  },
  codigo: {
    type: String,
    default: '',
    trim: true,
  },
  abVariant: {
    type: String,
    default: '',
    trim: true,
  },
  source: {
    type: String,
    default: 'website',
    trim: true,
  },
  promoId: {
    type: String,
    default: '',
    trim: true,
  },
  tipo: {
    type: String,
    default: '',
    trim: true,
  },
  ubicacion: {
    type: String,
    default: '',
    trim: true,
  },
  sistema: {
    type: String,
    default: '',
    trim: true,
  },
  producto: {
    type: String,
    default: '',
    trim: true,
  },
  bienvenidaEnviada: {
    type: Boolean,
    default: false,
  },
  unsubscribed: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

leadSchema.index({ unsubscribed: 1, email: 1 });

export default mongoose.models.Lead || mongoose.model('Lead', leadSchema);
