/**
 * FeedbackScore Model (Sprint 9 — Satisfaction Dashboard)
 *
 * One record per ticket resolution feedback event.
 * Populated when a student/user submits post-ticket feedback.
 * Used by satisfaction widgets: csat_score, nps_score, ces_score,
 * satisfaction_trend, csat_by_agent, feedback_response_rate.
 */

import mongoose, { Document, Schema } from "mongoose";

export interface IFeedbackScore extends Document {
  ticket_id: mongoose.Types.ObjectId;
  project_id: mongoose.Types.ObjectId;
  respondent_user_id: mongoose.Types.ObjectId;
  agent_id?: mongoose.Types.ObjectId;
  csat_rating?: number; // 1–5; null if CSAT survey not presented
  nps_rating?: number; // 0–10; null if NPS survey not presented
  ces_rating?: number; // 1–7; null if CES survey not presented
  comment?: string;
  submitted_at: Date;
  ticket_category?: string; // denormalised for fast grouping
  ticket_priority?: string; // denormalised
}

const FeedbackScoreSchema = new Schema<IFeedbackScore>(
  {
    ticket_id: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
      index: true,
    },
    project_id: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    respondent_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    agent_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    csat_rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    nps_rating: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },
    ces_rating: {
      type: Number,
      min: 1,
      max: 7,
      default: null,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    submitted_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    ticket_category: {
      type: String,
      trim: true,
      default: null,
    },
    ticket_priority: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    collection: "feedback_scores",
    timestamps: true,
  },
);

// Compound indexes for widget queries
FeedbackScoreSchema.index({ project_id: 1, submitted_at: -1 });
FeedbackScoreSchema.index({ agent_id: 1, submitted_at: -1 });
FeedbackScoreSchema.index({ project_id: 1, csat_rating: 1 });
// Prevent duplicate feedback for same ticket from same user
FeedbackScoreSchema.index(
  { ticket_id: 1, respondent_user_id: 1 },
  { unique: true },
);

export const FeedbackScore = mongoose.model<IFeedbackScore>(
  "FeedbackScore",
  FeedbackScoreSchema,
);
