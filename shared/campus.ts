export const API_PATHS = {
  grades: "/api/grades",
  classrooms: "/api/classrooms",
  schedule: "/api/courses",
  homework: "/api/homework",
  exams: "/api/exams",
} as const;

export function pageRequestPath(page: keyof typeof API_PATHS) {
  return page === "classrooms" ? null : API_PATHS[page];
}

export function termDisplayName(term: string) {
  const match = term.match(/^(\d{4})-\d{4}-([12])$/);
  if (!match) return term;
  const grade = Number(match[1]) - 2023 + 1;
  const names = ["", "大一", "大二", "大三", "大四"];
  return names[grade] ? `${names[grade]}${match[2] === "1" ? "上" : "下"}` : term;
}

export function latestTerm(terms: string[]) {
  return [...terms].sort((left, right) => {
    const score = (value: string) => { const match = value.match(/^(\d{4})-\d{4}-([12])$/); return match ? Number(match[1]) * 2 + Number(match[2]) : -1 };
    return score(right) - score(left);
  })[0] || "";
}

export function latestScheduleTerm<T extends { code: string }>(terms: ReadonlyArray<T>) {
  const code = latestTerm(terms.map(term => term.code));
  return terms.find(term => term.code === code);
}

export function selectCurrentScheduleTerm(terms: ReadonlyArray<{value:string;code:string;label:string}>, requested: string | null, currentCode: string | null) {
  const selected = requested ? terms.find(term => term.value === requested) : terms.find(term => term.code === currentCode);
  if (selected) return {...selected, available:true};
  if (requested) throw new Error("教务系统未提供所选学期，请刷新后重新选择。");
  return {value:`calendar:${currentCode || "unknown"}`,code:currentCode || "",label:currentCode ? termDisplayName(currentCode) : "当前学期待确认",available:false};
}

export function scheduleTermCandidates<T extends { value: string; code: string }>(terms: ReadonlyArray<T>, selected: string | null, requested: string | null) {
  if (requested) return terms.filter(term => term.value === requested);
  const ordered = [...terms].sort((left, right) => {
    const latest = latestTerm([left.code, right.code]);
    return latest === left.code ? -1 : latest === right.code ? 1 : 0;
  });
  const current = terms.find(term => term.value === selected);
  return current ? [current, ...ordered.filter(term => term.value !== current.value)] : ordered;
}

