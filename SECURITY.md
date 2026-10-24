# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub's **Security → Report a vulnerability** tab on this repository, or contact the maintainer directly (@Zafiro-0). Include:

- a description of the issue and its impact,
- reproduction steps or a proof of concept,
- the affected version/commit.

You can expect an acknowledgement within a few days. Please allow reasonable time for a fix before public disclosure.

## Scope

This project is a **client-side PWA plus a stateless proxy** for a university's campus systems. The following are in scope:

- leaks of plaintext credentials or session data to the server or logs,
- authentication bypass or session-forgery issues,
- cross-site scripting, CSP bypasses, or injection in parsed upstream HTML,
- unintended server-side persistence of user data,
- insecure handling of the encrypted credential store (IndexedDB/AES-GCM).

## Out of scope

- Vulnerabilities in the university's own systems (report those to the university),
- Issues that require the user to install a malicious extension or run a rooted device,
- Rate-limit thresholds, or denial-of-service through intentional abuse,
- The captcha model's recognition accuracy.

## Design commitments

- The server never persists user data.
- Passwords are encrypted with a device-unique, non-exportable AES-GCM key and stay in the browser.
- Campus session cookies are AES-GCM encrypted into an HttpOnly cookie.
- Plaintext credentials must never appear in logs, error messages or analytics.
