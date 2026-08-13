export type MonitorType = "web" | "terminal";
export type MonitorStatus = "running" | "done" | "error" | "cancelled";

export interface MonitorSpec {
  id: string;
  type: MonitorType;
  label: string;
  createdAt: number;
}

export interface WebMonitorSpec extends MonitorSpec {
  type: "web";
  url: string;
  waitForSelector?: string;
  screenshotIntervalMs: number;
}

export interface TerminalMonitorSpec extends MonitorSpec {
  type: "terminal";
  command: string;
  cwd: string;
  pid?: number;
  exitCode?: number;
}

export interface MonitorState {
  id: string;
  type: MonitorType;
  label: string;
  status: MonitorStatus;
  progress: number;
  output: string;
  url?: string;
  screenshotPath?: string;
  exitCode?: number;
  updatedAt: number;
}