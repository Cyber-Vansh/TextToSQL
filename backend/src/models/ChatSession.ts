import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ['user', 'ai'] },
  content: { type: String, required: true },
  sql: { type: String },
  result: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});

const ChatSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String },
  isFavorite: { type: Boolean, default: false },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ChatSessionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const ChatSession = mongoose.model('ChatSession', ChatSessionSchema);