export function campusDateTimestamp(value: string) {
  const match = String(value || "").match(/(\d{4})\s*(?:[-/.]|年)\s*(\d{1,2})\s*(?:[-/.]|月)\s*(\d{1,2})\s*日?\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const timestamp = Date.parse(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+08:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function countdownLabel(timestamp: number | null, now = Date.now()) {
  if (timestamp === null) return "时间待定";
  const difference = timestamp - now;
  if (difference <= 0) return "已开始";
  const totalMinutes = Math.floor(difference / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor(totalMinutes % (24 * 60) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `剩余${days}天${hours ? `${hours}小时` : ""}`;
  if (hours) return `剩余${hours}小时${minutes ? `${minutes}分钟` : ""}`;
  return `剩余${Math.max(1, minutes)}分钟`;
}

export function upcomingHomework<T extends { pending?: boolean; endTime?: string }>(items: ReadonlyArray<T>, now = Date.now(), limit = 3) {
  return items.map(item => ({ item, timestamp: campusDateTimestamp(item.endTime || "") }))
    .filter(entry => entry.item.pending && entry.timestamp !== null && entry.timestamp > now)
    .sort((left, right) => left.timestamp! - right.timestamp!)
    .slice(0, limit)
    .map(entry => entry.item);
}

export function filterExamsByType<T extends { type?: string }>(items: ReadonlyArray<T>, type: string) {
  return type === "全部" ? items : items.filter(item => item.type === type);
}

type ExamRecord = { type?: string; courseName?: string; timePlace?: string; status?: string; detail?: string };
const examKey = (item: ExamRecord) => `${item.type || ""}\u0000${item.courseName || ""}`;
const examSignature = (item: ExamRecord) => `${item.timePlace || ""}\u0000${item.status || ""}\u0000${item.detail || ""}`;
export function markExamChanges<T extends ExamRecord>(previous: Record<string, string> | null, items: ReadonlyArray<T>) {
  const snapshot = Object.fromEntries(items.map(item => [examKey(item), examSignature(item)]));
  return {
    snapshot,
    items: items.map(item => ({ ...item, changed: previous ? previous[examKey(item)] !== examSignature(item) : false })),
  };
}

export function mapAaPeriod(period: number) {
  return ({ 1: 1, 2: 2, 4: 3, 5: 4 } as Record<number, number>)[period] || null;
}

export function parseWeekRanges(value: string) {
  const weeks: Array<{ start: number; end: number; type: "all" | "odd" | "even" }> = [];
  for (const match of value.matchAll(/(?:第)?\s*(\d+)\s*(?:[-—~至]\s*(\d+))?\s*周\s*[（(]?\s*([单双])?/g)) {
    weeks.push({ start: Number(match[1]), end: Number(match[2] || match[1]), type: match[3] === "单" ? "odd" : match[3] === "双" ? "even" : "all" });
  }
  return weeks;
}

export type ScheduleCourse = {
  day: number;
  period: number;
  courseName: string;
  teacher: string;
  classroom: string;
  weekText: string;
  weeks: ReturnType<typeof parseWeekRanges>;
};

const cleanHtml = (html: string) => html
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, " ")
  .trim();

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || "";

function academicTermCode(value: string, label: string) {
  const direct = value.match(/^(\d{4})-(\d{4})-([12])(?:-\d+)?$/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const years = `${value} ${label}`.match(/(\d{4})\s*[-–—]\s*(\d{4})/);
  if (!years) return null;
  const semester = /第?\s*(一|1)\s*学期|秋季学期/.test(label)
    ? "1"
    : /第?\s*(二|2)\s*学期|春季学期/.test(label)
      ? "2"
      : null;
  return semester ? `${years[1]}-${years[2]}-${semester}` : null;
}

export function parseSemesterSelector(html: string) {
  const formBlocks = [...html.matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/gi)].map(match => ({ tag: match[1], body: match[2] }));
  const outsideForms = html.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "");
  const candidates = [...formBlocks, { tag: "", body: outsideForms }];
  const findSelector = (namedOnly: boolean) => {
    for (const form of candidates) {
      const selects = [...form.body.matchAll(/(<select\b[^>]*>)([\s\S]*?)<\/select>/gi)];
      for (const select of selects) {
      const name = attribute(select[1], "name") || attribute(select[1], "id");
      if (namedOnly !== /^(xnxq|term|xq|semester)$/i.test(name)) continue;
      const options = [...select[2].matchAll(/(<option\b[^>]*>)([\s\S]*?)<\/option>/gi)].map(option => ({
        value: attribute(option[1], "value"),
        rawLabel: cleanHtml(option[2]),
        selected: /\bselected\b/i.test(option[1]),
      })).filter(option => option.value);
      if (!options.length) continue;
      return {
        name: name || "xnxq",
        method: attribute(form.tag, "method").toLowerCase() === "post" ? "post" as const : "get" as const,
        action: attribute(form.tag, "action"),
        selected: options.find(option => option.selected)?.value || options[0].value,
        terms: options.map(option => {
          const code = academicTermCode(option.value, option.rawLabel);
          return { value: option.value, code: code || option.value, label: code ? termDisplayName(code) : option.rawLabel || option.value };
        }),
      };
      }
    }
    return null;
  };
  const select = findSelector(true) || findSelector(false);
  if (select) return select;
  // AA's final timetable uses a button plus ?xnxq= links, not a native select.
  const links = [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)];
  const terms = links.flatMap(link => {
    const href = attribute(link[1], "href").replace(/&amp;/g, "&");
    const value = new URL(href, "https://mis.bjtu.edu.cn/").searchParams.get("xnxq");
    if (!value) return [];
    const code = academicTermCode(value, cleanHtml(link[2]));
    return code ? [{ value, code, label: termDisplayName(code) }] : [];
  }).filter((term,index,all) => all.findIndex(other => other.value === term.value) === index);
  if (!terms.length) return null;
  const currentCode = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
    .map(button => cleanHtml(button[1]).match(/(\d{4}-\d{4}-[12])\s*学期/)?.[1]).find(Boolean);
  return { name: "xnxq", method: "get" as const, action: "", selected: terms.find(term => term.code === currentCode)?.value || "", terms };
}

type SemesterForm = { name: string; method: "get" | "post"; action: string };
export function semesterSubmission(baseUrl: string, form: SemesterForm, term: string) {
  const target = new URL(baseUrl);
  if (form.method === "post" && form.name !== "xnxq") {
    return { url: target.href, method: "post" as const, body: new URLSearchParams({ [form.name]: term }).toString() };
  }
  target.searchParams.set(form.name, term);
  return { url: target.href, method: "get" as const, body: null };
}

export function parseExamSchedule(html: string) {
  const body = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || html;
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => cleanHtml(cell[1])),
  ).filter(cells => cells.length >= 6).map(cells => ({
    type: cells[1], courseName: cells[2], timePlace: cells[3], status: cells[4], detail: cells[5],
  }));
}

export function normalizeExamList(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function hasExamScheduleTable(html: string) {
  return /<table\b[^>]*>[\s\S]*?<tbody\b/i.test(html);
}

export type ClassroomOccupancy = { room: string; statuses: number[] };
const occupancyColors: Record<string, number> = { "#e46868": 1, "#9e6868": 2, "#394ed6": 3, "#77bf6d": 4, "#d8cc56": 5 };
const occupancyLabels = ["空闲", "非上课", "排课", "考试", "调课", "其他"];

export const AA_PERIODS = [
  { id: 1, time: "08:00–10:00" },
  { id: 2, time: "10:00–12:20" },
  { id: 3, time: "12:20–14:10" },
  { id: 4, time: "14:10–16:10" },
  { id: 5, time: "16:10–18:10" },
  { id: 6, time: "19:00–21:00" },
  { id: 7, time: "21:00–22:00" },
] as const;

export function roomDayTimeline(statuses: ReadonlyArray<number>, day: number) {
  const offset = (Math.max(1, Math.min(7, day)) - 1) * 7;
  return AA_PERIODS.map((period, index) => {
    const code = statuses[offset + index] || 0;
    return { ...period, code, label: occupancyLabels[code] || "未知" };
  });
}

export function parseAaClassroomOccupancy(html: string): ClassroomOccupancy[] {
  const table = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(2).flatMap(row => {
    const cells = [...row[1].matchAll(/(<td\b[^>]*>)([\s\S]*?)<\/td>/gi)];
    if (cells.length < 50) return [];
    const room = cleanHtml(cells[0][2]).split(/\s+/)[0];
    const statuses = cells.slice(1, 50).map(cell => {
      const style = attribute(cell[1], "style").toLowerCase();
      return Object.entries(occupancyColors).find(([color]) => style.includes(color))?.[1] || 0;
    });
    return room ? [{ room, statuses }] : [];
  });
}

export function filterRoomsByBuilding(rooms: ReadonlyArray<ClassroomOccupancy>, building: string) {
  const matches = (room: string) => {
    if (building === "思源楼") return room.startsWith("SY");
    if (building === "思源东楼") return room.startsWith("SD");
    if (building === "思源西楼") return room.startsWith("SX");
    if (building === "逸夫教学楼") return room.startsWith("YF");
    if (building === "东区二教") return room.startsWith("DQ2") && room.length >= 6;
    if (building === "东区一教") return room.startsWith("DQ") && !(room.startsWith("DQ2") && room.length >= 6);
    if (building === "第八教学楼") return room.startsWith("8") || room.includes("八教");
    if (building === "第五教学楼") return room.startsWith("5") || room.includes("五教") || room.includes("阶梯") || room === "东阶梯";
    if (building === "机械楼") return room.startsWith("Z") || room.includes("机械");
    if (building === "第九教学楼") return /^(东|中|西|北)/.test(room) || room.includes("九教") || room.includes("报告厅");
    if (building === "第十七号教学楼") return (/^\d/.test(room) && !room.startsWith("8") && !room.startsWith("5")) || room.includes("十七");
    return true;
  };
  return rooms.filter(item => matches(item.room));
}

const stripBrackets = (value: string) => value
  .replace(/\s*(?:\[[^\n]*?]|【[^】]*】)\s*/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function parseCourseBlock(block: string, day: number, sourcePeriod: number): ScheduleCourse | null {
  const period = mapAaPeriod(sourcePeriod);
  if (!period) return null;
  const inner = block.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || block;
  const afterId = inner.replace(/^[\s\S]*?<br\s*\/?>/i, "");
  const beforeDetails = afterId
    .split(/<div\b[^>]*(?:max-width|style)/i)[0]
    .replace(/<span[^>]*text-muted[^>]*>[\s\S]*?<\/span>/gi, "");
  const courseName = stripBrackets(cleanHtml(beforeDetails));
  const details = inner.match(/<div\b[^>]*(?:max-width|style)[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  const teacher = stripBrackets(cleanHtml(details.match(/<i\b[^>]*>([\s\S]*?)<\/i>/i)?.[1] || ""));
  const classroom = cleanHtml(inner.match(/<span[^>]*text-muted[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "")
    .replace(/^海淀西校区[，,\s]*/, "")
    .replace(/[，,]\s*/g, " ");
  const weeks = parseWeekRanges(cleanHtml(details));
  const weekText = weeks.map(range => `${range.start}${range.end === range.start ? "" : `-${range.end}`}周${range.type === "odd" ? "（单周）" : range.type === "even" ? "（双周）" : ""}`).join("、");
  return courseName ? { day, period, courseName, teacher: teacher || "—", classroom: classroom || "—", weekText, weeks } : null;
}

function directElementBlocks(html: string) {
  const blocks: string[] = [];
  const voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const tags = /<\/?([a-z][\w:-]*)\b[^>]*>/gi;
  let depth = 0;
  let start = -1;
  for (const match of html.matchAll(tags)) {
    const token = match[0];
    const tag = match[1].toLowerCase();
    const closing = token.startsWith("</");
    const selfClosing = token.endsWith("/>") || voidElements.has(tag);
    if (!closing) {
      if (depth === 0 && !selfClosing) start = match.index!;
      if (!selfClosing) depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push(html.slice(start, match.index! + token.length));
        start = -1;
      }
    }
  }
  return blocks;
}

export function parseAaSchedule(html: string) {
  const table = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const courseRows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1, 9);
  const courses: ScheduleCourse[] = [];
  courseRows.forEach((row, sourcePeriodIndex) => {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].slice(-7);
    cells.forEach((cell, dayIndex) => {
      const children = directElementBlocks(cell[1]);
      for (const block of children.length ? children : [cell[1]]) {
        const course = parseCourseBlock(block, dayIndex + 1, sourcePeriodIndex + 1);
        if (course) courses.push(course);
      }
    });
  });
  return courses;
}

export function scheduleWeekCount(courses: ReadonlyArray<ScheduleCourse>) {
  return Math.max(16, ...courses.flatMap(course => course.weeks.map(range => range.end)));
}

type CourseWeeks = { weeks?: ReadonlyArray<{ start: number; end: number; type?: "all" | "odd" | "even" }> };
export function isCourseActive(course: CourseWeeks, week: number) {
  if (!Number.isInteger(week) || week < 1) return false;
  if (!course.weeks?.length) return true;
  return course.weeks.some(range => week >= range.start && week <= range.end && (range.type === "odd" ? week % 2 === 1 : range.type === "even" ? week % 2 === 0 : true));
}

export function weekDateRange(startDate: string, week: number) {
  if (!Number.isInteger(week) || week < 1) return "";
  const monday = new Date(`${startDate}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const label = (date: Date) => `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  return `${label(monday)}–${label(sunday)}`;
}

export const BUILDINGS = [
  "第十七号教学楼",
  "思源楼",
  "思源西楼",
  "思源东楼",
  "第九教学楼",
  "第八教学楼",
  "第五教学楼",
  "逸夫教学楼",
  "机械楼",
  "东区二教",
  "东区一教",
] as const;

export function extractRedirectAction(html: string) {
  const forms = html.match(/<form\b[^>]*>/gi) || [];
  for (const form of forms) {
    if (!/\bid\s*=\s*["']redirect["']/i.test(form)) continue;
    return form.match(/\baction\s*=\s*["']([^"']+)["']/i)?.[1] || null;
  }
  return null;
}

export const DEFAULT_SCHEDULE_TERMS = [
  { value: "2025-2026-2-2", code: "2025-2026-2", label: "大三下" },
  { value: "2025-2026-1-2", code: "2025-2026-1", label: "大三上" },
  { value: "2024-2025-2-2", code: "2024-2025-2", label: "大二下" },
  { value: "2024-2025-1-2", code: "2024-2025-1", label: "大二上" },
  { value: "2023-2024-2-2", code: "2023-2024-2", label: "大一下" },
  { value: "2023-2024-1-2", code: "2023-2024-1", label: "大一上" },
] as const;
// Verified 2026-09-14 against the undergraduate calendar. Unknown years must not be guessed.
export const CALENDAR_SOURCE = "https://bksy.bjtu.edu.cn/Admin/SemesterTranPage.aspx";
export const ACADEMIC_TERMS = [
  { code: "2025-2026-1", start: "2025-09-08", end: "2026-01-19", next: "2026-03-02" },
  { code: "2025-2026-2", start: "2026-03-02", end: "2026-07-06", next: "2026-09-07" },
  { code: "2026-2027-1", start: "2026-09-07", end: "2027-01-18", next: "2027-03-01" },
] as const;
export const TERM_START_DATES: Record<string, string> = Object.fromEntries(ACADEMIC_TERMS.map(term => [term.code, term.start]));

export function academicToday(now = Date.now()) {
  const local = new Date(now + 8 * 60 * 60 * 1000);
  const date = local.toISOString().slice(0, 10);
  const day = local.getUTCDay() || 7;
  const term = ACADEMIC_TERMS.find(item => date >= item.start && date < item.next);
  const week = term && date < term.end ? Math.floor((Date.parse(date) - Date.parse(term.start)) / 604800000) + 1 : null;
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const starts = [480, 600, 740, 850, 970, 1140, 1260];
  const period = Math.max(1, starts.filter(start => start <= minutes).length);
  const message = !term ? `${date} · 校历尚未覆盖此日期，请手动选择` : week === null
    ? `${date} · ${term.code} · 寒假或夏季学期，请手动核对排课`
    : `${date} · ${term.code} · 第 ${week} 周 · 周${"一二三四五六日"[day - 1]}`;
  return { date, day, period, term: term?.code ?? null, week, message };
}
