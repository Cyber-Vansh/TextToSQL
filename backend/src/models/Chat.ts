import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  question: { type: String, required: true },
  sql: { type: String },
  result: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});

export const Chat = mongoose.model('Chat', ChatSchema);
