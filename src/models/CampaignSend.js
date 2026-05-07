import mongoose from 'mongoose';

const campaignSendSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  subject: String,
  status: {
    type: String,
    enum: ['sent', 'failed'],
    default: 'sent',
  },
  error: String,
  sentAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

campaignSendSchema.index({ campaignId: 1, email: 1 }, { unique: true });

export default mongoose.models.CampaignSend || mongoose.model('CampaignSend', campaignSendSchema);
