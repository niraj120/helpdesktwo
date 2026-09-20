/**
 * A caller's or sender's family — the parent(s) registered on a mobile number
 * or email address and the children mapped to each — for the IVR call and
 * email drawers and the PSR prefill.
 *
 * A mobile or email is a lookup key, not an identity: mother and father may share it,
 * and each parent may have several children. So the result is every parent
 * on the number, each with their own children; the agent picks, nothing is
 * auto-chosen here.
 */
import mongoose from "mongoose";
import { getSrConfigForProject } from "./srConfigAdmin";
import { fetchStudentDetails } from "../../services/mdmService";

export interface FamilyChild {
  id?: string;
  name?: string;
  /** MDM flags the parents as separated — see separatedFamiliesRaiserOnly. */
  separatedParents?: boolean;
  enrollmentId?: string;
  school?: string;
  grade?: string;
  division?: string;
}

export interface FamilyParent {
  name?: string;
  mobile?: string;
  email?: string;
  school?: string;
  parentCode?: string;
  children: FamilyChild[];
}

/** First non-empty column whose name contains one of the patterns, in order. */
const findCol = (row: Record<string, any>, ...patterns: string[]) => {
  for (const p of patterns) {
    const key = Object.keys(row).find((k) =>
      k.toLowerCase().includes(p.toLowerCase()),
    );
    const value = key ? String(row[key] ?? "").trim() : "";
    if (value) return value;
  }
  return "";
};

/**
 * Group PSR-builder rows (one row = one guardian→student mapping) into
 * parents with their children, so a parent of three appears once with three
 * children instead of three times with one.
 */
export const groupParentStudentRows = (rows: Record<string, any>[]) => {
  const parentMap = new Map<string, any>();
  for (const row of rows) {
    const name =
      (
        findCol(row, "parent master - first name", "first name", "first_name") +
        " " +
        findCol(row, "parent master - last name", "last name", "last_name")
      ).trim() ||
      findCol(row, "parent master - name", "name") ||
      "—";
    const mobile = findCol(row, "parent master - mobile", "mobile", "phone", "contact");
    const email = findCol(row, "parent master - email", "email");
    const parentCode = findCol(
      row,
      "parent master - id",
      "guardian mapping master - guardian id",
      "guardian id",
      "guardian_id",
      "parent id",
      "parent_id",
    );
    if (name === "—" && !mobile && !email) continue;

    const studentId = findCol(row, "student master - id", "student id", "student_id");
    const studentName = (
      findCol(row, "student master - first name", "student first") +
      " " +
      findCol(row, "student master - last name", "student last")
    ).trim();
    const grade = findCol(row, "grade", "class", "standard");

    const key = parentCode || `${name}|${mobile}`;
    const entry =
      parentMap.get(key) ||
      parentMap
        .set(key, {
          name,
          mobile,
          email,
          school: findCol(row, "school", "centre"),
          parentCode,
          children: [] as any[],
          _raw: row, // full row for flexible display
        })
        .get(key);
    if (
      (studentName || studentId) &&
      !entry.children.some(
        (c: any) =>
          (studentId && c.id === studentId) ||
          (!studentId && c.name === studentName),
      )
    ) {
      entry.children.push({
        id: studentId || undefined,
        name: studentName || undefined,
        grade: grade || undefined,
      });
    }
  }
  return Array.from(parentMap.values());
};

const lastDigits = (mobile: string) => mobile.replace(/\D/g, "").slice(-10);

const escapeRx = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every parent registered on a mobile (last 10 digits) or an email (exact,
 * case-insensitive) in the project's parent lookup, with children enriched
 * from the Student MDM (school, grade, division, enrolment no).
 * `supported: false` when the project's lookup source cannot be searched this
 * way — the caller then falls back to the free-text search.
 */
export async function lookupFamily(
  projectId: string,
  by: { mobile?: string; email?: string },
): Promise<{ supported: boolean; parents: FamilyParent[] }> {
  const digits = lastDigits(by.mobile || "");
  const email = String(by.email || "").trim();
  // The MDM mirror keeps values untrimmed (e.g. "  a@b.com"), so surrounding
  // whitespace must not defeat the match.
  const match =
    digits.length >= 8
      ? { cols: /mobile|phone|contact/i, rx: new RegExp(`${digits}\\s*$`) }
      : email.includes("@")
        ? { cols: /email/i, rx: new RegExp(`^\\s*${escapeRx(email)}\\s*$`, "i") }
        : null;
  if (!match) return { supported: true, parents: [] };

  const cfg: any = await getSrConfigForProject(projectId);
  const lookup = cfg?.psr?.intake?.lookup || {};
  if (lookup.source !== "psr_builder" || !lookup.psrBuilderTableId) {
    return { supported: false, parents: [] };
  }

  const PsrTable = (await import("../../models/psr/PsrTable")).default;
  const table: any = await PsrTable.findById(lookup.psrBuilderTableId).lean();
  if (!table?.targetCollection) return { supported: true, parents: [] };
  const cols: string[] = (table.columns || [])
    .map((c: any) => c.as)
    .filter((as: string) => match.cols.test(as || ""));
  if (!cols.length) return { supported: true, parents: [] };

  const rows = await mongoose.connection
    .collection(table.targetCollection)
    .find(
      { $or: cols.map((col) => ({ [col]: match.rx })) },
      { projection: { _id: 0, _key: 0 } },
    )
    .limit(100)
    .toArray();

  const parents: FamilyParent[] = groupParentStudentRows(rows as any[]).map(
    ({ _raw, ...p }: any) => p,
  );

  const studentIds = parents.flatMap((p) =>
    p.children.map((c) => c.id).filter(Boolean) as string[],
  );
  const details = await fetchStudentDetails(
    studentIds,
    {
      ...(lookup.relationship || {}),
      studentMdmSourceId:
        lookup.studentMdmSourceId || lookup.relationship?.studentMdmSourceId,
    },
    projectId,
  );
  for (const p of parents) {
    p.children = p.children.map((c) => {
      const d = c.id ? details.get(String(c.id)) : undefined;
      return d
        ? {
            ...c,
            name: c.name || d.name,
            separatedParents: d.separatedParents,
            enrollmentId: d.enrollmentId,
            school: d.school,
            grade: d.grade || c.grade,
            division: d.division,
          }
        : c;
    });
  }
  return { supported: true, parents };
}

