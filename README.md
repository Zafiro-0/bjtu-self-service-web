# 交大自由行 · BJTU Self-Service Web

A privacy-first, **stateless** Progressive Web App for Beijing Jiaotong University (BJTU) students. It unifies **grades, timetable, classroom availability, homework and exam schedules** in one installable web app — with **zero user data stored on the server**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)
![Tests](https://img.shields.io/badge/tests-35%20passing-brightgreen)

---

## Why this project exists

University campus systems are usually fragmented across several portals (MIS, CAS, the academic-affairs system, a course platform) and are designed for desktop browsers. Most unofficial clients solve this by running a conventional backend that **stores credentials and session cookies** — which turns a convenience tool into a high-value target.

This project explores the opposite design:

- **The server is stateless.** It never writes user data to a database, a cache, or a log.
- **Nothing sensitive leaves the user's device** except the requests needed for the current API call.
- **The whole product is installable** as an iOS/Android home-screen app (PWA).

The result is a small, auditable codebase that demonstrates how to build a useful campus client without becoming a data custodian.

## Features

| Feature | What it does |
| --- | --- |
| **Grades** | Per-term grade list grouped by academic term, with weighted average and GPA-friendly formatting |
| **Timetable** | Current and historical semester schedules, week-based view, odd/even week rules |
| **Classroom availability** | Free/occupied rooms by building, week, weekday and time slot, plus real-time headcount |
| **Homework** | Pending assignments across courses, sorted by deadline, with remaining time |
| **Exams** | Exam schedule with type filtering and change detection |

All features are **read-only**: the app never submits grades, enrolments or any academic action.

## Security & privacy design

| Concern | Design |
| --- | --- |
| Server-side storage | **None.** No database, no KV store, no user table. |
| Password | Encrypted with a **device-unique, non-exportable AES-GCM key** and stored only in the browser's IndexedDB. Plaintext never reaches the server. |
| Campus session | AES-GCM encrypted with a server secret (`SESSION_SECRET`) and kept in an **HttpOnly cookie** on the user's device. |
| Captcha | Solved locally in the browser with an **ONNX** model; the image is returned as a data URL and never persisted server-side. |
| Abuse protection | In-memory rate limits (login failures, per-session API calls). |
| Transport hardening | Strict CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `nosniff`, scoped `Permissions-Policy`. |

> The threat model and the rationale behind every choice are documented in [`项目总结.md`](./项目总结.md) (Chinese).

## Architecture

```
┌─────────────────────────────┐
│  Installable PWA (browser)  │
│  • IndexedDB: encrypted pwd │
│  • ONNX: captcha solving    │
│  • HttpOnly cookie: session │
└──────────────┬──────────────┘
               │  /api/*  (same-origin, rate-limited)
┌──────────────▼──────────────┐
│  Stateless server (Vercel)  │
│  • AES-GCM session in cookie│
│  • no database, no PII logs │
└──────────────┬──────────────┘
               │  HTTPS
┌──────────────▼──────────────┐
│  University campus systems  │
│  MIS · CAS · Academic Affairs│
└─────────────────────────────┘
```

## Tech stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Runtime:** Node.js 20+ (Vercel serverless functions)
- **Client ML:** ONNX Runtime Web (captcha model runs on-device)
- **Styling:** plain CSS (no UI framework)
- **Testing:** Node.js built-in test runner
- **Deployment:** Vercel (Hobby) with GitHub auto-deploy

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure the server secret
cp .env.example .env
# then set SESSION_SECRET to a long random string, e.g.:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Run locally
npm run dev        # http://localhost:3000

# 4. Production build
npm run build
```

> The app talks to campus endpoints, so it only works on networks that can reach the university's systems.

## Testing

```bash
npm test                        # 35 regression tests
npx tsc --noEmit                # type check
```

The suite covers captcha-expression evaluation, grade-term mapping, timetable parsing, semester selection, week rules, classroom occupancy, homework pagination and exam diffing.

## Contributing

Issues and pull requests are welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md). For security reports, please follow [`SECURITY.md`](./SECURITY.md).

## License & attribution

This project is released under the **MIT License** — see [`LICENSE`](./LICENSE).

It is a derivative of the open-source Android app **BJTUselfService** (MIT, Copyright © 2024), whose licence and attribution are preserved in [`THIRD-PARTY-LICENSES.txt`](./THIRD-PARTY-LICENSES.txt) and [`NOTICE`](./NOTICE). The captcha ONNX model and university marks are **not** covered by this project's licence.

Developed end-to-end with **OpenAI Codex** as the coding agent.

## 中文简介

「交大自由行」是给北京交通大学学生用的校园信息网页应用（PWA），把**成绩、课表、空闲教室、作业、考试**五项只读信息整合到一个可安装到手机桌面的网页里。

它最大的特点是**服务端无状态、零用户数据**：密码用设备唯一密钥加密后只存在本机浏览器，登录态加密存 HttpOnly Cookie，服务器不落库、不记录、不持久化任何用户数据。因此它既轻量（首屏约 112 KB JS），也把「数据托管风险」降到了最低。
