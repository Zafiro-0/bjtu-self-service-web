import assert from "node:assert/strict";
import test from "node:test";

import {
  API_PATHS,
  BUILDINGS,
  DEFAULT_SCHEDULE_TERMS,
  extractRedirectAction,
  campusDateTimestamp,
  countdownLabel,
  filterExamsByType,
  filterRoomsByBuilding,
  hasExamScheduleTable,
  isCourseActive,
  latestTerm,
  latestScheduleTerm,
  markExamChanges,
  mapAaPeriod,
  normalizeExamList,
  parseAaClassroomOccupancy,
  parseAaSchedule,
  parseExamSchedule,
  roomDayTimeline,
  semesterSubmission,
  parseSemesterSelector,
  pageRequestPath,
  parseWeekRanges,
  scheduleTermCandidates,
  scheduleWeekCount,
  upcomingHomework,
  termDisplayName,
  weekDateRange,
} from "../shared/campus.ts";
import {
  HOMEWORK_BATCH_SIZE,
  calculateCaptcha,
  mergeHomeworkPages,
  withRequestTimeout,
} from "../shared/auth.ts";

test("captcha expressions are evaluated without using eval", () => {
  assert.equal(calculateCaptcha("12+7="), "19");
  assert.equal(calculateCaptcha("9-13="), "-4");
  assert.equal(calculateCaptcha("6*8="), "48");
  assert.equal(calculateCaptcha("alert(1)"), null);
});

test("upstream requests receive a timeout without replacing an existing signal", () => {
  const generated = withRequestTimeout({}, 100);
  assert.ok(generated.signal instanceof AbortSignal);
  const existing = new AbortController().signal;
  assert.equal(withRequestTimeout({ signal: existing }, 100).signal, existing);
});

test("homework pagination stays under the free worker subrequest budget", () => {
  assert.equal(HOMEWORK_BATCH_SIZE, 12);
  assert.deepEqual(mergeHomeworkPages([
    { pendingCount: 2, items: [{ id: 1 }] },
    { pendingCount: 1, items: [{ id: 2 }, { id: 3 }] },
  ]), { pendingCount: 3, items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
});

test("schedule tab calls the existing courses API", () => {
  assert.equal(API_PATHS.schedule, "/api/courses");
});

test("MIS redirect form accepts either attribute order", () => {
  assert.equal(
    extractRedirectAction('<form action="https://mis.bjtu.edu.cn/login" id="redirect">'),
    "https://mis.bjtu.edu.cn/login",
  );
  assert.equal(
    extractRedirectAction('<form id="redirect" method="get" action="/module/10/">'),
    "/module/10/",
  );
});

test("classroom selector contains every building supported by the original app", () => {
  assert.deepEqual(BUILDINGS, [
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
  ]);
});

test("MIS final timetable provides the whole selected term", () => {
  const html = `<table>
    <tr><th>节次</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th><th>日</th></tr>
    <tr><td>第一节</td>
      <td><a>M301001B [01]<br>无线通信基础 [本]<div style="max-width:160px">第1-16周 <i>陈霞</i></div><span class="text-muted">海淀西校区, 思源东楼, SD205</span></a></td>
      <td></td><td></td><td></td><td></td><td></td><td></td>
    </tr><tr><td>第二节</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>第三节</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>第四节</td>
      <td><a>M301002B [02]<br>网络内容安全 [本]<div style="max-width:160px">第1-15周 单 <i>熊菲</i></div><span class="text-muted">海淀西校区, 思源楼, SY309</span></a></td>
      <td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>
  </table>`;
  const courses = parseAaSchedule(html);
  assert.equal(scheduleWeekCount(courses), 16);
  assert.equal(courses.length, 2);
  assert.deepEqual(courses.map(course => course.period), [1, 3]);
  assert.equal(courses[0].courseName, "无线通信基础");
  assert.equal(courses[0].teacher, "陈霞");
  assert.equal(courses[0].classroom, "思源东楼 SD205");
  assert.ok(isCourseActive(courses[0], 16));
  assert.ok(isCourseActive(courses[1], 15));
  assert.ok(!isCourseActive(courses[1], 14));
});

test("MIS timetable rows are periods and columns are weekdays like the friend app", () => {
  const blank = "<td></td>";
  const course = `<td><a>M301118B [02]<br><span>通信原理</span><div style="max-width:160px">第1-16周 <i>陈一帅</i></div><span class="text-muted">海淀西校区, 思源楼, SY309</span></a></td>`;
  const html = `<table><tr><th>节次</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th><th>日</th></tr>
    <tr><td>1</td>${blank.repeat(7)}</tr><tr><td>2</td>${blank.repeat(7)}</tr><tr><td>3</td>${blank.repeat(7)}</tr>
    <tr><td>4</td>${blank}${course}${blank.repeat(5)}</tr><tr><td>5</td>${blank.repeat(7)}</tr></table>`;
  const parsed = parseAaSchedule(html);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].day, 2);
  assert.equal(parsed[0].period, 3);
  assert.equal(parsed[0].courseName, "通信原理");
});

