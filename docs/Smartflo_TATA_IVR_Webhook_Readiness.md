# Smartflo / TATA IVR Webhook Readiness

## Purpose

This note captures what is required from our Helpdesk Portal side before the TATA Smartflo team configures the IVR webhook.

## Webhook Endpoint

- Method: `POST`
- URL format: `https://<backend-domain>/api/public/service-requests/ivr/ingest`
- Content type: `application/json` preferred
- Also supported: `application/x-www-form-urlencoded`
- Required header: `X-API-Key: <active project public API key>`
- Optional header: `X-Project-ID: <project id>`

The URL must be public HTTPS. TATA should not use localhost or an internal IP.

## Smartflo Configuration

- Trigger: `Call hangup (Missed or Answered)` is recommended for complete call data.
- Call type: `Inbound`
- Request type: `POST`
- Content type: `application/json`
- Header: add `X-API-Key` with the project-specific public API key.

## Payload Fields Supported

The webhook ingest supports the following Smartflo variables:

- `$uuid`
- `$call_to_number`
- `$caller_id_number`
- `$customer_number`
- `$customer_number_with_prefix`
- `$answered_agent_number`
- `$answered_agent_name`
- `$answered_agent`
- `$missed_agent`
- `$start_stamp`
- `$answer_stamp`
- `$end_stamp`
- `$hangup_cause`
- `$billsec`
- `$duration`
- `$digits_dialed`
- `$direction`
- `$call_flow`
- `$recording_url`
- `$call_status`

Common aliases are also accepted for call id, DID/call-to number, and caller mobile.

## Portal Prerequisites

- Service Request module must be enabled for the project.
- PSR must be enabled for the project.
- IVR intake must be enabled in the project Service Request configuration.
- An active `PublicApiKey` must exist for the project.
- The deployed backend must include the Smartflo compatibility update.
- Reverse proxy/firewall must allow public HTTPS requests to the backend IVR ingest route.

## Expected Behavior

- On valid webhook receipt, the system logs the raw payload in IVR ingest logs.
- The call is stored in call triage as answered or missed.
- Caller mobile is normalized to the last 10 digits for matching.
- Existing parent/user matching is attempted using mobile fields.
- Repeated webhook delivery is idempotent using Smartflo `uuid` or fallback call identity.
- The endpoint returns HTTP 200 for processed or intentionally ignored payloads.

## TATA Handoff Checklist

- Share the public HTTPS webhook URL.
- Share the active project `X-API-Key`.
- Ask TATA to configure `POST` with `application/json`.
- Ask TATA to add the `X-API-Key` header.
- Ask TATA to use the `Call hangup (Missed or Answered)` trigger for inbound calls.
- After configuration, test with one answered call and one missed call.
- Verify records appear in IVR/call triage and IVR ingest logs.

