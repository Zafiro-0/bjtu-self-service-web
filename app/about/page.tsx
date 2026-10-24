import Link from "next/link";

export const metadata = { title: "开源许可与隐私说明 · 交大自由行" };

export default function AboutPage() {
  return <main className="shell legal"><Link href="/">← 返回</Link><section className="card"><h1>开源许可与隐私说明</h1><h2>这是什么</h2><p>这是北京交通大学校园服务的非官方网页客户端。成绩、课表、考试、作业和教室信息来自学校或原应用使用的服务，实际结果以学校系统为准。</p><h2>登录信息</h2><p>服务器不会持久保存校园密码。选择记住登录后，学号和密码会由浏览器生成的不可导出密钥加密，并只保存在当前设备，用于校园会话失效时续登。清除网站数据、换设备或点击退出后，需要重新登录。</p><h2>开源许可</h2><p>本项目基于 BJTUselfService，原项目采用 MIT License。Copyright © 2024 BJTUselfService。</p><p>软件按现状提供，不附带任何明示或默示担保。请勿把账号密码或个人校园信息转发给他人。</p></section></main>;
}
