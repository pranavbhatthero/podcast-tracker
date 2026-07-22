import { promises as fs } from "fs";
import path from "path";
import Dashboard from "./components/Dashboard";
import type { Prediction } from "./types";
import type { Expert } from "./types/expert";

export default async function Home() {
  const [predictionsRaw, expertsRaw] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "public", "predictions.json"), "utf-8"),
    fs.readFile(path.join(process.cwd(), "public", "experts.json"), "utf-8"),
  ]);

  const predictions: Prediction[] = JSON.parse(predictionsRaw);
  const experts: Expert[] = JSON.parse(expertsRaw);

  return <Dashboard predictions={predictions} experts={experts} />;
}
