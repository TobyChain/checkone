import crypto from "node:crypto";
import { broadcast } from "../events.js";
import type { MonitorSpec, MonitorState, TerminalMonitorSpec, WebMonitorSpec } from "./types.js";
import { TerminalMonitor } from "./terminal.js";
import { WebMonitor } from "./web.js";
import { store } from "../store.js";

interface ActiveMonitor {
  spec: MonitorSpec;
  monitor: TerminalMonitor | WebMonitor;
}

class MonitorRegistry {
  private monitors = new Map<string, ActiveMonitor>();

  list(): MonitorState[] {
    return [...this.monitors.values()].map((m) => m.monitor.getState());
  }

  get(id: string): ActiveMonitor | undefined {
    return this.monitors.get(id);
  }

  count(): number {
    return this.monitors.size;
  }

  createWeb(spec: Omit<WebMonitorSpec, "id" | "createdAt">): string {
    const id = crypto.randomUUID().slice(0, 8);
    const full: WebMonitorSpec = { ...spec, id, createdAt: Date.now() };
    const monitor = new WebMonitor(full, (state) => this.onChange(state));
    this.monitors.set(id, { spec: full, monitor });
    broadcast("monitor_added", monitor.getState());
    void monitor.start();
    return id;
  }

  createTerminal(spec: Omit<TerminalMonitorSpec, "id" | "createdAt">): string {
    const id = crypto.randomUUID().slice(0, 8);
    const full: TerminalMonitorSpec = { ...spec, id, createdAt: Date.now() };
    const monitor = new TerminalMonitor(full, (state) => this.onChange(state));
    this.monitors.set(id, { spec: full, monitor });
    broadcast("monitor_added", monitor.getState());
    monitor.start();
    return id;
  }

  private onChange(state: MonitorState): void {
    broadcast("monitor_update", state);
    if (state.status === "done" || state.status === "error" || state.status === "cancelled") {
      broadcast("monitor_done", state);
      // Keep the monitor for a while so the user can see it, then clean up
      setTimeout(() => {
        const active = this.monitors.get(state.id);
        if (active && active.monitor.getState().status !== "running") {
          this.monitors.delete(state.id);
        }
      }, 60_000);
    }
  }

  async cancel(id: string): Promise<boolean> {
    const active = this.monitors.get(id);
    if (!active) return false;
    if (active.monitor instanceof TerminalMonitor) {
      active.monitor.cancel();
    } else {
      await active.monitor.stop();
    }
    return true;
  }

  async remove(id: string): Promise<boolean> {
    const active = this.monitors.get(id);
    if (!active) return false;
    if (active.monitor instanceof WebMonitor) await active.monitor.stop();
    else active.monitor.cancel();
    this.monitors.delete(id);
    return true;
  }
}

export const monitorRegistry = new MonitorRegistry();

// Periodic tick to broadcast running monitor states
setInterval(() => {
  for (const active of monitorRegistry["monitors"].values()) {
    if (active.monitor.getState().status === "running") {
      broadcast("monitor_update", active.monitor.getState());
    }
  }
}, 2000);