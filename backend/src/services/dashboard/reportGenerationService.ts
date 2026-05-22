/**
 * Report Generation Service
 *
 * Generates report content for scheduled dashboard reports.
 * Supports formats: html (sent as attachment), csv, email_inline.
 *
 * Note: For production PDF generation, install html-pdf-node and
 * replace the html format handler with a Puppeteer-based renderer.
 */

import mongoose from "mongoose";
import { DashboardTemplate } from "../../models/dashboard/DashboardTemplate";
import { DashboardWidget } from "../../models/dashboard/DashboardWidget";
import {
  executeWidgetQuery,
  WidgetQueryContext,
  WidgetQueryParams,
} from "../widgetQueryEngine";
import { IDashScheduledReport } from "../../models/dashboard/DashScheduledReport";

interface GeneratedReport {
  content: Buffer;
  mimeType: string;
  filename: string;
  inlineHtml?: string;
}

interface WidgetReportData {
  widgetKey: string;
  title: string;
  data: any;
  error?: string;
}

async function fetchWidgetData(
  report: IDashScheduledReport,
  tenantId: string,
): Promise<WidgetReportData[]> {
  const template = await DashboardTemplate.findById(
    report.dashboard_template_id,
  ).lean();
  if (!template) {
    throw new Error(
      `Dashboard template ${report.dashboard_template_id} not found`,
    );
  }

  // Build the query for widgets
  const widgetQuery: Record<string, any> = {
    dashboardTemplateId: report.dashboard_template_id,
  };
  if (report.include_widgets && report.include_widgets.length > 0) {
    widgetQuery._id = { $in: report.include_widgets };
  }

  const widgets = await DashboardWidget.find(widgetQuery)
    .sort({ displayOrder: 1 })
    .lean();

  const ctx: WidgetQueryContext = {
    tenantId,
    userId: "system",
    email: "system@report",
    roleCode: "SUPER_ADMIN",
    primaryProjectId: tenantId,
    projectIds: [tenantId],
  };

  const params: WidgetQueryParams = {
    dateRangeDays: report.date_range_days ?? 7,
    filters: {},
    visualisationType: "kpi_tile",
  };

  // Fetch all widgets in parallel
  const results = await Promise.allSettled(
    widgets.map(async (widget): Promise<WidgetReportData> => {
      try {
        const result = await executeWidgetQuery(widget.widgetKey, ctx, {
          ...params,
          visualisationType: (widget as any).visualisationType ?? "kpi_tile",
        });
        return {
          widgetKey: widget.widgetKey,
          title: (widget as any).title ?? widget.widgetKey,
          data: result.data,
        };
      } catch (err: any) {
        return {
          widgetKey: widget.widgetKey,
          title: (widget as any).title ?? widget.widgetKey,
          data: null,
          error: err.message,
        };
      }
    }),
  );

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          widgetKey: "unknown",
          title: "Error",
          data: null,
          error: (r as any).reason?.message,
        },
  );
}

function renderValue(data: any): string {
  if (data === null || data === undefined) return "—";
  if (typeof data === "number") return data.toLocaleString("en-IN");
  if (typeof data === "string") return data;
  if (Array.isArray(data)) {
    if (data.length === 0) return "No data";
    // Table data
    const keys = Object.keys(data[0] ?? {});
    const header = `<tr>${keys.map((k) => `<th style="padding:6px 12px;text-align:left;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;">${k}</th>`).join("")}</tr>`;
    const rows = data
      .slice(0, 20)
      .map(
        (row) =>
          `<tr>${keys.map((k) => `<td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${row[k] ?? "—"}</td>`).join("")}</tr>`,
      )
      .join("");
    return `<table style="width:100%;border-collapse:collapse;font-size:13px;">${header}${rows}</table>`;
  }
  if (typeof data === "object") {
    if ("value" in data) return String(data.value);
    return `<pre style="font-size:12px;white-space:pre-wrap;">${JSON.stringify(data, null, 2)}</pre>`;
  }
  return String(data);
}

