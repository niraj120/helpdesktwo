/**
 * Dummy data seeder for the Service Request (PSR/ISR) module — TESTING ONLY.
 *
 * Creates: a cluster, departments, a small category tree (with department,
 * proactive help-text, TAT and assignment+CC), enables SR for a project
 * (seeding PSR statuses), and a few sample PSR tickets.
 *
 * Run:  cd backend && npx tsx src/scripts/seedSrDummyData.ts [projectCodeOrName]
 *
 * Idempotent by name — safe to re-run.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/database";
import { Project } from "../models/Project";
import { Cluster } from "../models/Cluster";
import Department from "../models/Department";
import { Category } from "../models/Category";
import CategorySLA from "../models/ticket-module/CategorySLA";
import { CategoryAssignmentConfig } from "../models/ticket-module/CategoryAssignmentConfig";
import { User } from "../models/User";
import { Role } from "../models/Role";
import { updateSrConfigForProject } from "../modules/service-request/srConfigAdmin";
import { createServiceRequest } from "../modules/service-request/createServiceRequest";

dotenv.config();

async function ensureDepartment(projectId: any, name: string) {
  let dep = await Department.findOne({ projectId, name });
  if (!dep) dep = await Department.create({ projectId, name, isActive: true });
  return dep;
}

async function ensureCategory(
  projectId: any,
  opts: {
    name: string;
    code: number;
    level: number;
    parentId?: any;
    department?: any;
    defaultPriority?: string;
    proactiveHelpText?: string;
  },
) {
  let cat = await Category.findOne({ projectId, name: opts.name, level: opts.level });
  if (cat) return cat;
  cat = new Category({
    name: opts.name,
    code: opts.code,
    projectId,
    level: opts.level,
    parentId: opts.parentId || null,
    department: opts.department || null,
    defaultPriority: opts.defaultPriority || "NORMAL",
    sr: opts.proactiveHelpText
      ? { proactiveHelpText: opts.proactiveHelpText }
      : undefined,
    isActive: true,
  });
  await cat.save();
  return cat;
}

async function main() {
  await connectDB();

  const arg = process.argv[2];
  const project = arg
    ? await Project.findOne({
        $or: [{ code: arg }, { name: new RegExp(arg, "i") }],
      })
    : await Project.findOne({ isActive: true });

  if (!project) {
    console.error("❌ No project found. Pass a project code/name as an argument.");
    await mongoose.disconnect();
    return;
  }
  const projectId = project._id;
  console.log(`🏫 Seeding SR dummy data for project: ${project.name} (${project._id})`);

  // A user + role to use for assignment/CC and as the creator.
  const someUser = await User.findOne({ projects: projectId }).select("_id").lean();
  const anyUser = someUser || (await User.findOne().select("_id").lean());
  const someRole = await Role.findOne().select("_id").lean();
  if (!anyUser) {
    console.error("❌ No users in DB — cannot seed assignment/tickets.");
    await mongoose.disconnect();
    return;
  }
  const creatorId = String(anyUser._id);

  // 1) Cluster
  let cluster = await Cluster.findOne({ name: "Demo Cluster" });
  if (!cluster) {
    cluster = await Cluster.create({
      name: "Demo Cluster",
      code: "DEMO",
      projects: [projectId],
      isActive: true,
    });
  } else if (!cluster.projects.some((p) => String(p) === String(projectId))) {
    cluster.projects.push(projectId as any);
    await cluster.save();
  }
  console.log(`  ✓ Cluster: ${cluster.name}`);

  // 2) Departments + category tree
  const academics = await ensureDepartment(projectId, "Academics");
  const transport = await ensureDepartment(projectId, "Transport");

  const tree = [
    {
      l1: { name: "Academics related", code: 90001, dep: academics._id },
      subs: [
        {
          name: "Exemption from exam",
          code: 90002,
          help: "Exemptions are granted per the attendance & medical policy. Attach a medical certificate if applicable.",
        },
        { name: "Curriculum query", code: 90003 },
      ],
    },
    {
      l1: { name: "Transport related", code: 90010, dep: transport._id },
      subs: [
        {
          name: "Bus route change",
          code: 90011,
          help: "Route changes are processed within 7 working days subject to seat availability.",
        },
      ],
    },
  ];

  const createdSubs: any[] = [];
  for (const node of tree) {
    const l1 = await ensureCategory(projectId, {
      name: node.l1.name,
      code: node.l1.code,
      level: 1,
      department: node.l1.dep,
    });
    for (const sub of node.subs) {
      const subCat = await ensureCategory(projectId, {
        name: sub.name,
        code: sub.code,
        level: 2,
        parentId: l1._id,
        department: node.l1.dep,
        proactiveHelpText: (sub as any).help,
      });
      createdSubs.push(subCat);

      // TAT (CategorySLA)
      await CategorySLA.findOneAndUpdate(
        { categoryId: subCat._id },
        {
          $setOnInsert: {
            categoryId: subCat._id,
            projectId,
            responseTime: { value: 4, unit: "hours" },
            resolutionTime: { value: 48, unit: "hours" },
            isActive: true,
          },
        },
        { upsert: true },
      );

      // Assignment + CC
      await CategoryAssignmentConfig.findOneAndUpdate(
        { categoryId: subCat._id, projectId },
        {
          $setOnInsert: {
            categoryId: subCat._id,
            projectId,
            mode: someRole ? "by-role" : "manual",
            rolePool: someRole ? [someRole._id] : [],
            agentPool: [anyUser._id],
            ccUsers: [anyUser._id],
            ccRoles: [],
            isActive: true,
          },
        },
        { upsert: true },
      );
    }
  }
  console.log(`  ✓ Categories/TAT/assignment: ${createdSubs.length} sub-categories`);

  // 3) Enable SR (seeds PSR statuses)
  await updateSrConfigForProject(
    String(projectId),
    { enabled: true, psr: { enabled: true } },
    creatorId,
  );
  console.log("  ✓ SR enabled for project (+ PSR statuses seeded)");

  // 4) Sample PSR tickets
  let created = 0;
  for (const sub of createdSubs) {
    try {
      const r = await createServiceRequest({
        projectId: String(projectId),
        interactionType: "PSR",
        requestType: "SR",
        channel: "walk_in",
        modeOfContact: "walk_in",
        categoryId: String(sub._id),
        subject: `Test PSR — ${sub.name}`,
        description: "Dummy seed service request for testing.",
        createdBy: creatorId,
        studentUserId: creatorId,
        skipDuplicateCheck: true,
      });
      created++;
      console.log(`    • ${r.ticketNumber} (${sub.name})`);
    } catch (e: any) {
      console.error(`    ! failed for ${sub.name}: ${e?.message}`);
    }
  }
  console.log(`  ✓ Sample PSRs created: ${created}`);

  await mongoose.disconnect();
  console.log("✅ Done.");
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
