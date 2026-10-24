"use client";
import { FormEvent, Fragment, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { academicToday, CALENDAR_SOURCE, AA_PERIODS, BUILDINGS, campusDateTimestamp, countdownLabel, filterExamsByType, isCourseActive, latestTerm, normalizeExamList, pageRequestPath, termDisplayName, upcomingHomework, weekDateRange, type ScheduleCourse } from "../shared/campus";
import { mergeHomeworkPages } from "../shared/auth";
import { solveCaptcha } from "./captcha";
import { clearCredentials, loadCredentials, saveCredentials } from "./credential-store";

type Page = "grades" | "classrooms" | "schedule" | "homework" | "exams";
type HomeworkItem = { id: string | number; title: string; courseName: string; endTime?: string; pending?: boolean; subStatus?: string };
type HomeworkData = { semester?: string; pendingCount: number; items: HomeworkItem[] };
type HomeworkPage = { items?: HomeworkItem[]; pendingCount?: number; semester?: string; nextCursor?: number | null };
type GradeRow = Record<string, ReactNode>;
type GradesData = { summary?: { weightedAverage?: string | number; gpa?: string | number }; terms?: Record<string, GradeRow[]> };
type ScheduleData = { code?: string; calendarMessage?: string; defaultWeek?: number | null; weekCount?: number; startDate?: string; courses?: ScheduleCourse[]; source?: string; label?: string };
type ClassroomTimelineItem = { id: number; time: string; code: number; label: string };
type ClassroomRecord = { room: string; used?: number | null; capacity?: number | null; occupancy?: number | null; timeline?: ClassroomTimelineItem[] };
type ClassroomData = { rooms?: ClassroomRecord[]; sources?: { people?: boolean } };
type ExamItem = { type?: string; courseName?: string; timePlace?: string; status?: string; detail?: string; changed?: boolean };
type ApiRequest = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
class ApiError extends Error { constructor(message: string, readonly code: string, readonly status: number) { super(message) } }
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const rawApi: ApiRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data: unknown = await response.json();
  if (!response.ok) {
    const payload = typeof data === "object" && data !== null ? data as { error?: unknown; code?: unknown } : {};
    throw new ApiError(typeof payload.error === "string" ? payload.error : "请求失败", typeof payload.code === "string" ? payload.code : "REQUEST_FAILED", response.status);
  }
  return data as T;
};
async function loadAllHomework(request: ApiRequest): Promise<HomeworkData> {
  const pages: Array<{ items?: HomeworkItem[]; pendingCount?: number }> = [];
  let cursor: number | null = 0;
  let semester = "";
  while (cursor !== null) {
    const page: HomeworkPage = await request<HomeworkPage>(`/api/homework?cursor=${cursor}`);
    pages.push(page);
    semester ||= page.semester || "";
    cursor = typeof page.nextCursor === "number" ? page.nextCursor : null;
  }
  const merged = mergeHomeworkPages(pages);
  return { semester, pendingCount: merged.pendingCount, items: merged.items as HomeworkItem[] };
}

