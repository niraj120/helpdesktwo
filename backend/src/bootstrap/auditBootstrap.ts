import mongoose from "mongoose";
import { auditPlugin } from "../plugins/auditPlugin";

/**
 * Registers the audit plugin GLOBALLY, so every schema compiled afterwards is
 * audited with no per-model wiring. This file MUST be imported before any model
 * module executes (mongoose.plugin only affects schemas created after the call)
 * — hence it is the first import in server.ts, ahead of the model imports.
 *
 * The plugin attaches to every schema including the log models, but its hooks
 * early-return for denied model names (all *Log collections), and the writer
 * inserts via the raw driver collection — so there is no recursion.
 */
mongoose.plugin(auditPlugin);