function buildHtml(
  dashboardName: string,
  reportName: string,
  widgets: WidgetReportData[],
  dateRangeDays: number,
  generatedAt: Date,
): string {
  const periodEnd = new Date(generatedAt);
  const periodStart = new Date(generatedAt);
  periodStart.setDate(periodStart.getDate() - dateRangeDays);

  const periodStr = `${periodStart.toLocaleDateString("en-IN")} – ${periodEnd.toLocaleDateString("en-IN")}`;

  const widgetSections = widgets
    .map((w) => {
      const content = w.error
        ? `<p style="color:#ef4444;font-size:13px;">Error loading widget: ${w.error}</p>`
        : renderValue(w.data);

      return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1f2937;text-transform:uppercase;letter-spacing:0.05em;">${w.title}</h3>
        <div style="font-size:28px;font-weight:700;color:#111827;">${content}</div>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${reportName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; margin: 0; padding: 0; }
    .container { max-width: 800px; margin: 0 auto; padding: 32px 16px; }
    .header { background: #1e40af; color: #fff; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
    .header h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
    .header p { margin: 0; font-size: 14px; opacity: 0.85; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    .footer { color: #9ca3af; font-size: 12px; text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${dashboardName}</h1>
      <p>${reportName}</p>
    </div>
    <div class="meta">
      Report period: <strong>${periodStr}</strong> &nbsp;·&nbsp;
      Generated: <strong>${generatedAt.toLocaleString("en-IN")}</strong>
    </div>
    ${widgetSections}
    <div class="footer">This report was generated automatically by SAC Helpdesk Dashboard Engine.</div>
  </div>
</body>
</html>`;
}

function buildCsv(widgets: WidgetReportData[], dashboardName: string): string {
  const lines: string[] = [`Dashboard Report: ${dashboardName}`, ""];

  for (const w of widgets) {
    lines.push(`Widget: ${w.title} (${w.widgetKey})`);
    if (w.error) {
      lines.push(`Error: ${w.error}`);
    } else if (w.data === null || w.data === undefined) {
      lines.push("No data");
    } else if (Array.isArray(w.data)) {
      if (w.data.length > 0) {
        const keys = Object.keys(w.data[0]);
        lines.push(keys.map((k) => `"${k}"`).join(","));
        for (const row of w.data) {
          lines.push(
            keys
              .map((k) => `"${String(row[k] ?? "").replace(/"/g, '""')}"`)
              .join(","),
          );
        }
      } else {
        lines.push("No rows");
      }
    } else if (typeof w.data === "object" && "value" in w.data) {
      lines.push(`Value,${w.data.value}`);
    } else {
      lines.push(`Value,"${JSON.stringify(w.data).replace(/"/g, '""')}"`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function generateReport(
  report: IDashScheduledReport,
  tenantId: string,
): Promise<GeneratedReport> {
  const template = await DashboardTemplate.findById(
    report.dashboard_template_id,
  ).lean();
  const dashboardName = (template as any)?.name ?? "Dashboard";

  const widgets = await fetchWidgetData(report, tenantId);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  if (report.format === "csv") {
    const csvContent = buildCsv(widgets, dashboardName);
    return {
      content: Buffer.from(csvContent, "utf8"),
      mimeType: "text/csv",
      filename: `${dashboardName.replace(/\s+/g, "_")}_${dateStr}.csv`,
    };
  }

  // html / pdf / email_inline all build from the same HTML
  const html = buildHtml(
    dashboardName,
    report.name,
    widgets,
    report.date_range_days,
    now,
  );

  if (report.format === "email_inline") {
    return {
      content: Buffer.from(html, "utf8"),
      mimeType: "text/html",
      filename: `${dashboardName.replace(/\s+/g, "_")}_${dateStr}.html`,
      inlineHtml: html,
    };
  }

  // pdf format — generates HTML attachment
  // To generate actual PDFs, install html-pdf-node and replace this block.
  return {
    content: Buffer.from(html, "utf8"),
    mimeType: "text/html",
    filename: `${dashboardName.replace(/\s+/g, "_")}_${dateStr}.html`,
  };
}
