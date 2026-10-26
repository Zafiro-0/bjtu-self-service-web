import { academicToday, ACADEMIC_TERMS } from "@/shared/campus";
import { DEFAULT_SCHEDULE_TERMS, TERM_START_DATES, extractRedirectAction, filterRoomsByBuilding, hasExamScheduleTable, markExamChanges, parseAaClassroomOccupancy, parseAaSchedule, parseExamSchedule, parseSemesterSelector, roomDayTimeline, selectCurrentScheduleTerm, scheduleWeekCount, semesterSubmission } from "@/shared/campus";
import { API_REQUEST_LIMIT, API_WINDOW_MS, HOMEWORK_BATCH_SIZE, LOGIN_FAILURE_LIMIT, LOGIN_WINDOW_MS, SESSION_MAX_AGE_SECONDS, withRequestTimeout } from "@/shared/auth";

// 该路由是动态、无缓存的校园接口代理。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type StoredCookie = { name: string; value: string; domain: string; hostOnly: boolean; path: string; secure: boolean };
type Session = { id: string; jar: StoredCookie[]; loggedIn?: boolean; cas?: { url: string; csrf: string; captcha0: string }; bksySessionId?: string; examSnapshot?: Record<string, string> };

const agent = "BJTU-Self-Service-Web/1.1";
const SESSION_COOKIE = "sid";
const SESSION_COOKIE_VERSION = "v1";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json;charset=utf-8", "cache-control": "no-store" } });
const clean = (html: string) => html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
const rows = (html: string) => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]/gi)].map(cell => clean(cell[1])));

class HttpError extends Error { constructor(message: string, readonly status = 400, readonly code = "REQUEST_FAILED") { super(message) } }
class CampusReauthError extends HttpError { constructor() { super("校园登录状态已失效，正在自动重新登录。", 401, "CAMPUS_REAUTH_REQUIRED") } }

