/**
 * Fire-and-forget notice that a Service Request area gained something new.
 *
 * Socket delivery must never affect whether the record itself was created, so
 * every failure here is swallowed and logged.
 */
export function notifySrActivity(
  projectId: any,
  area: "requests" | "email" | "ivr" | "leads",
  ref?: string,
) {
  try {
    const { getIo } = require("../../socket/ioInstance");
    const { emitSrActivity } = require("../../socket/socketHandlers");
    const io = getIo();
    if (io && projectId) {
      emitSrActivity(io, String(projectId), { area, ref });
    }
  } catch (e) {
    console.error("[sr] activity emit failed:", e);
  }
}
