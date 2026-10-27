# Maintenance status

Checked on 2026-10-26. Maintainer: [Zafiro-0](https://github.com/Zafiro-0).

## Evidence and limits

| Check | Observation | What it establishes |
| --- | --- | --- |
| Hosted `/` | HTTP 200 | The web interface is served |
| Hosted `/api/me` without a cookie | HTTP 200, `loggedIn: false` | The unauthenticated API responds |
| Hosted `/api/auth/start` | HTTP 502, `UPSTREAM_FAILED` | Campus authentication is currently blocked |
| Existing main CI | Tests and type checking passed | Fixture-based code checks, not real login |

No live student account was used in this review. Real data parity, iPhone session retention, cross-user isolation and a 20-concurrent/50-user capacity target have not been accepted. Do not present those targets as measured adoption or verified capacity.

## Dependency and publication review

On 2026-10-26, `npm audit` against the committed lockfile reported four affected packages: `next` (critical), and `postcss`, `sharp`, `source-map-js` (high). In particular, Next.js 15.5.25 is within the range of [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw); that advisory lists 15.5.28 as patched. Exploitability depends on configuration and code paths; no exploitation or live security testing was performed. Resolve and re-audit the dependency graph before treating this project as ready for wider use.

A bounded pattern check of text blobs reachable from the then-public branches, tags and pull-request heads found no matching API tokens/private keys, real environment files, personal email addresses in file bodies, or private workspace paths. Commit emails in that scope used GitHub no-reply addresses. This does not cover every secret format, platform logs, inaccessible/deleted objects, or data inside model weights; it is not a privacy guarantee. Current timetable fixtures use placeholder teacher names; earlier commits retain their original examples.

## Priorities

1. Re-establish campus authentication and academic endpoints using an authorized session and redacted fixtures. Endpoint replacements must follow observed requests rather than a search-and-replace of hostnames.
2. Verify all five pages against the university systems, including homework submission status, grade/GPA interpretation, week rules and classroom coverage.
3. Test encrypted-cookie size, concurrent session updates, replay after logout and multi-instance rate limits before wider access.
4. Check iPhone PWA login, browser restarts and manual captcha fallback on ordinary mobile/Wi-Fi networks.
5. Resolve the redistribution terms for the bundled model and artwork, or replace them with clearly licensed assets.
6. Collect consented, aggregate usage evidence and keep a record of actual issue triage, reviews and releases. Do not manufacture stars, users, maintenance activity or application claims.

## Contributing safely

Use synthetic fixtures in issues and pull requests. Do not share personal campus information or load-test university servers. Fixture checks need no school login; live acceptance is a separate maintainer-operated step.

## Developer-support applications

The official [Codex for Open Source program](https://developers.openai.com/community/codex-for-oss) considers active open-source maintenance and project impact. Its [application](https://openai.com/form/codex-for-oss/) asks for public GitHub profile/repository links, maintainer role and evidence of significance. Repository documents help reviewers understand the work; they do not guarantee selection. This project currently has a campus-specific scope and unresolved upstream compatibility, which should be disclosed.