// ---- 无状态会话：AES-GCM 加密后存 HttpOnly Cookie，服务器不落库 ----
function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("服务会话密钥尚未配置（SESSION_SECRET）。");
  return value;
}
// base64url 仅用于会话 Cookie（URL 安全字符集）；验证码等二进制必须用标准 base64。
function toBase64Url(bytes: Uint8Array) { return Buffer.from(bytes).toString("base64url") }
function toBase64Std(bytes: Uint8Array) { return Buffer.from(bytes).toString("base64") }
function fromBase64(value: string) { return new Uint8Array(Buffer.from(value, "base64url")) }
async function encryptionKey(secret: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)); return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]) }
async function encryptSession(value: Session, secret: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), new TextEncoder().encode(JSON.stringify(value))); return `${SESSION_COOKIE_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}` }
async function decryptSession(value: string, secret: string) { const [version, iv, cipher] = value.split("."); if (version !== SESSION_COOKIE_VERSION || !iv || !cipher) throw new Error("Invalid session payload"); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await encryptionKey(secret), fromBase64(cipher)); return JSON.parse(new TextDecoder().decode(plain)) as Session }
function emptySession(): Session { return { id: crypto.randomUUID(), jar: [] } }
async function readSessionCookie(request: Request) {
  const value = request.headers.get("cookie")?.match(/(?:^|;\s*)sid=([^;]+)/)?.[1];
  if (!value) return emptySession();
  try { return await decryptSession(value, secret()) } catch { return emptySession() }
}
async function sessionCookie(value: Session | null, secure: boolean) {
  const maxAge = value ? SESSION_MAX_AGE_SECONDS : 0;
  const payload = value ? await encryptSession(value, secret()) : "deleted";
  return `${SESSION_COOKIE}=${payload}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function clearCampusSession(session: Session) {
  session.jar = [];
  session.loggedIn = false;
  session.cas = undefined;
  session.bksySessionId = undefined;
  session.examSnapshot = undefined;
}

// ---- 内存限流（尽力而为，跨冷启动重置） ----
type RateWindow = { count: number; startedAt: number };
const loginWindows = new Map<string, RateWindow>();
const apiWindows = new Map<string, RateWindow>();
function hit(map: Map<string, RateWindow>, key: string, windowMs: number, limit: number) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.startedAt >= windowMs) { map.set(key, { count: 1, startedAt: now }); return false }
  entry.count += 1;
  return entry.count > limit;
}
function reset(map: Map<string, RateWindow>, key: string) { map.delete(key) }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") }
async function hmac(value: string, secret: string) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") }

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

function validRequestOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return new URL(request.url).hostname === "localhost";
  return origin === new URL(request.url).origin;
}

// ---- 校园接口代理 ----
function setCookies(session: Session, response: Response, requestUrl: string) {
  const origin = new URL(requestUrl);
  const values: string[] = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
  for (const raw of values) {
    const parts = raw.split(";").map(part => part.trim());
    const separator = parts[0].indexOf("=");
    if (separator < 1) continue;
    const attributes = new Map(parts.slice(1).map(part => { const index = part.indexOf("="); return [index < 0 ? part.toLowerCase() : part.slice(0, index).toLowerCase(), index < 0 ? true : part.slice(index + 1)] as const }));
    const name = parts[0].slice(0, separator);
    const hostOnly = !attributes.has("domain");
    const domain = String(attributes.get("domain") || origin.hostname).replace(/^\./, "").toLowerCase();
    const path = String(attributes.get("path") || "/");
    session.jar = session.jar.filter(cookie => !(cookie.name === name && cookie.domain === domain && cookie.path === path));
    if (attributes.get("max-age") === "0") continue;
    session.jar.push({ name, value: parts[0].slice(separator + 1), domain, hostOnly, path, secure: attributes.has("secure") });
  }
}
function cookieHeader(session: Session, requestUrl: string) {
  const url = new URL(requestUrl);
  return session.jar.filter(cookie => (!cookie.secure || url.protocol === "https:") && url.pathname.startsWith(cookie.path) && (cookie.hostOnly ? url.hostname === cookie.domain : url.hostname === cookie.domain || url.hostname.endsWith(`.${cookie.domain}`))).map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}
async function campus(session: Session, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("user-agent", agent);
  const cookies = cookieHeader(session, url);
  if (cookies) headers.set("cookie", cookies);
  const response = await fetch(url, withRequestTimeout({ ...init, headers, redirect: "manual" }));
  setCookies(session, response, url);
  return response;
}
async function follow(session: Session, initialUrl: string, init: RequestInit = {}) {
  let url = initialUrl;
  let currentInit = init;
  let response = await campus(session, url, currentInit);
  for (let index = 0; index < 8 && [301, 302, 303, 307, 308].includes(response.status); index++) {
    const location = response.headers.get("location");
    if (!location) break;
    url = new URL(location, url).href;
    if (![307, 308].includes(response.status)) currentInit = { headers: currentInit.headers };
    response = await campus(session, url, currentInit);
  }
  return { response, url };
}
async function parseBody(request: Request) { try { return await request.json() as Record<string, string> } catch { return {} } }

// ---- 登录流程（无状态：验证码图片内联返回，cas 存入加密 Cookie） ----
async function start(session: Session) {
  const { response, url } = await follow(session, "https://mis.bjtu.edu.cn/auth/sso/?next=/");
  if (url.includes("/home")) { session.loggedIn = true; return { already: true } }
  const html = await response.text();
  const captcha0 = (html.match(/id=["']id_captcha_0["'][^>]*value=["']([^"']+)/i) || html.match(/name=["']captcha_0["'][^>]*value=["']([^"']+)/i) || [])[1];
  const csrf = (html.match(/name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)/i) || [])[1];
  if (!captcha0 || !csrf) throw new Error("未能打开统一认证页面，请稍后重试。");
  session.cas = { url, csrf, captcha0 };
  const image = await campus(session, `https://mis.bjtu.edu.cn/image/${captcha0}/`);
  if (!image.ok) throw new Error("验证码图片获取失败，请点击“换一张”重试。");
  const captcha = `data:image/png;base64,${toBase64Std(new Uint8Array(await image.arrayBuffer()))}`;
  return { already: false, captcha };
}
async function ensureAa(session: Session) {
  const entry = await follow(session, "https://mis.bjtu.edu.cn/module/module/10/");
  if (entry.url.includes("mis.bjtu.edu.cn")) return;
  const html = await entry.response.text();
  const action = extractRedirectAction(html);
  if (!action) throw new CampusReauthError();
  const next = await follow(session, new URL(action, entry.url).href, { headers: { referer: entry.url } });
  if (!next.url.includes("mis.bjtu.edu.cn")) throw new CampusReauthError();
}

