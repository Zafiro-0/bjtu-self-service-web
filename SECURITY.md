# Security policy

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/Zafiro-0/bjtu-self-service-web/security/advisories/new). Do not put credentials, campus cookies, grades or real student records in a public issue. Include the affected commit, expected behavior and a minimal reproduction using synthetic data. If private reporting is unavailable, open only a non-sensitive request for a private contact channel; do not disclose the vulnerability there.

The project has one volunteer maintainer and no guaranteed response SLA. The current `main` branch is the supported development line. Hosted login is currently affected by upstream portal changes; see [maintenance status](docs/maintenance.md).

## Data boundary

- Login credentials pass through the Next.js server in memory before being sent to campus authentication over HTTPS. Browser-side AES-GCM storage is not end-to-end encryption from the hosting operator.
- The application has no database of users or academic records. It does log route/error messages; hosting services may retain request/error logs. Never deliberately include credentials, upstream response bodies or personal academic data in logs.
- Device credentials are encrypted in IndexedDB with a non-exportable key. This does not protect against malicious same-origin JavaScript, a compromised browser profile or a compromised server serving modified JavaScript.
- Campus cookies are AES-GCM encrypted in an HttpOnly cookie. The browser lifetime slides by 30 days on responses; the current payload has no independent expiry check or revocation list. Clearing the local cookie does not invalidate a copied cookie.
- Rate limits use in-process maps and can reset on cold starts or be distributed across instances. They are not global abuse protection.
- API responses are marked `no-store` and the service worker excludes `/api/`. The PWA shell cache is not an offline copy of academic records.

## External services

The code proxies campus routes on `mis.bjtu.edu.cn` and uses the published `bksy.bjtu.edu.cn` calendar as a reference. Endpoint compatibility must be revalidated following the university portal migration.

Classroom headcount comes from `http://yaya.csoci.com:2333`. That separate fetch sends a building name and does not include the campus cookie jar. HTTP is unencrypted; the service and network intermediaries can observe traffic and network metadata. Headcount failure should remain separate from classroom occupancy.

No analytics or advertising SDK is configured in the application code. This statement does not describe all platform-level logging by a deployer or hosting provider.

## Scope of reports

Credential exposure, session handling, cross-user data leakage, origin checks, script injection, unexpected persistence and upstream request handling are in scope. The limitations above are documented constraints, not claims that related vulnerabilities are harmless.

University systems and third-party infrastructure are outside the maintainer's authority. Do not probe them, submit high-volume requests, or test with someone else's credentials as part of a report. Use local fixtures or your own authorized test account. No audit or security certification is claimed.
