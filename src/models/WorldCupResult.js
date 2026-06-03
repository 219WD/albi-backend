import mongoose from 'mongoose';

const worldCupResultSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  homeScore: {
    type: Number,
    required: true,
    min: 0,
    max: 20,
  },
  awayScore: {
    type: Number,
    required: true,
    min: 0,
    max: 20,
  },
  updatedBy: String,
}, {
  timestamps: true,
});

export default mongoose.models.WorldCupResult || mongoose.model('WorldCupResult', worldCupResultSchema);
