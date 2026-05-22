/**
 * useReplyDraft — Idle-Save Auto-Draft Hook
 *
 * Implements the "Idle Save Method":
 *   - Saves to localStorage on every keystroke (instant, offline-safe)
 *   - Syncs to backend after 15 s of inactivity (idle save)
 *   - Periodic backup to backend every 5 min (crash guard)
 *   - Saves to localStorage on beforeunload (tab close guard)
 *   - Restores draft on mount (backend first, localStorage fallback)
 *   - clearDraft() removes both localStorage and backend entries (call after send)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { API_CONFIG } from "../config/constants";

export type DraftType = "reply" | "email";

export type SaveStatus =
  | "idle"        // no draft, nothing to save
  | "unsaved"     // dirty, not yet synced to backend
  | "saving"      // backend PUT in-flight
  | "saved"       // last backend save succeeded
  | "error";      // last backend save failed

const IDLE_DELAY_MS    = 15_000;        // 15 seconds idle before backend save
const PERIODIC_SAVE_MS = 5 * 60_000;   // 5-minute periodic backup

const lsKey = (ticketId: string, type: DraftType) =>
  `ticket_draft_${type}_${ticketId}`;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface UseReplyDraftReturn {
  /** Current draft value */
  value: string;
  /** Call this instead of a plain setState on every textarea change */
  onChange: (newValue: string) => void;
  /** Directly set value without marking dirty (e.g. programmatic clear via clearDraft) */
  setValue: React.Dispatch<React.SetStateAction<string>>;
  /** Current save status for the status indicator */
  saveStatus: SaveStatus;
  /** True when draft was restored from a previous session */
  draftRestored: boolean;
  /** Dismiss the "draft restored" banner without clearing the content */
  dismissRestoreBanner: () => void;
  /**
   * Call after a successful send.
   * Clears value, removes localStorage entry, and DELETEs the backend draft.
   */
  clearDraft: () => Promise<void>;
}

export function useReplyDraft(
  ticketId: string | undefined,
  type: DraftType = "reply",
): UseReplyDraftReturn {
  const [value, setValue]               = useState<string>("");
  const [saveStatus, setSaveStatus]     = useState<SaveStatus>("idle");
  const [draftRestored, setDraftRestored] = useState(false);

  // Refs so callbacks always have the latest values without re-creating
  const latestValueRef  = useRef<string>("");
  const isDirtyRef      = useRef<boolean>(false);
  const idleTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Backend save ──────────────────────────────────────────────────────────
  const saveToBackend = useCallback(
    async (content: string) => {
      if (!ticketId) return;
      if (!content.trim()) return; // never save empty drafts to backend
      setSaveStatus("saving");
      try {
        await axios.put(
          `${API_CONFIG.API_URL}/tickets/${ticketId}/draft`,
          { content, type },
          { headers: authHeaders() },
        );
        isDirtyRef.current = false;
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [ticketId, type],
  );

  // ── Mount: restore draft (backend → localStorage fallback) ───────────────
  useEffect(() => {
    if (!ticketId) return;

    let cancelled = false;

    (async () => {
      // Try backend first (cross-device, persistent)
      try {
        const res = await axios.get(
          `${API_CONFIG.API_URL}/tickets/${ticketId}/draft?type=${type}`,
          { headers: authHeaders() },
        );
        const saved: string = res.data?.data?.content ?? "";
        if (!cancelled && saved.trim()) {
          setValue(saved);
          latestValueRef.current = saved;
          setDraftRestored(true);
          setSaveStatus("saved");
          return;
        }
      } catch {
        // Fall through to localStorage
      }

      // Fallback: localStorage
      const ls = localStorage.getItem(lsKey(ticketId, type)) ?? "";
      if (!cancelled && ls.trim()) {
        setValue(ls);
        latestValueRef.current = ls;
        setDraftRestored(true);
        setSaveStatus("unsaved"); // not yet synced to backend
      }
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, type]);

  // ── Cleanup timers on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (idleTimerRef.current)    clearTimeout(idleTimerRef.current);
      if (periodicTimerRef.current) clearInterval(periodicTimerRef.current);
    };
  }, []);

  // ── Periodic backup save (every 5 min) ───────────────────────────────────
  useEffect(() => {
    if (!ticketId) return;
    periodicTimerRef.current = setInterval(() => {
      if (isDirtyRef.current && latestValueRef.current.trim()) {
        saveToBackend(latestValueRef.current);
      }
    }, PERIODIC_SAVE_MS);
    return () => {
      if (periodicTimerRef.current) clearInterval(periodicTimerRef.current);
    };
  }, [ticketId, type, saveToBackend]);

  // ── beforeunload: sync to localStorage (instant, no API) ─────────────────
  useEffect(() => {
    if (!ticketId) return;
    const key = lsKey(ticketId, type);
    const handler = () => {
      if (latestValueRef.current.trim()) {
        localStorage.setItem(key, latestValueRef.current);
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [ticketId, type]);

  // ── onChange: called on every textarea change ─────────────────────────────
  const onChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      latestValueRef.current = newValue;
      isDirtyRef.current = true;
      setSaveStatus("unsaved");

      // Immediate localStorage save (instant, works offline)
      if (ticketId) {
        if (newValue.trim()) {
          localStorage.setItem(lsKey(ticketId, type), newValue);
        } else {
          localStorage.removeItem(lsKey(ticketId, type));
        }
      }

      // Reset idle timer — fires backend save after 15 s of inactivity
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (isDirtyRef.current) {
          saveToBackend(latestValueRef.current);
        }
      }, IDLE_DELAY_MS);
    },
    [ticketId, type, saveToBackend],
  );

  // ── clearDraft: call after successful send ────────────────────────────────
  const clearDraft = useCallback(async () => {
    // Cancel any pending timers
    if (idleTimerRef.current)    clearTimeout(idleTimerRef.current);

    setValue("");
    latestValueRef.current = "";
    isDirtyRef.current = false;
    setSaveStatus("idle");
    setDraftRestored(false);

    if (!ticketId) return;

    // Clear localStorage
    localStorage.removeItem(lsKey(ticketId, type));

    // Delete backend draft (fire-and-forget — don't block UI)
    try {
      await axios.delete(
        `${API_CONFIG.API_URL}/tickets/${ticketId}/draft?type=${type}`,
        { headers: authHeaders() },
      );
    } catch {
      // silent — not critical if delete fails
    }
  }, [ticketId, type]);

  const dismissRestoreBanner = useCallback(() => {
    setDraftRestored(false);
  }, []);

  return {
    value,
    onChange,
    setValue,
    saveStatus,
    draftRestored,
    dismissRestoreBanner,
    clearDraft,
  };
}
