const fs = require("fs");
const path = require("path");

describe("Service request source and intake workflow tags", () => {
  test("walk-in SRs use a distinct walk_in submission source", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../src/modules/service-request/createServiceRequest.ts"),
      "utf8",
    );

    expect(source).toContain('walk_in: "walk_in"');
    expect(source).toContain("buildRequestedByMetadata");
  });

  test("email intake supports junk actions without creating duplicate storage", () => {
    const model = fs.readFileSync(
      path.join(__dirname, "../src/models/EmailIntake.ts"),
      "utf8",
    );
    const service = fs.readFileSync(
      path.join(__dirname, "../src/modules/service-request/emailTriage.ts"),
      "utf8",
    );

    expect(model).toContain('| "junk"');
    expect(model).toContain('"junk"');
    expect(service).toContain('case "junk"');
    expect(service).toContain('intake.status = "junk"');
  });

  test("ivr calls can be marked as junk from the triage workflow", () => {
    const model = fs.readFileSync(
      path.join(__dirname, "../src/models/CallIntake.ts"),
      "utf8",
    );
    const service = fs.readFileSync(
      path.join(__dirname, "../src/modules/service-request/callTriage.ts"),
      "utf8",
    );
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/modules/service-request/routes/ivr.ts"),
      "utf8",
    );

    expect(model).toContain('"junk"');
    expect(service).toContain("markCallJunk");
    expect(service).toContain('call.callStatus = "junk"');
    expect(routes).toContain('"/calls/:id/junk"');
  });

  test("service request all listing excludes normal and untagged tickets", () => {
    const service = fs.readFileSync(
      path.join(__dirname, "../src/modules/service-request/serviceRequestService.ts"),
      "utf8",
    );

    expect(service).toContain('it === "all" ? { $in: ["PSR", "ISR"] } : it');
    expect(service).not.toContain('it === "all" ? { $ne: "normal" } : it');
  });

  test("service request numbering is configured separately for PSR and ISR", () => {
    const generator = fs.readFileSync(
      path.join(__dirname, "../src/modules/service-request/srTicketNumber.ts"),
      "utf8",
    );
    const creator = fs.readFileSync(
      path.join(__dirname, "../src/modules/service-request/createServiceRequest.ts"),
      "utf8",
    );
    const config = fs.readFileSync(
      path.join(__dirname, "../src/modules/service-request/serviceRequestConfig.ts"),
      "utf8",
    );

    expect(config).toContain("numbering:");
    expect(config).toContain("PSR:");
    expect(config).toContain("ISR:");
    expect(generator).toContain("configuration.sr.numbering");
    expect(generator).toContain("srNumbering?.[interactionType]");
    expect(creator).toContain("input.interactionType");
  });
});
