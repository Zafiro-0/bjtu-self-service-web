# Contributing

Thanks for your interest. This project is a small, deliberately simple codebase; contributions that keep it that way are very welcome.

## Ground rules

1. **Read-only scope.** The app only reads grades, timetable, classroom availability, homework and exams. Pull requests that add write actions (enrolment, submission, payments) will be declined.
2. **No server-side user data.** Any change that stores user data on the server (databases, caches, logs containing credentials or personal data) contradicts the project's core design and will be declined.
3. **No secrets in the repo.** Never commit `.env`, `outputs/` or any credential material.

## Local workflow

```bash
npm install
npm test                    # must pass
npx tsc --noEmit            # must be clean
npm run build               # must compile without campus credentials
npm run dev
```

Use a current Node.js 22 installation (`.nvmrc`). Prefer `npm ci` when reproducing the lockfile. CI runs tests, type checking and a production build on pushes and pull requests to `main`. These checks do not authenticate to university services; see [maintenance status](docs/maintenance.md) for live acceptance work.

## Pull requests

- Keep changes focused; one concern per PR.
- Add or update a regression test for any parser or behaviour change.
- Describe *why* the change is needed, not only *what* changed.
- Do not reformat unrelated files.

## Reporting bugs

Open an issue with: steps to reproduce, expected vs. actual behaviour, and the platform (iOS/Android/desktop, browser version). **Never paste real student IDs, passwords or grades** — redact them.

## Security issues

Do not open a public issue. Follow [`SECURITY.md`](./SECURITY.md).
