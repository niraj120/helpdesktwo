const fs = require("fs");
const path = require("path");

describe("HierarchyConfig scoped flows", () => {
  test("supports separate hierarchy configs per project flow", () => {
    const modelSource = fs.readFileSync(
      path.join(__dirname, "../src/models/HierarchyConfig.ts"),
      "utf8",
    );

    expect(modelSource).toContain("scopedConfigs");
    expect(modelSource).toContain("PSR");
    expect(modelSource).toContain("ISR");
  });
});
