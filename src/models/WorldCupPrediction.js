import mongoose from 'mongoose';

const worldCupPredictionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorldCupUser',
    required: true,
    index: true,
  },
  matchId: {
    type: String,
    required: true,
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
}, {
  timestamps: true,
});

worldCupPredictionSchema.index({ userId: 1, matchId: 1 }, { unique: true });

export default mongoose.models.WorldCupPrediction || mongoose.model('WorldCupPrediction', worldCupPredictionSchema);
