/**
 * Service Request (PSR/ISR) — per-project form schemas. Phase 3.
 * Stored under Project.configuration.sr.formSchemas (Mixed), keyed by
 * interactionType + channel. Reuses the existing online-form field shape.
 */
import { Project } from "../../models/Project";

export interface SrFormSchema {
  id: string;
  name: string;
  interactionType: "PSR" | "ISR";
  channel: string; // "online" | "walk_in" | "email" | "ivr"
  isActive: boolean;
  version: number;
  fields: any[]; // same shape as configuration.ticketSubmissionSettings.onlineFormFields
  [k: string]: any;
}

export async function listFormSchemas(
  projectId: string,
): Promise<SrFormSchema[]> {
  const p = await Project.findById(projectId).select("configuration.sr").lean();
  return ((p as any)?.configuration?.sr?.formSchemas as SrFormSchema[]) || [];
}

export async function resolveFormSchema(
  projectId: string,
  interactionType: string,
  channel: string,
): Promise<SrFormSchema | null> {
  const all = await listFormSchemas(projectId);
  return (
    all.find(
      (s) =>
        s.isActive !== false &&
        s.interactionType === interactionType &&
        s.channel === channel,
    ) || null
  );
}

export async function upsertFormSchema(
  projectId: string,
  schema: Partial<SrFormSchema>,
): Promise<SrFormSchema> {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found");
  const cfg: any = project.configuration || (project.configuration = {} as any);
  const sr: any = cfg.sr || (cfg.sr = {});
  const list: SrFormSchema[] = sr.formSchemas || (sr.formSchemas = []);

  const idx = schema.id ? list.findIndex((s) => s.id === schema.id) : -1;
  let saved: SrFormSchema;
  if (idx >= 0) {
    saved = {
      ...list[idx],
      ...schema,
      version: (list[idx].version || 1) + 1,
    } as SrFormSchema;
    list[idx] = saved;
  } else {
    saved = {
      ...(schema as SrFormSchema),
      id:
        schema.id ||
        `${schema.interactionType}-${schema.channel}-${Date.now()}`.toLowerCase(),
      version: 1,
      isActive: schema.isActive ?? true,
      fields: schema.fields || [],
    };
    list.push(saved);
  }
  project.markModified("configuration.sr");
  await project.save();
  return saved;
}

export async function deleteFormSchema(
  projectId: string,
  schemaId: string,
): Promise<void> {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found");
  const sr: any = (project.configuration as any)?.sr;
  if (sr?.formSchemas) {
    sr.formSchemas = sr.formSchemas.filter((s: any) => s.id !== schemaId);
    project.markModified("configuration.sr");
    await project.save();
  }
}
