import { spawn, type ChildProcess } from "node:child_process";
import type { MonitorState, TerminalMonitorSpec } from "./types.js";

export class TerminalMonitor {
  spec: TerminalMonitorSpec;
  status: MonitorState["status"] = "running";
  progress = 0;
  private process: ChildProcess | null = null;
  private outputBuffer: string[] = [];
  private startTime = 0;
  private onChange: (state: MonitorState) => void;

  constructor(spec: TerminalMonitorSpec, onChange: (state: MonitorState) => void) {
    this.spec = spec;
    this.onChange = onChange;
  }

  start(): void {
    this.startTime = Date.now();
    this.process = spawn(this.spec.command, [], {
      cwd: this.spec.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.spec.pid = this.process.pid;

    const onData = (data: Buffer) => {
      this.outputBuffer.push(data.toString());
      const total = this.outputBuffer.join("").length;
      if (total > 100_000) {
        this.outputBuffer = [this.outputBuffer.join("").slice(-50_000)];
      }
      this.updateProgress();
      this.emit();
    };
    this.process.stdout?.on("data", onData);
    this.process.stderr?.on("data", onData);

    this.process.on("exit", (code) => {
      this.spec.exitCode = code ?? -1;
      this.status = code === 0 ? "done" : "error";
      this.progress = 100;
      this.emit();
    });

    this.process.on("error", (err) => {
      this.status = "error";
      this.outputBuffer.push(`[error] ${err.message}`);
      this.emit();
    });
  }

  private updateProgress(): void {
    const output = this.outputBuffer.join("");
    const progressMatch = output.match(/\/(\d+)/g);
    if (progressMatch) {
      const nums = progressMatch.map((s) => parseInt(s.slice(1), 10)).filter((n) => Number.isFinite(n));
      if (nums.length) {
        this.progress = Math.min(100, Math.round((nums.reduce((a, b) => a + b, 0) / nums.length)));
      }
    }
    const elapsed = Date.now() - this.startTime;
    if (this.progress === 0 && elapsed > 120_000) {
      this.progress = Math.min(50, Math.round((elapsed / 60_000) * 5));
    }
  }

  getOutput(tail = 50): string {
    return this.outputBuffer.join("").split("\n").slice(-tail).join("\n");
  }

  cancel(): void {
    if (this.process && this.status === "running") {
      this.process.kill("SIGTERM");
      this.status = "cancelled";
      this.emit();
    }
  }

  getState(): MonitorState {
    return {
      id: this.spec.id,
      type: "terminal",
      label: this.spec.label,
      status: this.status,
      progress: this.progress,
      output: this.getOutput(),
      exitCode: this.spec.exitCode,
      updatedAt: Date.now(),
    };
  }

  private emit(): void {
    this.onChange(this.getState());
  }
}