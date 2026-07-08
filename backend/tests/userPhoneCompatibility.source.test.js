const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("User phone compatibility", () => {
  test("manual and offline student user creation keep phone canonical and mirror mobile", () => {
    const controller = read("backend/src/controllers/userController.ts");

    expect(controller).toContain("const contactPhone = normalizeContactPhone(phone || mobile);");
    expect(controller).toContain("phone: contactPhone || undefined");
    expect(controller).toContain("mobile: contactPhone || undefined");
    expect(controller).toContain("const offlineContactPhone = normalizeContactPhone(phone);");
    expect(controller).toContain("phone: offlineContactPhone || phone");
    expect(controller).toContain("mobile: offlineContactPhone || undefined");
  });

  test("public mobile lookup remains vendor-compatible while reading the mirrored field", () => {
    const publicApi = read("backend/src/controllers/publicApiController.ts");
    const routes = read("backend/src/routes/publicApi.ts");

    expect(routes).toContain('"/users/lookup"');
    expect(publicApi).toContain("mobile: mobileQuery(normMobile)");
    expect(publicApi).toContain("mobile: user.mobile");
  });

  test("user management displays phone with mobile fallback for older records", () => {
    const ui = read("frontend/src/components/UserManagement.tsx");

    expect(ui).toContain("phone?: string;");
    expect(ui).toContain("user.phone || user.mobile");
    expect(ui).toContain("mobile: user.phone || user.mobile || \"\"");
  });
});
