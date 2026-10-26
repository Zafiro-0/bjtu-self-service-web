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
