/**
 * The parent(s) registered on a caller's number or a sender's email, with the
 * children mapped to each (school, grade, division, enrolment no). Shared by
 * the IVR call drawer and the email drawer; styles live in ivr/ivrInbox.css.
 */
import React from "react";
import type { SrFamilyParent } from "../../services/serviceRequests";

const FamilyCard: React.FC<{
  /** null while the lookup runs; [] when nobody is registered. */
  family: SrFamilyParent[] | null;
  /** "number" for a call, "email address" for an email. */
  keyLabel: string;
}> = ({ family, keyLabel }) => {
  if (family === null) {
    return (
      <section className="ivr-card">
        <div className="ivr-muted">Looking up the family…</div>
      </section>
    );
  }
  if (!family.length) return null;
  return (
    <section className="ivr-card">
      <div className="ivr-card-h">
        {family.length > 1
          ? `${family.length} parents registered on this ${keyLabel}`
          : "Registered parent"}
      </div>
      {family.map((p, pi) => (
        <div key={p.parentCode || pi} className="ivr-family">
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {p.name || "—"}
            {[p.mobile, p.email].filter(Boolean).length ? (
              <span className="ivr-muted" style={{ fontWeight: 400 }}>
                {" "}· {[p.mobile, p.email].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </div>
          {p.children.length === 0 ? (
            <div className="ivr-muted">No children mapped.</div>
          ) : (
            p.children.map((ch, ci) => (
              <div key={ch.id || ci} className="ivr-child">
                <div style={{ fontWeight: 600 }}>{ch.name || "—"}</div>
                <div className="ivr-muted">
                  {[ch.school, ch.grade, ch.division && `Div ${ch.division}`]
                    .filter(Boolean)
                    .join(" · ") || "School details unavailable"}
                </div>
                {ch.enrollmentId ? (
                  <div className="ivr-muted" style={{ fontSize: 11 }}>
                    Enrolment {ch.enrollmentId}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ))}
    </section>
  );
};

export default FamilyCard;