function num(value: unknown) { return Number(String(value || "").replace(/[^0-9.]/g, "")) }
const scoreMap: Record<string, number> = { A: 95, "A-": 87, "B+": 83, B: 79, "B-": 76, "C+": 73, C: 69, "C-": 66, "D+": 63, D: 60, F: 30 };
function score(value: unknown) { const text = String(value || "").trim().toUpperCase(); return scoreMap[text] ?? num(value) }
function point(value: unknown) { const n = score(value); if (n >= 90) return 4; if (n >= 85) return 3.7; if (n >= 81) return 3.3; if (n >= 78) return 3; if (n >= 75) return 2.7; if (n >= 72) return 2.3; if (n >= 68) return 2; if (n >= 65) return 1.5; if (n >= 61) return 1.3; if (n >= 60) return 1; return 0 }
async function grades(session: Session) {
  await ensureAa(session);
  const items: Array<{ year: string; name: string; credits: string; score: string; teacher: string }> = [];
  const responses = await Promise.all(["ln", "lr"].map(type => follow(session, `https://mis.bjtu.edu.cn/score/scores/stu/view/?page=1&perpage=500&ctype=${type}`)));
  for (const response of responses) for (const cells of rows(await response.response.text()).slice(1)) if (cells.length >= 7) items.push({ year: cells[1], name: cells[2], credits: cells[3], score: cells[4], teacher: cells[6] });
  const unique = items.filter((item, index, all) => all.findIndex(other => other.year === item.year && other.name === item.name && other.score === item.score) === index);
  let credits = 0, weightedTotal = 0, points = 0;
  for (const item of unique) { const credit = num(item.credits), numericScore = score(item.score); if (credit && numericScore) { credits += credit; weightedTotal += credit * numericScore; points += credit * point(item.score) } }
  const terms: Record<string, typeof unique> = {};
  for (const item of unique) (terms[item.year] ??= []).push(item);
  return { terms, summary: { weightedAverage: credits ? (weightedTotal / credits).toFixed(2) : "—", gpa: credits ? (points / credits).toFixed(2) : "—" } };
}

async function courses(session: Session, requestedTerm: string | null) {
  await ensureAa(session);
  const baseUrl = "https://mis.bjtu.edu.cn/course_selection/courseselect/stuschedule/";
  const initial = await follow(session, baseUrl);
  const initialHtml = await initial.response.text();
  const selector = parseSemesterSelector(initialHtml);
  const available = selector?.terms.length ? selector.terms : [...DEFAULT_SCHEDULE_TERMS];
  const today = academicToday();
  const selected = selectCurrentScheduleTerm(available, requestedTerm, today.term);
  const desired = selected.value;
  const code = selected.code;
  let parsed: ReturnType<typeof parseAaSchedule> = [];
  if (selected.available) {
    let html = initialHtml;
    if (desired !== selector?.selected) {
      const submission = semesterSubmission(baseUrl, selector || { name: "xnxq", method: "get", action: "" }, desired);
      const init: RequestInit = submission.method === "post"
        ? { method: "POST", body: submission.body, headers: { "content-type": "application/x-www-form-urlencoded", referer: initial.url } }
        : { headers: { referer: initial.url } };
      const response = await follow(session, submission.url, init);
      html = await response.response.text();
    }
    parsed = parseAaSchedule(html);
  }
  const terms = selected.available ? available : [selected, ...available];
  const calendar = ACADEMIC_TERMS.find(term => term.code === code);
  const calendarWeeks = calendar ? Math.ceil((Date.parse(calendar.end) - Date.parse(calendar.start)) / 604800000) : 0;
  return { selectedTerm: desired, code, label: selected?.label || terms[0].label, terms, source: parsed.length ? "MIS 教务系统最终课表" : "MIS 暂未返回该学期课表", startDate: TERM_START_DATES[code] || null, weekCount: Math.max(calendarWeeks, scheduleWeekCount(parsed)), defaultWeek: code === today.term ? today.week : null, calendarMessage: today.message + (code !== today.term ? " · 当前显示历史课表，并非本学期课程" : ""), courses: parsed };
}

