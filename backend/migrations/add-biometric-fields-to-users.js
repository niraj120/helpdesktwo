/**
 * Migration: Add Biometric Sync Fields to Users
 * Date: 2026-04-06
 * Module: Attendance Module — Phase 1
 *
 * Adds the following fields to all existing user documents:
 *   - payrollNumber        (Number, null)
 *   - biometricSynced      (Boolean, false)
 *   - biometricEmployeeId  (Number, null) — AFT EmployeeID
 *   - biometricDeviceId    (Number, null) — AFT EmployeeBiometricID
 *   - biometricSyncedAt    (Date, null)
 *   - biometricSyncError   (String, null)
 *
 * Run: node backend/migrations/add-biometric-fields-to-users.js
 */

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/sac-helpdesk";

async function runMigration() {
  try {
    console.log("🚀 Migration: Add biometric fields to users");
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    const users = db.collection("users");

    const totalUsers = await users.countDocuments();
    console.log(`📊 Total users: ${totalUsers}`);

    // Add all biometric fields to users that don't have them yet
    const result = await users.updateMany(
      { biometricSynced: { $exists: false } },
      {
        $set: {
          payrollNumber: null,
          biometricSynced: false,
          biometricEmployeeId: null,
          biometricDeviceId: null,
          biometricSyncedAt: null,
          biometricSyncError: null,
        },
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} user documents with biometric fields`);

    // Create sparse index on biometricEmployeeId for fast lookup
    await users.createIndex(
      { biometricEmployeeId: 1 },
      { sparse: true, name: "idx_biometric_employee_id" }
    );
    console.log("✅ Created sparse index on biometricEmployeeId");

    // Verify
    const withBiometricFields = await users.countDocuments({
      biometricSynced: { $exists: true },
    });
    console.log(`✅ Users with biometric fields: ${withBiometricFields} / ${totalUsers}`);

    console.log("\n🎉 Migration completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
  }
}

runMigration();
