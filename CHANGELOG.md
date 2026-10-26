# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Documentation and maintenance
- Disclose the current campus-authentication failure and distinguish implemented adapters from live acceptance.
- Correct timetable, data-flow, logging, session-lifetime and authorship descriptions.
- Add an evidence-based maintenance roadmap and include a production build in CI.

## [2026-10-24]

### Added
- `LICENSE` (MIT), `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`.
- English-primary README with architecture and security documentation.
- Repository description and topics for open-source discovery.

### Changed
- Campus endpoints consolidated under `mis.bjtu.edu.cn`.

## [2026-09-15]

### Changed
- Migrated from a Cloudflare Worker (vinext) to **Next.js 15 + Vercel**.
- Replaced the D1-backed session store with a **stateless AES-GCM HttpOnly cookie**.
- Captcha is now returned as an inline data URL from `/api/auth/start`.
- App icon replaced with the red "知行" artwork; manifest and apple-touch-icon updated.
- Security headers added (CSP, `X-Frame-Options`, `Referrer-Policy`, `nosniff`).

### Removed
- Cloudflare Worker, D1 schema, Drizzle migrations, invite-code tables.

## [2026-09-14]

### Added
- Five read-only features: grades, timetable, classroom occupancy and headcount, homework, exams.
- On-device ONNX captcha solving.
- Installable PWA manifest and service worker shell cache.
- Regression test suite (35 tests).
