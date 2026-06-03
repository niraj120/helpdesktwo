import mongoose, { Schema, Document } from "mongoose";

export interface ITicketDraft extends Document {
  ticketId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  /** "reply" = standard portal reply; "email" = outgoing email reply */
  type: "reply" | "email";
  content: string;
  savedAt: Date;
}

const TicketDraftSchema = new Schema<ITicketDraft>(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["reply", "email"],
      required: true,
      default: "reply",
    },
    content: { type: String, default: "" },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// One draft per user per ticket per type
TicketDraftSchema.index({ ticketId: 1, userId: 1, type: 1 }, { unique: true });

export default mongoose.model<ITicketDraft>("TicketDraft", TicketDraftSchema);