test("MIS timetable parses every sibling course block in the same time slot", () => {
  const blank = "<td></td>";
  const html = `<table><tr><th>节次</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th><th>日</th></tr>
    <tr><td>1</td><td>
      <div>M401147B [04]<br><span>信息论基础(B) [本]</span><br><div style="max-width:120px;">第01-08周 <i>宋政育</i></div><span class="text-muted">海淀西校区, 思源楼, SY206</span></div>
      <div style="margin-top:8px;">M401124B [01]<br><span>网络内容安全 [本]</span><br><div style="max-width:120px;">第09-16周 <i>熊菲</i></div><span class="text-muted">海淀西校区, 思源楼, SY309</span></div>
    </td>${blank.repeat(6)}</tr></table>`;
  const parsed = parseAaSchedule(html);
  assert.deepEqual(parsed.map(course => [course.courseName, course.teacher, course.weekText]), [
    ["信息论基础(B)", "宋政育", "1-8周"],
    ["网络内容安全", "熊菲", "9-16周"],
  ]);
});

test("all five tabs have real API routes", () => {
  assert.equal(pageRequestPath("homework"), "/api/homework");
  assert.equal(pageRequestPath("classrooms"), null);
  assert.equal(pageRequestPath("grades"), "/api/grades");
  assert.equal(pageRequestPath("exams"), "/api/exams");
});

test("grade terms use year names and default to the latest term", () => {
  assert.equal(termDisplayName("2025-2026-1"), "大三上");
  assert.equal(termDisplayName("2025-2026-2"), "大三下");
  assert.equal(latestTerm(["2024-2025-2", "2025-2026-1", "2023-2024-1"]), "2025-2026-1");
});

test("AA periods map to the user's four daytime blocks", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(mapAaPeriod), [1, 2, null, 3, 4, null, null]);
});

test("AA week ranges retain all, odd, and even week rules", () => {
  assert.deepEqual(parseWeekRanges("第1-8周 第9-15周单 第10-16周双"), [
    { start: 1, end: 8, type: "all" },
    { start: 9, end: 15, type: "odd" },
    { start: 10, end: 16, type: "even" },
  ]);
});

test("week 1 begins on the supplied Monday", () => {
  assert.equal(weekDateRange("2026-03-02", 1), "3月2日–3月8日");
  assert.equal(weekDateRange("2026-03-02", 12), "5月18日–5月24日");
});

test("historical schedule selector preserves the MIS form contract", () => {
  const html = `<form method="post" action="/course_selection/courseselect/stuschedule/">
    <select name="xnxq"><option value="2025-2026-1">2025-2026-1</option><option selected value="2025-2026-2">2025-2026-2</option></select>
  </form>`;
  assert.deepEqual(parseSemesterSelector(html), {
    name: "xnxq",
    method: "post",
    action: "/course_selection/courseselect/stuschedule/",
    selected: "2025-2026-2",
    terms: [
      { value: "2025-2026-1", code: "2025-2026-1", label: "大三上" },
      { value: "2025-2026-2", code: "2025-2026-2", label: "大三下" },
    ],
  });
});

test("friend-app fallback terms include the requested junior fall value", () => {
  assert.deepEqual(latestScheduleTerm(DEFAULT_SCHEDULE_TERMS), {
    value: "2025-2026-2-2", code: "2025-2026-2", label: "大三下",
  });
});

test("semester selector is still found when MIS renders it outside other forms", () => {
  const html = `<form action="/search"><select name="building"><option value="1">一教</option></select></form>
    <select name="xnxq"><option selected value="2025-2026-1">2025-2026-1</option></select>`;
  assert.deepEqual(parseSemesterSelector(html), {
    name: "xnxq", method: "get", action: "", selected: "2025-2026-1",
    terms: [{ value: "2025-2026-1", code: "2025-2026-1", label: "大三上" }],
  });
});

test("semester selector preserves MIS internal values and derives the academic term from its label", () => {
  const html = `<select name="xnxq">
    <option selected value="844">2025-2026学年第一学期</option>
    <option value="845">2025-2026学年第二学期</option>
  </select>`;
  assert.deepEqual(parseSemesterSelector(html), {
    name: "xnxq", method: "get", action: "", selected: "844",
    terms: [
      { value: "844", code: "2025-2026-1", label: "大三上" },
      { value: "845", code: "2025-2026-2", label: "大三下" },
    ],
  });
});

test("xnxq uses the friend app GET compatibility branch even inside a POST form", () => {
  assert.deepEqual(semesterSubmission("https://mis.bjtu.edu.cn/course_selection/courseselect/stuschedule/", {
    name: "xnxq", method: "post", action: "/wrong-page/",
  }, "2025-2026-1"), {
    url: "https://mis.bjtu.edu.cn/course_selection/courseselect/stuschedule/?xnxq=2025-2026-1",
    method: "get",
    body: null,
  });
});

