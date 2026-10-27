import test from 'node:test';
import assert from 'node:assert/strict';
import * as campus from '../shared/campus.ts';

test('current AA timetable preserves four occurrences and stops eight-week courses after week eight', () => {
 const blank='<td></td>';
 const cell=(name,teacher,room)=>`<td><div>M401000B [02]<br><span>${name} [本]</span><br><div style="max-width:120px;">第01-08周 <i>${teacher}</i></div><span class="text-muted">海淀西校区, ${room}</span></div></td>`;
 const ai=cell('人工智能的网络应用','示例教师甲','逸夫教学楼, YF508');
 const fpga=cell('FPGA课程设计','示例教师乙','第九教学楼, 南413西');
 const html=`<table><tr><th>节次</th><th>一</th><th>二</th><th>三</th><th>四</th><th>五</th><th>六</th><th>日</th></tr><tr><td>第1节 [08:00-09:50]</td>${blank.repeat(2)}${ai}${blank}${fpga}${blank.repeat(2)}</tr><tr><td>第2节 [10:10-12:00]</td>${ai}${fpga}${blank.repeat(5)}</tr></table>`;
 const courses=campus.parseAaSchedule(html);
 assert.deepEqual(courses.map(c=>[c.day,c.period,c.courseName]),[[3,1,'人工智能的网络应用'],[5,1,'FPGA课程设计'],[1,2,'人工智能的网络应用'],[2,2,'FPGA课程设计']]);
 assert.equal(courses[0].teacher,'示例教师甲');
 assert.equal(courses[1].classroom,'第九教学楼 南413西');
 assert.equal(courses.filter(c=>campus.isCourseActive(c,2)).length,4);
 assert.equal(courses.filter(c=>campus.isCourseActive(c,8)).length,4);
 assert.equal(courses.filter(c=>campus.isCourseActive(c,9)).length,0);
});

test('real AA button and semester links identify selected fall rather than the first future term', () => {
 const html='<div class="inline dropdown-hover"><button class="btn">2026-2027-1 学期<i></i></button><ul><li><a href="?xnxq=2026-2027-2-2">2026-2027-2 学期</a></li><li><a href="?xnxq=2026-2027-1-2">2026-2027-1 学期</a></li><li><a href="?xnxq=2025-2026-2-2">2025-2026-2 学期</a></li></ul></div>';
 const selector=campus.parseSemesterSelector(html);
 assert.equal(selector?.selected,'2026-2027-1-2');
 assert.equal(selector?.terms[1].label,'大四上');
 assert.equal(selector?.terms.length,3);
 assert.equal(campus.semesterSubmission('https://mis.bjtu.edu.cn/course_selection/courseselect/stuschedule/',selector,'2025-2026-2-2').url,'https://mis.bjtu.edu.cn/course_selection/courseselect/stuschedule/?xnxq=2025-2026-2-2');
});

test('default timetable never substitutes a historical term for the current one', () => {
  assert.equal(typeof campus.selectCurrentScheduleTerm, 'function');
  const old={value:'old',code:'2025-2026-2',label:'大三下'};
  const current={value:'real-aa-id',code:'2026-2027-1',label:'大四上'};
  assert.deepEqual(campus.selectCurrentScheduleTerm([old,current],null,'2026-2027-1'),{...current,available:true});
  const missing=campus.selectCurrentScheduleTerm([old],null,'2026-2027-1');
  assert.equal(missing.code,'2026-2027-1');
  assert.equal(missing.available,false);
  assert.deepEqual(campus.selectCurrentScheduleTerm([old,current],'old','2026-2027-1'),{...old,available:true});
  assert.equal(campus.selectCurrentScheduleTerm([old],null,null).available,false);
});

test('unselected teaching week shows neither undated courses nor a date range', () => {
  assert.equal(campus.isCourseActive({ weeks: [] }, 0), false);
  assert.equal(campus.isCourseActive({ weeks: [{ start: 1, end: 16 }] }, 0), false);
  assert.equal(campus.weekDateRange('2026-03-02', 0), '');
  assert.equal(campus.isCourseActive({ weeks: [] }, 12), true);
  assert.equal(campus.weekDateRange('2026-03-02', 12), '5月18日–5月24日');
});

test('school calendar resolves Shanghai date, current term and week', () => {
  assert.equal(typeof campus.academicToday, 'function');
  const today = campus.academicToday(Date.parse('2026-09-13T16:01:00Z'));
  assert.equal(today.term, '2026-2027-1');
  assert.equal(today.week, 2);
  assert.equal(today.day, 1);
  assert.equal(today.date, '2026-09-14');
});
test('Sunday is week one; holidays and uncovered dates have no teaching week', () => {
  assert.equal(typeof campus.academicToday, 'function');
  assert.equal(campus.academicToday(Date.parse('2026-09-13T12:00:00+08:00')).week, 1);
  assert.equal(campus.academicToday(Date.parse('2026-08-15T12:00:00+08:00')).week, null);
  assert.equal(campus.academicToday(Date.parse('2027-09-15T12:00:00+08:00')).term, null);
});
test('selected historical semester does not borrow the current semester week', () => {
  assert.equal(typeof campus.academicToday, 'function');
  assert.equal(campus.academicToday(Date.parse('2026-05-18T12:00:00+08:00')).week, 12);
  assert.equal(campus.academicToday(Date.parse('2026-03-02T12:00:00+08:00')).week, 1);
});