async function classrooms(session: Session, building: string, week: number, day: number, period: number) {
  await ensureAa(session);
  const aaUrl = `https://mis.bjtu.edu.cn/classroom/timeholdresult/room_view/?zc=${week}&page=1&perpage=500`;
  const [occupancyResult, peopleResult] = await Promise.allSettled([
    follow(session, aaUrl).then(async result => parseAaClassroomOccupancy(await result.response.text())),
    fetch(`http://yaya.csoci.com:2333/api/classnum/?building=${encodeURIComponent(building)}`, withRequestTimeout({ headers: { "user-agent": agent } })).then(async response => {
      if (!response.ok) throw new Error("人数服务暂不可用");
      return response.json() as Promise<{ time?: string[]; data?: unknown[][] }>;
    }),
  ]);
  const occupancies = occupancyResult.status === "fulfilled" ? filterRoomsByBuilding(occupancyResult.value, building) : [];
  const people = peopleResult.status === "fulfilled" ? peopleResult.value : { time: [], data: [] };
  const peopleByRoom = new Map((people.data || []).map(item => [String(item[0]), { used: Number(item[2]), capacity: Number(item[3]) }]));
  const selectedPeriod = Math.max(1, Math.min(7, period));
  const names = [...new Set([...occupancies.map(item => item.room), ...peopleByRoom.keys()])].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
  return {
    week, day, period, time: people.time || [],
    sources: { occupancy: occupancyResult.status === "fulfilled", people: peopleResult.status === "fulfilled" },
    rooms: names.map(room => {
      const occupancy = occupancies.find(item => item.room === room);
      const live = peopleByRoom.get(room);
      const timeline = occupancy ? roomDayTimeline(occupancy.statuses, day) : [];
      return { room, occupancy: timeline[selectedPeriod - 1]?.code ?? null, timeline, used: Number.isFinite(live?.used) ? live?.used : null, capacity: Number.isFinite(live?.capacity) ? live?.capacity : null };
    }),
  };
}

async function exams(session: Session) {
  await ensureAa(session);
  const result = await follow(session, "https://mis.bjtu.edu.cn/examine/examplanstudent/stulist/");
  if (!result.response.ok || !result.url.includes("mis.bjtu.edu.cn/examine/examplanstudent/stulist")) throw new Error("考试安排页面登录状态已失效，请重新登录。");
  const html = await result.response.text();
  if (!hasExamScheduleTable(html)) throw new Error("教务系统未返回考试安排表，请稍后重试。");
  const changes = markExamChanges(session.examSnapshot || null, parseExamSchedule(html));
  session.examSnapshot = changes.snapshot;
  return changes.items;
}

