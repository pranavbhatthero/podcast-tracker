import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const BASE_DIR = path.join(process.cwd(), "..", "..");
// Prevent concurrent runs
let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json({ status: "already_running" }, { status: 409 });
  }

  running = true;

  const python = path.join(BASE_DIR, ".venv", "bin", "python3");
  const script = path.join(BASE_DIR, "auto_update.py");

  const child = spawn(python, [script], {
    cwd: BASE_DIR,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
  });

  child.unref();

  child.on("close", () => { running = false; });
  child.on("error", () => { running = false; });

  return NextResponse.json({ status: "started" });
}

export async function GET() {
  return NextResponse.json({ running });
}