/** Parents on a caller's mobile — see lookupFamily. */
export const lookupFamilyByMobile = (projectId: string, mobile: string) =>
  lookupFamily(projectId, { mobile });

/**
 * The parent and student(s) behind one service request: what was stored on it
 * at creation, topped up from the parent lookup + Student MDM so school,
 * grade, division and enrolment no. show even on requests raised before those
 * were captured. Children are narrowed to the ones chosen on the request.
 */
export async function familyForTicket(ticket: any): Promise<{
  parent: FamilyParent | null;
  children: FamilyChild[];
}> {
  const meta = ticket?.metadata || {};
  const stored = meta.parent || {};
  const chosen: any[] = Array.isArray(meta.children) ? meta.children : [];
  const fallbackParent: FamilyParent | null =
    stored.name || stored.mobile || stored.email
      ? {
          name: stored.name,
          mobile: stored.mobile,
          email: stored.email,
          school: stored.school,
          parentCode: stored.parentCode,
          children: chosen,
        }
      : null;

  let looked: FamilyParent[] = [];
  try {
    const projectId = String(ticket.project?._id || ticket.project || "");
    if (projectId && (stored.mobile || stored.email)) {
      const res = await lookupFamily(projectId, {
        mobile: stored.mobile,
        email: stored.email,
      });
      looked = res.parents;
    }
  } catch (e) {
    console.warn("[sr] family lookup for ticket failed:", (e as any)?.message);
  }

  // Same mobile can carry mother and father: keep the one the request names.
  const parent =
    looked.find(
      (p) =>
        (stored.parentCode && p.parentCode === stored.parentCode) ||
        (stored.name && p.name === stored.name),
    ) ||
    looked[0] ||
    fallbackParent;
  if (!parent) return { parent: null, children: [] };

  const byId = new Map(
    (parent.children || []).map((c) => [String(c.id || c.name), c]),
  );
  // The request's own children win on identity; the lookup adds the detail.
  const children: FamilyChild[] = chosen.length
    ? chosen.map((c) => {
        const detail = byId.get(String(c.id || c.name)) || {};
        return { ...c, ...detail, name: c.name || detail.name };
      })
    : parent.children || [];

  return { parent: { ...parent, children }, children };
}

/**
 * Write the student identity onto a service request: the enrolment number of
 * every child it is about, plus their ids. The enrolment number is the key a
 * parent's requests are grouped by, so both guardians of a student see the
 * same list however the request was raised.
 *
 * Non-fatal: a request whose students the MDM cannot resolve simply keeps no
 * enrolment numbers and stays visible to its raiser only.
 */
export async function stampStudentIdentity(ticketId: string, projectId: string) {
  try {
    const Ticket = (await import("../../models/Ticket")).Ticket;
    const ticket: any = await Ticket.findById(ticketId)
      .select("metadata")
      .lean();
    const meta = ticket?.metadata || {};
    const children: any[] = Array.isArray(meta.children) ? meta.children : [];
    const ids = children.map((c) => c?.id).filter(Boolean).map(String);
    const enrolments = new Set<string>(
      children.map((c) => c?.enrollmentId).filter(Boolean).map(String),
    );
    if (meta.studentEnrollment) enrolments.add(String(meta.studentEnrollment));

    let separatedFromMdm = false;
    const missing = ids.filter(
      (id) => !children.find((c) => String(c?.id) === id)?.enrollmentId,
    );
    if (missing.length) {
      const cfg: any = await getSrConfigForProject(projectId);
      const lookup = cfg?.psr?.intake?.lookup || {};
      const details = await fetchStudentDetails(
        missing,
        {
          ...(lookup.relationship || {}),
          studentMdmSourceId:
            lookup.studentMdmSourceId || lookup.relationship?.studentMdmSourceId,
        },
        projectId,
      );
      for (const id of missing) {
        const detail = details.get(id);
        if (detail?.enrollmentId) enrolments.add(String(detail.enrollmentId));
        if (detail?.separatedParents) separatedFromMdm = true;
      }
    }
    if (!enrolments.size && !ids.length) return;
    const separated =
      children.some((c) => c?.separatedParents) || separatedFromMdm;
    await Ticket.updateOne(
      { _id: ticketId },
      {
        $set: {
          "metadata.studentEnrollments": Array.from(enrolments),
          "metadata.studentIds": ids,
          "metadata.separatedParents": separated,
        },
      },
    );
  } catch (e) {
    console.warn("[sr] student identity stamp failed:", ticketId, (e as any)?.message);
  }
}

/** The enrolment numbers of every child mapped to this parent. */
export async function enrolmentsForParent(
  projectId: string,
  by: { mobile?: string; email?: string },
): Promise<string[]> {
  try {
    const { parents } = await lookupFamily(projectId, by);
    const out = new Set<string>();
    for (const p of parents)
      for (const c of p.children || []) if (c.enrollmentId) out.add(String(c.enrollmentId));
    return Array.from(out);
  } catch (e) {
    console.warn("[sr] parent enrolments lookup failed:", (e as any)?.message);
    return [];
  }
}
