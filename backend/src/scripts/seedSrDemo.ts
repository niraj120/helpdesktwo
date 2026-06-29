/**
 * SR demo-data seeder.
 *
 * Seeds a target project (default: VIBGYOR schools) with:
 *  - 4 hierarchy roots + sub-categories (PSR/ISR enabled)
 *  - 4 guardian + 7 child users (searchable in the New-Request "Existing Parent"
 *    flow via the internal-directory fallback — guardians carry uniqueId
 *    "GUARDIAN", children share parentMobile)
 *  - 7 demo PSRs covering varied priority / source / status, several with
 *    linked ISRs so the Linked-ISR column shows real progress
 *
 * Idempotent: wipes its own prior output (ticketNumber ^PSR|ISR-DEMO2-, users
 * @vibgyordemo.test, categories code 9101-9199) before re-inserting.
 *
 * Run:  cd backend && npm run seed:sr-demo
 *       npm run seed:sr-demo -- VIBGYORSCH         (project code or name regex)
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../config/database";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { Role } from "../models/Role";
import { Category } from "../models/Category";
import { Ticket } from "../models/Ticket";

const DEMO_EMAIL_DOMAIN = "@vibgyordemo.test";
const CODE_LO = 9101;
const CODE_HI = 9199;
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);

async function run() {
  const arg = process.argv[2] || "VIBGYORSCH";
  await connectDB();

  const project = await Project.findOne({
    $or: [{ code: arg }, { name: new RegExp(arg, "i") }],
  }).lean();
  if (!project) {
    console.error(`❌ Project not found for "${arg}".`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const projectId = project._id as mongoose.Types.ObjectId;
  console.log(`📦 Project: ${(project as any).name} (${projectId})`);

  // A role to attach to demo users + an agent for assignment/createdBy.
  const role =
    (await Role.findOne({ code: "STUDENT" }).lean()) ||
    (await Role.findOne({ code: "USER" }).lean()) ||
    (await Role.findOne({}).lean());
  if (!role) throw new Error("No Role found to attach demo users.");
  const notDemo = { email: { $not: new RegExp(`${DEMO_EMAIL_DOMAIN}$`) } };
  const agent =
    (await User.findOne({ projects: projectId, ...notDemo })
      .select("_id fullName")
      .lean()) ||
    (await User.findOne({ ...notDemo, isActive: true })
      .select("_id fullName")
      .lean()) ||
    null;
  const agentId = agent?._id as mongoose.Types.ObjectId | undefined;
  console.log(`👤 Agent (createdBy/assignedTo): ${agent?.fullName || "none"}`);

  // ── clean prior demo output ────────────────────────────────────────────────
  await Ticket.deleteMany({ ticketNumber: /^(PSR|ISR)-DEMO2-/ });
  await User.deleteMany({ email: new RegExp(`${DEMO_EMAIL_DOMAIN}$`) });
  await Category.deleteMany({ projectId, code: { $gte: CODE_LO, $lte: CODE_HI } });
  console.log("🧹 Cleared prior demo data.");

  // ── categories (root → sub) ────────────────────────────────────────────────
  const TREE: Array<{
    name: string;
    code: number;
    priority: string;
    subs: Array<{ name: string; code: number }>;
  }> = [
    {
      name: "Academics",
      code: 9101,
      priority: "MEDIUM",
      subs: [
        { name: "Examination", code: 9111 },
        { name: "Admissions", code: 9112 },
      ],
    },
    {
      name: "Transport",
      code: 9102,
      priority: "HIGH",
      subs: [
        { name: "Bus Route", code: 9121 },
        { name: "Safety", code: 9122 },
      ],
    },
    {
      name: "Fees & Accounts",
      code: 9103,
      priority: "LOW",
      subs: [
        { name: "Fee Payment", code: 9131 },
        { name: "Refund", code: 9132 },
      ],
    },
    {
      name: "Facilities",
      code: 9104,
      priority: "MEDIUM",
      subs: [
        { name: "Hostel", code: 9141 },
        { name: "Cafeteria", code: 9142 },
      ],
    },
  ];

  const subByName: Record<string, any> = {};
  for (const root of TREE) {
    const l1 = await new Category({
      name: root.name,
      code: root.code,
      projectId,
      level: 1,
      isActive: true,
      defaultPriority: root.priority,
      sr: { appliesTo: ["PSR", "ISR"] },
      createdBy: agentId,
    }).save();
    for (const s of root.subs) {
      const l2 = await new Category({
        name: s.name,
        code: s.code,
        projectId,
        level: 2,
        parentId: l1._id,
        isActive: true,
        defaultPriority: root.priority,
        sr: { appliesTo: ["PSR", "ISR"] },
        createdBy: agentId,
      }).save();
      subByName[s.name] = { l1, l2 };
    }
  }
  console.log(`🗂️  Categories: ${TREE.length} roots + sub-categories.`);

  // ── guardians + children ───────────────────────────────────────────────────
  const FAMILIES: Array<{
    parent: string;
    mobile: string;
    school: string;
    children: Array<{ name: string; grade: string }>;
  }> = [
    {
      parent: "Anil Sharma",
      mobile: "9810000001",
      school: "VIBGYOR North",
      children: [
        { name: "Aarav Sharma", grade: "Grade 5" },
        { name: "Diya Sharma", grade: "Grade 3" },
      ],
    },
    {
      parent: "Sunita Verma",
      mobile: "9810000002",
      school: "VIBGYOR East",
      children: [{ name: "Kabir Verma", grade: "Grade 8" }],
    },
    {
      parent: "Rajesh Iyer",
      mobile: "9810000003",
      school: "VIBGYOR South",
      children: [
        { name: "Ananya Iyer", grade: "Grade 6" },
        { name: "Vivaan Iyer", grade: "Grade 4" },
      ],
    },
    {
      parent: "Meena Nair",
      mobile: "9810000004",
      school: "VIBGYOR West",
      children: [{ name: "Ishaan Nair", grade: "Grade 10" }],
    },
  ];

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ".");
  const families: Array<{
    name: string;
    mobile: string;
    email: string;
    school: string;
    children: Array<{ id: string; name: string; grade: string }>;
  }> = [];

  for (const f of FAMILIES) {
    const [pf, pl] = f.parent.split(" ");
    const email = `${slug(f.parent)}${DEMO_EMAIL_DOMAIN}`;
    // Guardian — uniqueId carries the "GUARDIAN" marker (unique per family);
    // department holds the school (read back as parent.school in the fallback).
    await new User({
      email,
      password: "Demo@1234",
      firstName: pf,
      lastName: pl,
      fullName: f.parent,
      mobile: f.mobile,
      parentMobile: f.mobile,
      uniqueId: `GUARDIAN-${f.mobile}`,
      department: f.school,
      role: role._id,
      isActive: true,
      registrationSource: "manual",
      projects: [projectId],
    }).save();
    // Children — uniqueId is a unique enrollment id; grade is stored in
    // department (the directory fallback reads grade from there).
    const kids: Array<{ id: string; name: string; grade: string }> = [];
    for (let idx = 0; idx < f.children.length; idx++) {
      const c = f.children[idx];
      const [cf, cl] = c.name.split(" ");
      const child = await new User({
        email: `${slug(c.name)}${DEMO_EMAIL_DOMAIN}`,
        password: "Demo@1234",
        firstName: cf,
        lastName: cl,
        fullName: c.name,
        mobile: f.mobile,
        parentMobile: f.mobile,
        uniqueId: `VBG-${f.mobile}-${idx + 1}`,
        department: c.grade,
        role: role._id,
        isActive: true,
        registrationSource: "manual",
        projects: [projectId],
      }).save();
      kids.push({ id: String(child._id), name: c.name, grade: c.grade });
    }
    families.push({
      name: f.parent,
      mobile: f.mobile,
      email,
      school: f.school,
      children: kids,
    });
  }
  console.log(`👪 Families: ${families.length} guardians + children.`);

  // ── demo PSRs (+ linked ISRs) ──────────────────────────────────────────────
  const stamp = String(Date.now()).slice(-6);
  let seq = 0;
  const psrNo = () => `PSR-DEMO2-${stamp}-${++seq}`;
  let iseq = 0;
  const isrNo = () => `ISR-DEMO2-${stamp}-${++iseq}`;

  const makePsr = async (o: {
    sub: string;
    fam: number;
    childIdx?: number;
    subject: string;
    desc: string;
    priority: string;
    source: string;
    mode?: string;
    status: number;
    ageDays: number;
    updatedDays: number;
    isrs?: Array<{ subject: string; priority: string; status: number }>;
  }) => {
    const cat = subByName[o.sub];
    const fam = families[o.fam];
    const child = fam.children[o.childIdx ?? 0];
    const t = await Ticket.create({
      ticketNumber: psrNo(),
      subject: o.subject,
      description: o.desc,
      status: o.status,
      priority: o.priority,
      project: projectId,
      createdBy: agentId,
      assignedTo: agentId,
      category: cat.l2._id,
      categoryHierarchy: {
        level1: cat.l1._id,
        level2: cat.l2._id,
        displayPath: cat.l2.path,
      },
      interactionType: "PSR",
      requestType: "SR",
      submissionSource: o.source,
      modeOfContact: o.mode,
      resolvedAt: o.status === 4 || o.status === 5 ? daysAgo(o.updatedDays) : undefined,
      closedAt: o.status === 5 ? daysAgo(o.updatedDays) : undefined,
      metadata: {
        projectId: String(projectId),
        classification: "existing_parent",
        studentName: child?.name,
        parent: {
          name: fam.name,
          mobile: fam.mobile,
          email: fam.email,
          school: fam.school,
          parentCode: fam.mobile,
        },
        children: child ? [child] : [],
      },
    });
    await Ticket.updateOne(
      { _id: t._id },
      { $set: { createdAt: daysAgo(o.ageDays), updatedAt: daysAgo(o.updatedDays) } },
      { timestamps: false },
    );
    for (const isr of o.isrs || []) {
      const it = await Ticket.create({
        ticketNumber: isrNo(),
        subject: isr.subject,
        description: `Linked to ${t.ticketNumber}`,
        status: isr.status,
        priority: isr.priority,
        project: projectId,
        createdBy: agentId,
        assignedTo: agentId,
        category: cat.l2._id,
        categoryHierarchy: {
          level1: cat.l1._id,
          level2: cat.l2._id,
          displayPath: cat.l2.path,
        },
        interactionType: "ISR",
        requestType: "SR",
        linkedPsrId: t._id,
        submissionSource: "online",
        resolvedAt:
          isr.status === 4 || isr.status === 5 ? daysAgo(o.updatedDays) : undefined,
        closedAt: isr.status === 5 ? daysAgo(o.updatedDays) : undefined,
        metadata: { projectId: String(projectId) },
      });
      await Ticket.updateOne(
        { _id: it._id },
        { $set: { createdAt: daysAgo(o.ageDays - 0.5) } },
        { timestamps: false },
      );
    }
    return t;
  };

  await makePsr({
    sub: "Examination",
    fam: 0,
    childIdx: 0,
    subject: "Re-evaluation request for Term-1 maths paper",
    desc: "Parent requests re-evaluation of the Term-1 mathematics answer sheet.",
    priority: "HIGH",
    source: "offline",
    mode: "walk_in",
    status: 1, // Open
    ageDays: 8,
    updatedDays: 1,
    isrs: [
      { subject: "ISR: pull answer sheet from exam cell", priority: "HIGH", status: 4 },
      { subject: "ISR: schedule re-evaluation with HOD", priority: "MEDIUM", status: 1 },
    ],
  });

  await makePsr({
    sub: "Bus Route",
    fam: 1,
    subject: "Bus pickup time too early — request route change",
    desc: "Pickup at 6:10am is too early; requesting a later slot / nearer stop.",
    priority: "MEDIUM",
    source: "ivr",
    mode: "ivr",
    status: 2, // WIP
    ageDays: 12,
    updatedDays: 2,
    isrs: [{ subject: "ISR: transport dept review route timing", priority: "MEDIUM", status: 2 }],
  });

  await makePsr({
    sub: "Fee Payment",
    fam: 2,
    childIdx: 0,
    subject: "Online fee payment failed but amount debited",
    desc: "Term-2 fee debited twice via the portal; one transaction failed.",
    priority: "LOW",
    source: "email",
    mode: "email",
    status: 4, // Resolved
    ageDays: 20,
    updatedDays: 3,
    isrs: [
      { subject: "ISR: accounts verify gateway settlement", priority: "LOW", status: 5 },
      { subject: "ISR: initiate duplicate-debit refund", priority: "MEDIUM", status: 4 },
    ],
  });

  await makePsr({
    sub: "Hostel",
    fam: 3,
    subject: "Hostel room maintenance — broken study lamp & leak",
    desc: "Room B-204 has a broken study lamp and a minor ceiling leak.",
    priority: "CRITICAL",
    source: "online",
    mode: "portal",
    status: 3, // On Hold
    ageDays: 5,
    updatedDays: 1,
  });

  await makePsr({
    sub: "Admissions",
    fam: 0,
    childIdx: 1,
    subject: "Sibling admission enquiry for next academic year",
    desc: "Parent enquiring about sibling admission for the upcoming session.",
    priority: "MEDIUM",
    source: "offline",
    mode: "walk_in",
    status: 5, // Closed
    ageDays: 30,
    updatedDays: 6,
    isrs: [
      { subject: "ISR: admissions to share brochure & dates", priority: "LOW", status: 5 },
      { subject: "ISR: reserve sibling-quota seat", priority: "MEDIUM", status: 4 },
      { subject: "ISR: counsellor follow-up call", priority: "LOW", status: 1 },
    ],
  });

  await makePsr({
    sub: "Refund",
    fam: 0,
    childIdx: 1,
    subject: "Transport fee refund after route discontinued",
    desc: "Route discontinued mid-term; parent requests pro-rata transport refund.",
    priority: "HIGH",
    source: "whatsapp",
    status: 1, // Open
    ageDays: 3,
    updatedDays: 0,
    isrs: [{ subject: "ISR: compute pro-rata refund amount", priority: "HIGH", status: 1 }],
  });

  await makePsr({
    sub: "Safety",
    fam: 2,
    childIdx: 1,
    subject: "Request seatbelt check on school bus",
    desc: "Parent reports a loose seatbelt; requests a safety inspection.",
    priority: "LOW",
    source: "sms",
    status: 6, // Re-open
    ageDays: 15,
    updatedDays: 4,
  });

  const psrCount = await Ticket.countDocuments({ ticketNumber: /^PSR-DEMO2-/ });
  const isrCount = await Ticket.countDocuments({ ticketNumber: /^ISR-DEMO2-/ });
  console.log(`✅ Seeded ${psrCount} PSRs + ${isrCount} linked ISRs.`);

  await mongoose.disconnect();
  console.log("🏁 Done.");
}

run().catch(async (e) => {
  console.error("❌ Seed failed:", e);
  await mongoose.disconnect();
  process.exit(1);
});
