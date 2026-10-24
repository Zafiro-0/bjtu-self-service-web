import type { Metadata } from "next";
import Portal from "./portal";

export const metadata: Metadata = {
  title: "交大自由行",
  description: "北京交通大学个人校园服务",
};

export default function Home() { return <Portal />; }
