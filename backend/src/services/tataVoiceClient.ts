/**
 * Thin client for the TATA SmartFlo voice REST API.
 *
 * Currently exposes Click-to-Call (outbound). Auth is a long-lived JWT sent
 * verbatim in the `Authorization` header — SmartFlo does NOT use a "Bearer"
 * prefix (per the reference cURL). Uses the global fetch (Node 18+).
 *
 * Reference:
 *   POST {baseUrl}/click_to_call
 *   body: { async, caller_id, destination_number, agent_number,
 *           call_timeout?, custom_identifier? }
 *   200:  { success: true, message: "...", ref_id: "..." }
 */

export interface ClickToCallParams {
  /** DID/virtual number shown to the customer. Omit → account pilot number. */
  callerId?: string;
  /** Customer's number to dial. */
  destinationNumber: string;
  /** The SmartFlo agent number to ring first. */
  agentNumber: string;
  /** Our correlation token, echoed back on the webhook. */
  customIdentifier?: string;
  /** Auto-disconnect after N seconds. */
  callTimeoutSeconds?: number;
}

export interface ClickToCallResult {
  success: boolean;
  message?: string;
  refId?: string;
  /** HTTP status from SmartFlo, for logging/diagnostics. */
  httpStatus: number;
  /** Raw parsed body, for auditing. */
  raw?: any;
}

export interface TataVoiceClientOptions {
  baseUrl: string;
  /** Decrypted SmartFlo JWT. */
  token: string;
  /** Per-request timeout; SmartFlo async originate returns fast. */
  timeoutMs?: number;
}

export class TataVoiceError extends Error {
  httpStatus: number;
  raw?: any;
  constructor(message: string, httpStatus: number, raw?: any) {
    super(message);
    this.name = "TataVoiceError";
    this.httpStatus = httpStatus;
    this.raw = raw;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

export class TataVoiceClient {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;

  constructor(opts: TataVoiceClientOptions) {
    // Trim a trailing slash so path joins are predictable.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Initiate a Click-to-Call. SmartFlo rings `agentNumber` first, then dials
   * `destinationNumber`. `async:1` returns immediately with a ref_id.
   *
   * Throws TataVoiceError on transport failure, timeout, or non-2xx.
   */
  async clickToCall(params: ClickToCallParams): Promise<ClickToCallResult> {
    if (!this.token) throw new TataVoiceError("Missing SmartFlo API token", 0);
    if (!params.destinationNumber)
      throw new TataVoiceError("destination_number is required", 0);
    if (!params.agentNumber)
      throw new TataVoiceError("agent_number is required", 0);

    const body: Record<string, any> = {
      async: 1,
      destination_number: params.destinationNumber,
      agent_number: params.agentNumber,
    };
    if (params.callerId) body.caller_id = params.callerId;
    if (params.customIdentifier)
      body.custom_identifier = params.customIdentifier;
    if (params.callTimeoutSeconds)
      body.call_timeout = params.callTimeoutSeconds;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/click_to_call`, {
        method: "POST",
        headers: {
          // SmartFlo expects the raw JWT, NOT "Bearer <jwt>".
          Authorization: this.token,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === "AbortError")
        throw new TataVoiceError(
          `SmartFlo request timed out after ${this.timeoutMs}ms`,
          0,
        );
      throw new TataVoiceError(
        `SmartFlo request failed: ${err?.message || "network error"}`,
        0,
      );
    }
    clearTimeout(timer);

    let parsed: any = undefined;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text; // non-JSON error page
    }

    if (!res.ok || parsed?.success === false) {
      const msg =
        parsed?.message ||
        (typeof parsed === "string" ? parsed : "SmartFlo click-to-call failed");
      throw new TataVoiceError(msg, res.status, parsed);
    }

    return {
      success: parsed?.success ?? true,
      message: parsed?.message,
      refId: parsed?.ref_id,
      httpStatus: res.status,
      raw: parsed,
    };
  }
}

/** Convenience factory from a resolved config. */
export const makeTataVoiceClient = (opts: TataVoiceClientOptions) =>
  new TataVoiceClient(opts);