export default function Portal() {
  const [ready, setReady] = useState(false), [logged, setLogged] = useState(false), [page, setPage] = useState<Page>("grades");
  const [captcha, setCaptcha] = useState(""), [username, setUsername] = useState(""), [password, setPassword] = useState(""), [answer, setAnswer] = useState(""), [notice, setNotice] = useState("");
  const [data, setData] = useState<unknown>(null), [loading, setLoading] = useState(false), [reloadKey,setReloadKey]=useState(0);
  const [homeworkSummary, setHomeworkSummary] = useState<HomeworkData>({ pendingCount: 0, items: [] });
  const refreshRef = useRef<Promise<void> | null>(null);

  const loadCaptcha = useCallback(async () => {
    try {
      const started = await rawApi<{ captcha?: string; already?: boolean }>("/api/auth/start");
      if (started.already) { setLogged(true); setNotice(""); return; }
      if (started.captcha) setCaptcha(started.captcha);
    }
    catch (error) { setNotice(errorMessage(error, "验证码加载失败。")); }
  }, []);

  const reauthenticate = useCallback(async () => {
    if (refreshRef.current) return refreshRef.current;
    refreshRef.current = (async () => {
      const credentials = await loadCredentials();
      if (!credentials) throw new ApiError("请重新登录。", "LOGIN_REQUIRED", 401);
      setUsername(credentials.username);
      setPassword(credentials.password);
      const started = await rawApi<{ captcha?: string; already?: boolean }>("/api/auth/start");
      if (started.already) { setLogged(true); setNotice(""); return; }
      const imageUrl = started.captcha || "";
      setCaptcha(imageUrl);
      try {
        const solved = await solveCaptcha(imageUrl);
        await rawApi("/api/auth/login", { method: "POST", body: JSON.stringify({ ...credentials, captcha: solved.answer }) });
        setLogged(true);
        setNotice("");
      } catch (error) {
        setLogged(false);
        setNotice("自动续登未能识别验证码，请手动输入图中算式结果。");
        throw error;
      }
    })().finally(() => { refreshRef.current = null; });
    return refreshRef.current;
  }, []);

  const api = useCallback<ApiRequest>(async (path, init) => {
    try { return await rawApi(path, init); }
    catch (error) {
      if (error instanceof ApiError && ["CAMPUS_REAUTH_REQUIRED", "LOGIN_REQUIRED"].includes(error.code)) {
        await reauthenticate();
        return rawApi(path, init);
      }
      throw error;
    }
  }, [reauthenticate]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    (async () => {
      try {
        const current = await rawApi<{ loggedIn?: boolean }>("/api/me");
        if (current.loggedIn) setLogged(true);
        else {
          try { await reauthenticate(); }
          catch { await loadCaptcha(); }
        }
      } finally { setReady(true); }
    })();
  }, [loadCaptcha, reauthenticate]);

  useEffect(() => {
    if (!logged) return;
    const path=pageRequestPath(page);
    const request = path ? (page === "homework" ? loadAllHomework(api) : api(path)) : Promise.resolve([]);
    Promise.resolve().then(() => { setNotice(""); setLoading(true); return request; })
      .then(setData).catch(error => setNotice(errorMessage(error, "读取失败。"))).finally(() => setLoading(false));
  }, [api, logged, page, reloadKey]);

  useEffect(() => {
    if (logged) loadAllHomework(api).then(result => setHomeworkSummary({ pendingCount: result.pendingCount || 0, items: result.items || [] })).catch(() => undefined);
  }, [api, logged]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      let captchaAnswer = answer.trim();
      if (!captchaAnswer) captchaAnswer = (await solveCaptcha(captcha)).answer;
      await rawApi("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password, captcha: captchaAnswer }) });
      await saveCredentials({ username, password });
      setLogged(true);
      setPage("grades");
      setNotice("");
    } catch (error) {
      setNotice(errorMessage(error, "登录失败。"));
      await loadCaptcha();
    } finally { setLoading(false); }
  };
  const logout = async () => {
    try { await rawApi("/api/auth/logout", { method: "POST" }); }
    finally { await clearCredentials(); location.reload(); }
  };
  if (!ready) return <main className="shell">正在加载…</main>;
  if (!logged) return <main className="shell login"><div className="brand"><b className="brand-logo"><img src="/icon-192.png" alt="知行" /></b><div><h1>交大自由行</h1><p>非官方校园信息工具</p></div></div><form className="card" onSubmit={login}><h2>登录统一认证</h2><aside className="unofficial-notice"><strong>非北京交通大学官方产品</strong><span>仅供用户查询本人的校园信息，不提供缴费、充值或代办服务。</span></aside><label>学号<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></label><label>密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label><div className="captcha">{/* CAPTCHA URLs are short-lived authenticated resources and cannot use image optimization. */}<img src={captcha || undefined} alt="验证码"/><button type="button" onClick={loadCaptcha}>换一张</button></div><label>验证码<input value={answer} onChange={e => setAnswer(e.target.value)} inputMode="numeric" placeholder="可留空自动识别；失败时手动输入" /></label><p className="privacy-note">登录时，密码仅用于连接学校统一认证，不会以明文保存在服务器。选择记住登录后，账号密码仅加密保存在这台设备，用于校园会话失效时自动续登。</p>{notice && <p className="error">{notice}</p>}<button className="primary" disabled={loading}>{loading ? "正在登录…" : "登录"}</button></form><footer><a href="/about">开源许可与隐私说明</a></footer></main>;
  const content = () => { if (loading) return <p>正在读取校园信息…</p>; if (notice) return <div className="load-error"><p className="error">{notice}</p><button onClick={()=>setReloadKey(value=>value+1)}>重新读取</button></div>; if (page === "grades") return <Grades data={data as GradesData | null} homework={homeworkSummary.items}/>; if (page === "schedule") return <Schedule key={reloadKey} data={data as ScheduleData | null}/>; if (page === "classrooms") return <Classrooms request={api}/>; if (page === "homework") return <Homework data={data as HomeworkData | null}/>; return <Exams data={data}/>; };
  const labels: Record<Page,string> = { grades:"成绩", classrooms:"教室", schedule:"课表", homework: homeworkSummary.pendingCount ? `作业 ${homeworkSummary.pendingCount}` : "作业", exams:"考试" };
  const changePage = (next: Page) => { if (next === page) return; setNotice(""); setData(null); setLoading(true); setPage(next); };
  return <main className="shell"><header><div className="brand"><b className="brand-logo"><img src="/icon-192.png" alt="知行" /></b><div><h1>交大自由行</h1><p>非官方校园信息工具</p></div></div><button onClick={logout}>退出</button></header><nav>{(["grades","classrooms","schedule","homework","exams"] as Page[]).map(key => <button className={page===key?"active":""} onClick={()=>changePage(key)} key={key}>{labels[key]}</button>)}</nav><section className="card">{content()}</section><footer><a href="/about">开源许可与隐私说明</a></footer></main>;
}
function Grades({data,homework}:{data:GradesData | null;homework:HomeworkItem[]}) {
  const [term,setTerm]=useState("");
  const [now]=useState(()=>Date.now());
  if(!data)return null;
  const terms=Object.keys(data.terms||{}).sort((left,right)=>right.localeCompare(left));
  const selected=term&&terms.includes(term)?term:latestTerm(terms);
  const reminders=upcomingHomework(homework,now,3);
  return <><h2>成绩</h2><div className="stats"><div><span>加权平均分</span><b>{data.summary?.weightedAverage||"—"}</b></div><div><span>平均绩点（计算值）</span><b>{data.summary?.gpa||"—"}</b></div></div>{reminders.length>0&&<section className="deadline-panel"><h3>临近截止作业</h3>{reminders.map(item=><div key={item.id}><span><strong>{item.title}</strong><small>{item.courseName}</small></span><b>{countdownLabel(campusDateTimestamp(item.endTime||""),now)}</b></div>)}</section>}<label className="term-label">学期<select value={selected} onChange={e=>setTerm(e.target.value)}>{terms.map(value=><option value={value} key={value}>{termDisplayName(value)}</option>)}</select></label><Table headers={["课程","学分","成绩","教师"]} rows={data.terms?.[selected]||[]} keys={["name","credits","score","teacher"]}/></>
}
function Schedule({data:result}:{data:ScheduleData | null}) {
  const days=["周一","周二","周三","周四","周五"];
  const [week,setWeek]=useState(result?.defaultWeek ?? 0);
  const list=(result?.courses||[]).filter(course=>isCourseActive(course,week));
  const weekCount=result?.weekCount||16;
  const periods=[{id:1,time:"08:00–10:00"},{id:2,time:"10:00–12:00"},{id:3,time:"14:00–16:00"},{id:4,time:"16:00–18:00"}];
  const dateLabel=result?.startDate?weekDateRange(result.startDate,week):"";
  return <><h2>课表</h2><p className="muted">{result?.calendarMessage} · <a href={CALENDAR_SOURCE} target="_blank" rel="noreferrer">校历依据</a></p>{!week&&<p className="source-note">当前不在教学周内，或校历未覆盖；请选择教学周查看，不自动假定为第 1 周。</p>}<div><label className="term-label">教学周<select value={week} onChange={e=>setWeek(Number(e.target.value))}><option value={0} disabled>请选择教学周</option>{Array.from({length:weekCount},(_,index)=>index+1).map(value=><option value={value} key={value}>第 {value} 周</option>)}</select></label></div><p className="muted">{`${result?.source||"MIS 教务系统最终课表"}${dateLabel?` · ${dateLabel}`:""}`}</p>{(result?.courses||[]).length===0?<p className="empty">MIS 暂未返回{result?.label||"该学期"}的最终课表。</p>:<div className="schedule-wrap"><div className="schedule"><div></div>{days.map(day=><b key={day}>{day}</b>)}{periods.map(period=><Fragment key={period.id}><b className="time-label">{period.time}</b>{days.map((_,index)=>{const items=list.filter(course=>course.day===index+1&&course.period===period.id);return <div className="slot" key={`${period.id}-${index}`}>{items.map((course,courseIndex)=><article key={`${course.courseName}-${courseIndex}`}><strong>{course.courseName}</strong><span>{course.teacher}</span><span>{course.classroom}</span></article>)}</div>})}</Fragment>)}</div></div>}</>
}
function Classrooms({request}:{request:ApiRequest}) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const update=()=>setNow(Date.now());const timer=window.setInterval(update,60_000);window.addEventListener("focus",update);return()=>{window.clearInterval(timer);window.removeEventListener("focus",update)}},[]);
  const today=academicToday(now);
  const [selection,setSelection]=useState<{week:number;day:number;period:number}|null>(null);
  const {week,day,period}=selection||{week:today.week??0,day:today.day,period:today.period};
  const setWeek=(value:number)=>setSelection({week:value,day,period});
  const setDay=(value:number)=>setSelection({week,day:value,period});
  const setPeriod=(value:number)=>setSelection({week,day,period:value});
  const [building,setBuilding]=useState("思源楼"),[rooms,setRooms]=useState<ClassroomData | null>(null),[error,setError]=useState(""),[refreshing,setRefreshing]=useState(false),[updated,setUpdated]=useState("");
  const refresh=useCallback(async()=>{if(!week)return;setRefreshing(true);setError("");try{setRooms(await request<ClassroomData>(`/api/classrooms?building=${encodeURIComponent(building)}&week=${week}&day=${day}&period=${period}`));setUpdated(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}))}catch(cause){setError(errorMessage(cause,"教室读取失败。"))}finally{setRefreshing(false)}},[building,day,period,request,week]);
  useEffect(()=>{const timeout=window.setTimeout(()=>void refresh(),0);return()=>window.clearTimeout(timeout)},[refresh]);
  const roomList=(rooms?.rooms||[]).map(room=>({...room,status:room.timeline?.[period-1]?.label||(room.occupancy===0?"空闲":room.occupancy==null?"未知":"占用")}));
  const available=roomList.filter(room=>room.occupancy===0).length;
  return <><div className="section-heading"><h2>空闲教室</h2><button onClick={()=>{setNow(Date.now());setSelection(null)}}>回到今天</button><button onClick={refresh} disabled={refreshing}>{refreshing?"刷新中…":"刷新"}</button></div><p className="muted">{today.message} · <a href={CALENDAR_SOURCE} target="_blank" rel="noreferrer">校历依据</a></p>{!week&&<p className="source-note">当前没有可确定的常规教学周，请手动选择；暂不查询占用。</p>}<div className="classroom-controls"><label>教学楼<select value={building} onChange={e=>setBuilding(e.target.value)}>{BUILDINGS.map(x=><option key={x}>{x}</option>)}</select></label><label>周次<select value={week} onChange={e=>setWeek(Number(e.target.value))}><option value={0} disabled>请选择教学周</option>{Array.from({length:20},(_,i)=>i+1).map(x=><option key={x} value={x}>第{x}周</option>)}</select></label><label>星期<select value={day} onChange={e=>setDay(Number(e.target.value))}>{["一","二","三","四","五","六","日"].map((x,i)=><option key={x} value={i+1}>周{x}</option>)}</select></label><label>时段<select value={period} onChange={e=>setPeriod(Number(e.target.value))}>{AA_PERIODS.map(item=><option key={item.id} value={item.id}>{item.time}</option>)}</select></label></div>{error&&<p className="error">{error}</p>}<p className="muted">共 {roomList.length} 间 · 当前所选时段空闲 {available} 间{updated?` · ${updated} 更新`:""}</p>{rooms&&!rooms.sources?.people&&<p className="source-note">实时人数暂不可用，占用查询仍可使用。</p>}<div className="table-wrap"><table className="classroom-table"><thead><tr>{["教室","人数","容量","所选时段","后续占用"].map(title=><th key={title}>{title}</th>)}</tr></thead><tbody>{roomList.map(room=><tr key={room.room} className="room-row"><td>{room.room}</td><td>{room.used??"—"}</td><td>{room.capacity??"—"}</td><td>{room.status}</td><td><div className="occupancy-timeline">{(room.timeline||[]).slice(period-1).map(item=><span className={`occupancy-code-${item.code}`} key={item.id}><small>{item.time.slice(0,5)}</small>{item.label}</span>)}</div></td></tr>)}</tbody></table></div></>;
}
function Homework({data}:{data:HomeworkData | null}) { const [pendingOnly,setPendingOnly]=useState(true); const items=(data?.items||[]).filter(item=>!pendingOnly||item.pending); return <><div className="section-heading"><h2>作业</h2><button onClick={()=>setPendingOnly(value=>!value)}>{pendingOnly?"查看全部":"仅看未交"}</button></div><p className="muted">未提交 {data?.pendingCount||0} 项 · 截止时间来自课程平台</p>{items.length?<div className="item-list">{items.map(item=><article key={item.id}><div><strong>{item.title}</strong><span>{item.courseName}</span></div><div><b className={item.pending?"danger":"success"}>{item.subStatus}</b><time>{item.endTime||"无截止时间"}<small>{item.pending?countdownLabel(campusDateTimestamp(item.endTime||"")):"已提交"}</small></time></div></article>)}</div>:<p className="empty">当前没有{pendingOnly?"未提交":"可显示的"}作业。</p>}</> }
function Exams({data}:{data:unknown}) { const [type,setType]=useState("全部"); const [now]=useState(()=>Date.now()); const all=normalizeExamList(data) as ExamItem[]; const types=["全部",...new Set(all.map(item=>item.type).filter((value):value is string=>Boolean(value)))]; const examTime=(item:ExamItem)=>campusDateTimestamp(item.timePlace||""); const items=[...filterExamsByType(all,type)].sort((left,right)=>(examTime(left)??Number.MAX_SAFE_INTEGER)-(examTime(right)??Number.MAX_SAFE_INTEGER)); const next=[...all].filter(item=>(examTime(item)??0)>now).sort((left,right)=>(examTime(left)??0)-(examTime(right)??0))[0]; const changes=all.filter(item=>item.changed).length; return <><div className="section-heading"><h2>考试</h2>{types.length>1&&<label className="compact-filter">类型<select value={type} onChange={event=>setType(event.target.value)}>{types.map(value=><option key={value}>{value}</option>)}</select></label>}</div>{next&&<section className="deadline-panel"><h3>最近考试</h3><div><span><strong>{next.courseName}</strong><small>{next.timePlace}</small></span><b>{countdownLabel(examTime(next),now)}</b></div></section>}{changes>0&&<p className="source-note">发现 {changes} 项新增或变更的考试安排，请注意核对。</p>}<p className="muted">考试时间、地点与状态来自教务系统。</p>{items.length?<div className="item-list">{items.map((item,index)=><article key={`${item.courseName||"exam"}-${index}`}><div><strong>{item.courseName}{item.changed&&<em className="change-tag">有变更</em>}</strong><span>{item.type} · {item.detail||"暂无说明"}</span></div><div><b>{item.status||"—"}</b><time>{item.timePlace}<small>{countdownLabel(examTime(item),now)}</small></time></div></article>)}</div>:<p className="empty">{type==="全部"?"教务系统当前没有返回考试安排。":"该类型暂无考试安排。"}</p>}</> }
function Table({headers,rows,keys}:{headers:string[];rows:GradeRow[];keys:string[]}){return <div className="table-wrap"><table><thead><tr>{headers.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{keys.map(key=><td key={key}>{row[key]??"—"}</td>)}</tr>)}</tbody></table></div>}
