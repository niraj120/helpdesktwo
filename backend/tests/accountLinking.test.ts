/**
 * Phase 2 — account-linking planner (unit tests, no DB).
 *
 * Proves the classification rules that keep the migration safe: strong-key
 * unique matches are auto-linkable, everything dup-prone or conflicting is held
 * for review, and nothing disabled/already-linked is touched.
 */
import {
  buildMatchPlan,
  LocalUser,
  KeycloakUser,
  LinkConfig,
} from "../src/services/keycloak/accountLinking";

const CONFIG: LinkConfig = {
  keyPriority: ["employeeCode", "hrmsId", "email", "mobile"],
  strongKeys: ["employeeCode", "hrmsId"],
};

const local = (o: Partial<LocalUser> & { id: string }): LocalUser => ({
  isActive: true,
  ...o,
});

describe("buildMatchPlan", () => {
  it("auto-links a unique match on a strong key (employeeCode)", () => {
    const locals = [local({ id: "u1", employeeCode: "E100", email: "a@x.com" })];
    const kc: KeycloakUser[] = [{ sub: "s1", employeeCode: "E100", email: "a@x.com" }];
    const plan = buildMatchPlan(locals, kc, CONFIG);
    expect(plan.rows[0].status).toBe("MATCH_UNIQUE");
    expect(plan.rows[0].matchedSub).toBe("s1");
    expect(plan.rows[0].matchedBy).toBe("employeeCode");
    expect(plan.autoLinkable).toHaveLength(1);
    expect(plan.needsReview).toHaveLength(0);
  });

  it("flags a unique match on a weak key (email) for review, not auto-link", () => {
    const locals = [local({ id: "u1", email: "a@x.com" })]; // no strong key
    const kc: KeycloakUser[] = [{ sub: "s1", email: "a@x.com" }];
    const plan = buildMatchPlan(locals, kc, CONFIG);
    expect(plan.rows[0].status).toBe("MATCH_WEAK");
    expect(plan.autoLinkable).toHaveLength(0);
    expect(plan.needsReview).toHaveLength(1);
  });

  it("marks AMBIGUOUS when multiple Keycloak users share the key", () => {
    const locals = [local({ id: "u1", email: "dup@x.com" })];
    const kc: KeycloakUser[] = [
      { sub: "s1", email: "dup@x.com" },
      { sub: "s2", email: "dup@x.com" },
    ];
    const plan = buildMatchPlan(locals, kc, CONFIG);
    expect(plan.rows[0].status).toBe("MATCH_AMBIGUOUS");
    expect(plan.rows[0].candidateSubs).toEqual(expect.arrayContaining(["s1", "s2"]));
  });

  it("marks CONFLICT when one sub matches two local users", () => {
    const locals = [
      local({ id: "u1", employeeCode: "E1" }),
      local({ id: "u2", employeeCode: "E1" }),
    ];
    const kc: KeycloakUser[] = [{ sub: "s1", employeeCode: "E1" }];
    const plan = buildMatchPlan(locals, kc, CONFIG);
    expect(plan.rows.every((r) => r.status === "CONFLICT")).toBe(true);
    expect(plan.autoLinkable).toHaveLength(0);
    expect(plan.needsReview).toHaveLength(2);
  });

  it("reports NO_KEYCLOAK when no match exists", () => {
    const locals = [local({ id: "u1", employeeCode: "E9", email: "none@x.com" })];
    const kc: KeycloakUser[] = [{ sub: "s1", employeeCode: "E1" }];
    const plan = buildMatchPlan(locals, kc, CONFIG);
    expect(plan.rows[0].status).toBe("NO_KEYCLOAK");
  });

  it("skips inactive users and never links them", () => {
    const locals = [local({ id: "u1", employeeCode: "E1", isActive: false })];
    const kc: KeycloakUser[] = [{ sub: "s1", employeeCode: "E1" }];
    const plan = buildMatchPlan(locals, kc, CONFIG);
    expect(plan.rows[0].status).toBe("DISABLED_SKIPPED");
    expect(plan.autoLinkable).toHaveLength(0);
  });

  it("leaves already-linked users alone", () => {
    const locals = [local({ id: "u1", employeeCode: "E1", keycloakSubject: "existing" })];
    const kc: KeycloakUser[] = [{ sub: "s1", employeeCode: "E1" }];
    const plan = buildMatchPlan(locals, kc, CONFIG);
    expect(plan.rows[0].status).toBe("LINKED_ALREADY");
    expect(plan.rows[0].matchedSub).toBe("existing");
  });

  it("prefers the strong key over a weak key when both would match different subs", () => {
    const locals = [local({ id: "u1", employeeCode: "E1", email: "a@x.com" })];
    const kc: KeycloakUser[] = [
      { sub: "strong", employeeCode: "E1" },
      { sub: "weak", email: "a@x.com" },
    ];
    const plan = buildMatchPlan(locals, kc, CONFIG);
    expect(plan.rows[0].status).toBe("MATCH_UNIQUE");
    expect(plan.rows[0].matchedSub).toBe("strong");
    expect(plan.rows[0].matchedBy).toBe("employeeCode");
  });
});