test("exam table maps the five fields used by the friend app", () => {
  const html = `<table><tbody><tr><td>1</td><td>期末</td><td>通信原理</td><td>2026-06-20 09:00 思源楼 SY101</td><td>正常</td><td>闭卷</td></tr></tbody></table>`;
  assert.deepEqual(parseExamSchedule(html), [{ type: "期末", courseName: "通信原理", timePlace: "2026-06-20 09:00 思源楼 SY101", status: "正常", detail: "闭卷" }]);
  assert.equal(hasExamScheduleTable(html), true);
  assert.equal(hasExamScheduleTable("<html><form>重新登录</form></html>"), false);
});

test("exam page ignores stale object data from the previous tab", () => {
  const exams = [{ courseName: "通信原理", timePlace: "2026-06-20 09:00" }];
  assert.equal(normalizeExamList(exams), exams);
  assert.deepEqual(normalizeExamList({ pendingCount: 3, items: [] }), []);
  assert.deepEqual(normalizeExamList(null), []);
});

test("AA classroom matrix keeps every room and can filter Yifu building", () => {
  const cells = Array.from({ length: 49 }, (_, index) => `<td style="${index === 0 ? "background:#e46868" : ""}"></td>`).join("");
  const html = `<table><tr><th>head</th></tr><tr><th>head2</th></tr><tr><td>YF101 逸夫</td>${cells}</tr><tr><td>SY101 思源</td>${cells}</tr></table>`;
  const rooms = parseAaClassroomOccupancy(html);
  assert.equal(rooms.length, 2);
  assert.equal(rooms[0].statuses.length, 49);
  assert.equal(rooms[0].statuses[0], 1);
  assert.deepEqual(filterRoomsByBuilding(rooms, "逸夫教学楼").map(room => room.room), ["YF101"]);
});

test("classroom query returns all seven periods for future occupancy", () => {
  const statuses = Array.from({ length: 49 }, () => 0);
  statuses.splice(7, 7, 0, 1, 2, 3, 4, 5, 0);
  assert.deepEqual(roomDayTimeline(statuses, 2).map(item => item.code), [0, 1, 2, 3, 4, 5, 0]);
  assert.deepEqual(roomDayTimeline(statuses, 2).map(item => item.label), ["空闲", "非上课", "排课", "考试", "调课", "其他", "空闲"]);
});

test("schedule falls back from an empty selected term to the nearest earlier term", () => {
  const terms = [
    { value: "846", code: "2026-2027-1", label: "大四上" },
    { value: "845", code: "2025-2026-2", label: "大三下" },
    { value: "844", code: "2025-2026-1", label: "大三上" },
  ];
  assert.deepEqual(scheduleTermCandidates(terms, "846", null).map(term => term.value), ["846", "845", "844"]);
  assert.deepEqual(scheduleTermCandidates(terms, "846", "844").map(term => term.value), ["844"]);
});

test("campus dates and countdowns support the timetable text used by AA", () => {
  const start = campusDateTimestamp("2026年8月22日 09:00 思源楼 SY101");
  assert.equal(start, Date.parse("2026-08-22T09:00:00+08:00"));
  assert.equal(countdownLabel(start, Date.parse("2026-08-20T06:30:00+08:00")), "剩余2天2小时");
  assert.equal(countdownLabel(start, Date.parse("2026-08-22T10:00:00+08:00")), "已开始");
});

test("homework reminder keeps only nearest pending future deadlines", () => {
  const now = Date.parse("2026-08-20T08:00:00+08:00");
  const items = [
    { id: "done", pending: false, endTime: "2026-08-20 09:00" },
    { id: "later", pending: true, endTime: "2026-08-23 08:00" },
    { id: "expired", pending: true, endTime: "2026-08-19 08:00" },
    { id: "next", pending: true, endTime: "2026-08-21 08:00" },
  ];
  assert.deepEqual(upcomingHomework(items, now, 2).map(item => item.id), ["next", "later"]);
});

test("exam type filtering preserves the complete list for the all option", () => {
  const items = [{ type: "期末", courseName: "通信原理" }, { type: "补考", courseName: "高等数学" }];
  assert.equal(filterExamsByType(items, "全部"), items);
  assert.deepEqual(filterExamsByType(items, "补考"), [items[1]]);
});

test("exam changes are detected without treating the first sync as a change", () => {
  const first = [{ type: "期末", courseName: "通信原理", timePlace: "2026-06-20 09:00", status: "正常", detail: "闭卷" }];
  assert.deepEqual(markExamChanges(null, first).items.map(item => item.changed), [false]);
  const next = [{ ...first[0], timePlace: "2026-06-21 09:00" }, { type: "补考", courseName: "高等数学", timePlace: "2026-07-01 09:00", status: "正常", detail: "闭卷" }];
  assert.deepEqual(markExamChanges(markExamChanges(null, first).snapshot, next).items.map(item => item.changed), [true, true]);
});