type BksyCourse = { id: number; name: string };
type HomeworkItem = {
  id: number; course_id: number; course_name: string; title: string; content?: string; create_date: string;
  end_time: string; open_date: string; status: number; subStatus: string; stu_score?: string; snId?: number | null;
};
async function bksyJson<T>(session: Session, url: string) {
  const result = await follow(session, url, { headers: {
    accept: "application/json, text/javascript, */*; q=0.01",
    referer: "https://mis.bjtu.edu.cn",
    "x-requested-with": "XMLHttpRequest",
    ...(session.bksySessionId ? { sessionid: session.bksySessionId } : {}),
  } });
  if (!result.response.ok) throw new Error(`课程平台返回 ${result.response.status}`);
  return await result.response.json() as T;
}
async function ensureBksy(session: Session) {
  await follow(session, "https://mis.bjtu.edu.cn/module/module/28/");
  const message = await bksyJson<{ sessionId?: string }>(session, "https://mis.bjtu.edu.cn/ve/back/coursePlatform/message.shtml?method=getArticleList");
  if (!message.sessionId) throw new CampusReauthError();
  session.bksySessionId = message.sessionId;
}
async function mapLimited<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const result = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return result;
}
async function homeworkCatalog(session: Session) {
  await ensureBksy(session);
  const semester = await bksyJson<{ result?: Array<{ xqCode?: string }> }>(session, "https://mis.bjtu.edu.cn/ve/back/rp/common/teachCalendar.shtml?method=queryCurrentXq");
  const xqCode = semester.result?.find(item => item.xqCode)?.xqCode;
  if (!xqCode) throw new Error("课程平台未返回当前学期。");
  const courses = await bksyJson<{ courseList?: BksyCourse[] }>(session, `https://mis.bjtu.edu.cn/ve/back/coursePlatform/course.shtml?method=getCourseList&pagesize=100&page=1&xqCode=${encodeURIComponent(xqCode)}`);
  return { xqCode, courses: courses.courseList || [] };
}
async function homework(session: Session, cursor: number) {
  const catalog = await homeworkCatalog(session);
  const selected = catalog.courses.slice(cursor, cursor + HOMEWORK_BATCH_SIZE);
  const requests = selected.flatMap(course => [0, 1, 2].map(homeworkType => ({ course, homeworkType })));
  const pages = await mapLimited(requests, 4, async ({ course, homeworkType }) => {
    const result = await bksyJson<{ courseNoteList?: HomeworkItem[] }>(session, `https://mis.bjtu.edu.cn/ve/back/coursePlatform/homeWork.shtml?method=getHomeWorkList&cId=${course.id}&subType=${homeworkType}&page=1&pagesize=100`);
    return (result.courseNoteList || []).map(item => ({
      id: `${homeworkType}-${item.id}`, homeworkType, courseName: item.course_name || course.name, title: item.title,
      endTime: item.end_time, openDate: item.open_date, subStatus: item.subStatus || "未提交", score: item.stu_score || "", pending: item.subStatus !== "已提交",
    }));
  });
  const items = pages.flat().sort((left, right) => Date.parse(left.endTime) - Date.parse(right.endTime));
  const nextCursor = cursor + selected.length < catalog.courses.length ? cursor + selected.length : null;
  return { semester: catalog.xqCode, pendingCount: items.filter(item => item.pending).length, items, nextCursor, totalCourses: catalog.courses.length };
}

