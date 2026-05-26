import mongoose from 'mongoose';

const promoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  subtitle: {
    type: String,
    default: '',
    trim: true,
  },
  badge: {
    type: String,
    default: 'BENEFICIO EXCLUSIVO',
    trim: true,
  },
  discountValue: {
    type: String,
    default: '10%',
    trim: true,
  },
  discountLabel: {
    type: String,
    default: 'OFF',
    trim: true,
  },
  offerText: {
    type: String,
    default: '',
    trim: true,
  },
  features: {
    type: [String],
    default: [],
  },
  ctaText: {
    type: String,
    default: 'QUIERO MI BENEFICIO AHORA',
    trim: true,
  },
  successTitle: {
    type: String,
    default: 'Listo. Tu beneficio ya esta activo',
    trim: true,
  },
  successText: {
    type: String,
    default: 'Guarda este codigo y usalo al coordinar la instalacion.',
    trim: true,
  },
  whatsappText: {
    type: String,
    default: '',
    trim: true,
  },
  startAt: Date,
  endAt: Date,
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  metrics: {
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    clicks: {
      type: Number,
      default: 0,
      min: 0,
    },
    subscribes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  createdBy: String,
  updatedBy: String,
}, {
  timestamps: true,
});

promoSchema.index({ active: 1, startAt: -1, createdAt: -1 });

export default mongoose.models.Promo || mongoose.model('Promo', promoSchema);
