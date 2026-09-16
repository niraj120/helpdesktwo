/**
 * Read-only check of the service request dashboard widgets: runs every SR
 * handler against a project and prints what it returns. Writes nothing.
 *
 *   npx tsx src/scripts/dashboard/srWidgetSelfCheck.ts [projectId]
 */
import "dotenv/config";
import mongoose from "mongoose";
import "../../models/Ticket";
import "../../models/CallIntake";
import "../../models/User";
import "../../models/Status";
import "../../models/Category";
import "../../models/EmailIntake";
import "../../models/Center";
import { getWidgetHandler } from "../../services/widgetQueryEngine";
import { registerSrDashboardHandlers } from "../../services/widgetHandlers/srDashboardHandlers";
import { SR_WIDGET_DEFINITIONS } from "../../utils/srWidgetDefinitions";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  registerSrDashboardHandlers();

  let projectId = process.argv[2];
  if (!projectId) {
    const p: any = await mongoose
      .model("Ticket")
      .findOne({ interactionType: { $in: ["PSR", "ISR"] } })
      .select("metadata.projectId")
      .lean();
    projectId = String(p?.metadata?.projectId || "");
  }
  console.log("project:", projectId || "(none found)");

  const ctx: any = { tenantId: projectId, userId: "self-check", email: "" };
  const params: any = { dateRangeDays: 90, filters: {}, visualisationType: "kpi_tile" };
  const scopedQuery = { "metadata.projectId": projectId };

  for (const def of SR_WIDGET_DEFINITIONS) {
    const handler = getWidgetHandler(def.widgetKey);
    if (!handler) {
      console.log(`✗ ${def.widgetKey}: NO HANDLER REGISTERED`);
      continue;
    }
    try {
      const data: any = await handler.execute(ctx, params, {}, scopedQuery);
      const brief =
        data.value !== undefined
          ? `value=${data.value}${data.unit || ""}${data.subtitle ? ` (${data.subtitle})` : ""}`
          : data.segments
            ? `${data.segments.length} segment(s), total ${data.total}`
            : data.series
              ? `${data.series.length} point(s)`
              : JSON.stringify(data).slice(0, 80);
      console.log(`✓ ${def.widgetKey}: ${brief}`);
    } catch (e: any) {
      console.log(`✗ ${def.widgetKey}: ${e.message}`);
    }
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
