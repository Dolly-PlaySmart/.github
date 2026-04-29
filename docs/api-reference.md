# API Reference

The PlaySmart API is HTTP/JSON over TLS. Base URL: `https://api.playsmart.example` (replace with the production URL when published).

## Authentication

Two endpoints issue a JWT:

- `POST /auth/register` — body `{ email, password }`. Returns `201 { data: { user_id, jwt, ... } }`.
- `POST /auth/login` — body `{ email, password }`. Returns `200 { data: { user_id, jwt, ... } }`.

Every protected endpoint requires the JWT as a bearer token:

```
Authorization: Bearer <jwt>
```

## Endpoints

### Public

| Method | Path | Description |
| --- | --- | --- |
| GET | `/healthz` | Liveness probe. Returns `{ ok: true }`. |
| GET | `/v1/app-settings` | Global app config (interstitial cadence, conversion ratio). |
| GET | `/v1/games` | List of available child games and their per-game settings. |

### User (bearer required)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/v1/users/me` | Current user profile: balance, `next_conversion_at`, timezone. |
| PATCH | `/v1/users/me` | Update mutable user fields (e.g. timezone). |
| POST | `/v1/withdrawals` | Request a withdrawal. Status starts as `pending`. |
| GET | `/v1/withdrawals` | List the caller's withdrawal requests. |

### Ingestion (bearer required)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/ingest/events` | Batch upload of SDK events (sessions, levels, ads, IAP, custom). |

The Ingestion API is the only client-side entry point for game events. Do not add per-action endpoints.

### Internal (server-to-server, OIDC)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/internal/convert/:userId` | Coin-to-USD conversion job, called by Cloud Tasks. Not reachable from the client. |

## Conventions

- All bodies are JSON (`Content-Type: application/json`).
- Timestamps are ISO-8601 UTC with `Z` suffix, e.g. `2026-04-29T12:00:00.000Z`.
- Every response carries an `X-Request-ID` header. Quote it in bug reports.
- Successful responses use the `{ "data": ... }` envelope.

## Error format

All errors share the same envelope:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "human readable message"
  }
}
```

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Invalid or missing body fields. |
| 400 | `MAINTENANCE` | App is not live (e.g. withdraws disabled). |
| 400 | `ZERO_BALANCE` | Withdraw requested with a zero balance. |
| 401 | `UNAUTHORIZED` | Missing or invalid credentials or JWT. |
| 403 | `FORBIDDEN` | JWT does not match the resource owner. |
| 404 | `NOT_FOUND` | Resource does not exist. |
| 409 | `CONFLICT` | Email already registered. |
| 500 | `SERVER_ERROR` | Unexpected server-side failure. |
| 503 | `INGEST_WRITE_FAILED` | Ingestion buffer flush failed. |

## OpenAPI

When the live spec is published, embed it on this page:

```
{% openapi src="https://api.playsmart.example/openapi.json" %}
```

Pending: the spec is not yet exposed by the API.

---

_Last verified: 2026-04-29_
