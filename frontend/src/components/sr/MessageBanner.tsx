import React from "react";

export interface SrMessage {
  type: "ok" | "err";
  text: string;
}

/** Shared ok/error banner used across the Service Request pages. */
const MessageBanner: React.FC<{ message: SrMessage | null }> = ({ message }) => {
  if (!message) return null;
  const ok = message.type === "ok";
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        marginBottom: 16,
        fontSize: 13,
        color: ok ? "#065f46" : "#991b1b",
        background: ok ? "#ecfdf5" : "#fef2f2",
        border: `1px solid ${ok ? "#a7f3d0" : "#fecaca"}`,
      }}
    >
      {message.text}
    </div>
  );
};

export default MessageBanner;
