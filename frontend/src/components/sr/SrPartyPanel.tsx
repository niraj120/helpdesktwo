/**
 * Who the service request is for — the parent who raised it and the student it
 * is about, with the student's school, grade, division and enrolment number.
 *
 * The request stores the parent and the chosen child at creation; the details
 * are topped up from the parent lookup + Student MDM, so requests raised
 * before those were captured still show them.
 */
import React, { useEffect, useState } from "react";
import { serviceRequestApi } from "../../services/serviceRequests";

interface Child {
  id?: string;
  name?: string;
  enrollmentId?: string;
  school?: string;
  grade?: string;
  division?: string;
}

interface Parent {
  name?: string;
  mobile?: string;
  email?: string;
  school?: string;
  parentCode?: string;
  children?: Child[];
}

const initialsOf = (value?: string) =>
  (value || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const Chip: React.FC<{ children: React.ReactNode; tone?: "slate" | "blue" }> = ({
  children,
  tone = "slate",
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
      tone === "blue"
        ? "bg-blue-50 text-blue-700"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    {children}
  </span>
);

const SrPartyPanel: React.FC<{
  ticketId: string;
  /** PSR shows parent + student; ISR shows who raised it. */
  interactionType?: string;
  raisedBy?: string;
  raisedByEmail?: string;
  raisedByMobile?: string;
  /** Hidden from the student's other guardian. */
  privateToRaiser?: boolean;
  /** Only staff who may act on the request can change that. */
  canSetPrivate?: boolean;
}> = ({
  ticketId,
  interactionType,
  raisedBy,
  raisedByEmail,
  raisedByMobile,
  privateToRaiser,
  canSetPrivate,
}) => {
  const isPsr = interactionType === "PSR";
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(isPsr);
  const [isPrivate, setIsPrivate] = useState(!!privateToRaiser);
  const [savingPrivate, setSavingPrivate] = useState(false);

  useEffect(() => setIsPrivate(!!privateToRaiser), [privateToRaiser]);

  const togglePrivate = async () => {
    const next = !isPrivate;
    setIsPrivate(next);
    setSavingPrivate(true);
    try {
      await serviceRequestApi.setPrivateToRaiser(ticketId, next);
    } catch {
      setIsPrivate(!next); // put it back: nothing was saved
    } finally {
      setSavingPrivate(false);
    }
  };

  useEffect(() => {
    if (!isPsr || !ticketId) return;
    let cancelled = false;
    setLoading(true);
    serviceRequestApi
      .family(ticketId)
      .then((r: any) => {
        if (cancelled) return;
        setParent(r?.data?.parent || null);
        setChildren(r?.data?.children || []);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isPsr, ticketId]);

  const contact = [raisedByEmail, raisedByMobile].filter(Boolean);
  if (!isPsr && !raisedBy && !contact.length) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {isPsr ? "Parent & student" : "Raised by"}
      </h3>

      {/* Who raised it */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600">
          {initialsOf(isPsr ? parent?.name || raisedBy : raisedBy)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 break-words">
            {(isPsr ? parent?.name : raisedBy) || (loading ? "Loading…" : "—")}
          </p>
          {(isPsr ? [parent?.email, parent?.mobile] : contact)
            .filter(Boolean)
            .map((line) => (
              <p key={String(line)} className="text-sm text-gray-600 break-words">
                {line}
              </p>
            ))}
          {isPsr && parent?.parentCode && (
            <p className="mt-1 text-xs text-gray-400">
              Parent ID {parent.parentCode}
            </p>
          )}
        </div>
      </div>

      {/* Custody / privacy: both guardians see a student's requests by default */}
      {isPsr && canSetPrivate && (
        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isPrivate}
            disabled={savingPrivate}
            onChange={togglePrivate}
            className="mt-0.5"
          />
          <span>
            Private to the parent who raised it
            <span className="block text-xs text-gray-500">
              Keeps it hidden from the student's other guardian in the parent
              portal.
            </span>
          </span>
        </label>
      )}

      {/* The student(s) this request is about */}
      {isPsr && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {children.length > 1 ? "Students" : "Student"}
          </p>
          {loading && !children.length ? (
            <p className="text-sm text-gray-400">Looking up student details…</p>
          ) : children.length === 0 ? (
            <p className="text-sm text-gray-400">No student mapped.</p>
          ) : (
            <div className="space-y-2">
              {children.map((c, i) => (
                <div
                  key={c.id || i}
                  className="rounded-lg border border-gray-100 bg-slate-50 px-3 py-2"
                >
                  <p className="text-sm font-semibold text-gray-900 break-words">
                    {c.name || "—"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.grade && <Chip tone="blue">{c.grade}</Chip>}
                    {c.division && <Chip tone="blue">Div {c.division}</Chip>}
                    {c.school && <Chip>{c.school}</Chip>}
                  </div>
                  {c.enrollmentId && (
                    <p className="mt-1 text-xs text-gray-500">
                      Enrolment {c.enrollmentId}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SrPartyPanel;