// ---- 请求处理 ----
async function respond(request: Request): Promise<Response> {
  if (!validRequestOrigin(request)) return json({ error: "请求来源无效。", code: "ORIGIN_REJECTED" }, 403);
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  let session = await readSessionCookie(request);
  const loggedIn = !!session.loggedIn;

  try {
    let result: Response;
    if (url.pathname === "/api/me") {
      result = json({ loggedIn });
    }
    else if (url.pathname === "/api/auth/start") {
      result = json(await start(session));
    }
    else if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await parseBody(request);
      if (!session.cas || !body.username || !body.password || !body.captcha) throw new Error("请填写学号、密码和验证码。");
      const rateKey = `login:${(await sha256(clientAddress(request))).slice(0, 24)}:${(await hmac(body.username.trim(), secret())).slice(0, 24)}`;
      if (hit(loginWindows, rateKey, LOGIN_WINDOW_MS, LOGIN_FAILURE_LIMIT)) throw new HttpError("登录尝试过多，请 15 分钟后再试。", 429, "LOGIN_RATE_LIMITED");
      const form = new URLSearchParams({ csrfmiddlewaretoken: session.cas.csrf, captcha_0: session.cas.captcha0, captcha_1: body.captcha, loginname: body.username, password: body.password });
      const done = await follow(session, session.cas.url, { method: "POST", body: form, headers: { referer: session.cas.url, origin: "https://mis.bjtu.edu.cn", "content-type": "application/x-www-form-urlencoded" } });
      if (!done.url.includes("mis.bjtu.edu.cn/home")) {
        result = json({ error: "登录失败，请检查账号、密码和验证码。", code: "LOGIN_FAILED" }, 401);
      } else {
        reset(loginWindows, rateKey);
        session.loggedIn = true;
        session.cas = undefined;
        result = json({ ok: true });
      }
    }
    else if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      session = emptySession();
      result = json({ ok: true });
    }
    else if (url.pathname.startsWith("/api/")) {
      if (!loggedIn) {
        result = json({ error: "请先登录。", code: "LOGIN_REQUIRED" }, 401);
      } else if (url.pathname === "/api/grades") {
        if (hit(apiWindows, `api:${session.id}`, API_WINDOW_MS, API_REQUEST_LIMIT)) throw new HttpError("请求过于频繁，请稍后再试。", 429, "RATE_LIMITED");
        result = json(await grades(session));
      } else if (url.pathname === "/api/courses") {
        if (hit(apiWindows, `api:${session.id}`, API_WINDOW_MS, API_REQUEST_LIMIT)) throw new HttpError("请求过于频繁，请稍后再试。", 429, "RATE_LIMITED");
        const term = url.searchParams.get("term");
        result = json(await courses(session, term));
      } else if (url.pathname === "/api/classrooms") {
        if (hit(apiWindows, `api:${session.id}`, API_WINDOW_MS, API_REQUEST_LIMIT)) throw new HttpError("请求过于频繁，请稍后再试。", 429, "RATE_LIMITED");
        const building = url.searchParams.get("building") || "思源楼";
        const week = num(url.searchParams.get("week")) || 1;
        const day = num(url.searchParams.get("day")) || 1;
        const period = num(url.searchParams.get("period")) || 1;
        result = json(await classrooms(session, building, week, day, period));
      } else if (url.pathname === "/api/homework") {
        if (hit(apiWindows, `api:${session.id}`, API_WINDOW_MS, API_REQUEST_LIMIT)) throw new HttpError("请求过于频繁，请稍后再试。", 429, "RATE_LIMITED");
        const cursor = Math.max(0, num(url.searchParams.get("cursor")) || 0);
        result = json(await homework(session, cursor));
      } else if (url.pathname === "/api/exams") {
        if (hit(apiWindows, `api:${session.id}`, API_WINDOW_MS, API_REQUEST_LIMIT)) throw new HttpError("请求过于频繁，请稍后再试。", 429, "RATE_LIMITED");
        result = json(await exams(session));
      }
      else result = json({ error: "Not found" }, 404);
    } else {
      return json({ error: "Not found" }, 404);
    }

    const headers = new Headers(result.headers);
    headers.append("set-cookie", await sessionCookie(session, secure));
    return new Response(result.body, { status: result.status, headers });
  } catch (error) {
    if (error instanceof CampusReauthError) clearCampusSession(session);
    const message = error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name) ? "校园服务连接超时，请稍后重试。" : error instanceof Error ? error.message : "服务请求失败。";
    console.error(JSON.stringify({ route: url.pathname, error: message }));
    const status = error instanceof HttpError ? error.status : 502;
    const code = error instanceof HttpError ? error.code : "UPSTREAM_FAILED";
    const result = json({ error: message, code }, status);
    const headers = new Headers(result.headers);
    headers.append("set-cookie", await sessionCookie(session, secure));
    return new Response(result.body, { status: result.status, headers });
  }
}

export async function GET(request: Request) { return respond(request) }
export async function POST(request: Request) { return respond(request) }
