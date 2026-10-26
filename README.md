# 交大自由行 · BJTU Self-Service Web

An unofficial, student-maintained Progressive Web App for Beijing Jiaotong University. It brings adapters for grades, classroom availability, the current timetable, homework and exams into one mobile interface.

[![CI](https://github.com/Zafiro-0/bjtu-self-service-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Zafiro-0/bjtu-self-service-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Current status — checked 2026-10-26:** the [hosted interface](https://bjtu-self-service-web.vercel.app) opens, but `/api/auth/start` returns HTTP 502 (`UPSTREAM_FAILED`). Campus authentication needs adaptation to the changed university portal. The five adapters are implemented; current authenticated data access has not passed acceptance. See [maintenance status and next steps](docs/maintenance.md).

## Why this project exists

Academic information is spread across multiple desktop-oriented campus portals. This project explores a single installable phone interface, with server-side proxying but no application database of students or credentials. It is a small campus-specific project, not a university service or a general-purpose identity provider.

## Implemented scope

| Page | Implemented behavior |
| --- | --- |
| Grades | Latest term by default; year/term names; overall weighted average and calculated GPA independent of the selected term |
| Classrooms | Building, teaching week, weekday and period filters; separate occupancy and third-party headcount results |
| Timetable | Current academic term only in the UI; teaching-week selection, week ranges and odd/even rules; four daytime blocks showing course, teacher and room |
| Homework | Ordinary assignments, course projects and lab reports; pending counts, deadlines and reminders |
| Exams | Type filters, time/place, countdowns and comparison with the previous exam snapshot |

The application reads academic information. Payments, enrolment, assignment submission and classroom video are outside its scope. Grades include a **calculated GPA**, not an official university GPA. Headcount depends on a separate service; timetable dates depend on the [configured calendar](shared/campus.ts), which requires maintenance for new academic years.

## Run locally

Use **Node.js 22** as selected by `.nvmrc` and CI. The tests import TypeScript directly, so use an up-to-date Node 22 installation rather than relying on the broader package engine minimum.

```sh
git clone https://github.com/Zafiro-0/bjtu-self-service-web.git
cd bjtu-self-service-web
npm ci
cp .env.example .env.local
# Set SESSION_SECRET to a random value in .env.local.
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run dev
```

PowerShell users can use `Copy-Item .env.example .env.local`. The random-value command prints a **new local secret**, not an existing production credential. Keep environment files out of version control.

Open <http://localhost:3000>. UI and parser development do not require a campus account; live integration tests require your own account and working university endpoints. Do not submit credentials to issues or use someone else's account.

```sh
npm test
npx tsc --noEmit --incremental false
npm run build
npm start
```

CI runs regression tests, type checking and a production build. Parser tests use fixtures; they do not prove campus availability, mobile acceptance, load capacity or security certification.

## Architecture and data flow

```text
Phone browser / PWA
  IndexedDB: encrypted device credentials; ONNX: local captcha inference
            | HTTPS /api/* (credentials pass through at login)
Next.js route handler on Vercel
  decrypts the session cookie and processes campus responses in memory
            | university requests / separate HTTP headcount request
Campus authentication and academic systems / third-party headcount service
```

| Data | Current handling and limits |
| --- | --- |
| Student ID and password | The server receives plaintext values inside the HTTPS login request and forwards them to campus authentication. The app does not intentionally write them to disk or a database. The browser saves AES-GCM ciphertext and a non-exportable key in IndexedDB for later login. Same-origin malicious JavaScript could still use that key. |
| Campus cookies | Encrypted with server-held `SESSION_SECRET` in an HttpOnly, SameSite=Lax cookie, Secure over HTTPS. Responses renew its 30-day browser lifetime. There is no independent encrypted-payload expiry or server-side revocation list. |
| Academic data | Processed in server memory and rendered in the browser. API responses send `Cache-Control: no-store`; the service worker excludes `/api/`. |
| Headcount | The server sends a building name to `http://yaya.csoci.com:2333`, without the campus cookie jar. This HTTP request has no transport encryption and reveals network metadata to that service. |
| Logs and limits | The app logs route/error messages and keeps best-effort rate-limit counters in process memory. Hosting providers may retain access/error logs. This is not a guarantee of zero logs or global rate limiting. |

Logout clears the current device's session and local credentials. It cannot revoke an already copied session cookie. See [SECURITY.md](SECURITY.md) for reporting and boundaries.

## Deployment

The project runs on Next.js App Router with a Node.js API route. For Vercel, import the repository, configure a random `SESSION_SECRET` and use the standard Next.js build. Keep the secret stable across instances; rotating it invalidates existing encrypted sessions. `vercel.json` currently selects `iad1`, based on historical connectivity tests, not a permanent availability guarantee.

Deploying the interface does not repair campus authentication. Verify login and all five data flows with an authorized account before sharing an instance as a working service. No paid plan is required just to run the local checks; hosting costs depend on the provider and actual usage.

## Contributing and maintenance

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [current maintenance priorities](docs/maintenance.md) and [CHANGELOG.md](CHANGELOG.md). For ordinary bugs, use the issue templates with synthetic or redacted examples. Report vulnerabilities privately using [SECURITY.md](SECURITY.md). Contributions follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License and provenance

Application code is MIT licensed; see [LICENSE](LICENSE), [NOTICE](NOTICE) and [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt). It derives from [HFDLYS/BJTUselfService](https://github.com/HFDLYS/BJTUselfService). Zafiro-0 maintains this web adaptation with assistance from **OpenAI Codex and WorkBuddy**. The public history starts with an imported release; it is not a complete record of the earlier private development.

The upstream-derived captcha model and university artwork have separate provenance. This repository does not establish an independent redistribution licence for those assets or grant rights to university marks. Review [NOTICE](NOTICE) before redistributing them. Being public and having an MIT code licence does not by itself qualify a project for any developer-support program.

## 中文简介

交大自由行是非官方校园信息 PWA，包含成绩、教室、当前学期课表、作业和考试五个只读页面。课表只选择教学周；成绩按学期名称查看，顶部计算均分与 GPA 不随切换变化。

**当前校园登录仍需适配**：2026-10-26 实测首页可打开，但认证启动接口返回 502；不能把界面上线和解析测试通过当作五项数据查询已经可用。服务器会接触登录凭据并处理校园数据，只是不使用应用数据库长期保存。真实使用规模、多人并发和长期自动续登尚未提供验收证据。
