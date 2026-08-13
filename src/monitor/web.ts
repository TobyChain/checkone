import type { MonitorState, WebMonitorSpec } from "./types.js";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

// Lazy-load playwright so the app starts even without chromium installed.
let chromium: typeof import("playwright")["chromium"] | null = null;
async function getChromium() {
  if (!chromium) {
    chromium = (await import("playwright")).chromium;
  }
  return chromium;
}

export class WebMonitor {
  spec: WebMonitorSpec;
  status: MonitorState["status"] = "running";
  progress = 0;
  private browser: any = null;
  private page: any = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private resources: { url: string; status: number; type: string }[] = [];
  private screenshotPath?: string;
  private onChange: (state: MonitorState) => void;

  constructor(spec: WebMonitorSpec, onChange: (state: MonitorState) => void) {
    this.spec = spec;
    this.onChange = onChange;
  }

  async start(): Promise<void> {
    const chromium = await getChromium();
    try {
      this.browser = await chromium.launch({ headless: true });
      this.page = await this.browser.newPage();

      this.page.on("response", (response: any) => {
        this.resources.push({
          url: response.url(),
          status: response.status(),
          type: response.request().resourceType(),
        });
        this.emit();
      });

      await this.page.goto(this.spec.url, { waitUntil: "domcontentloaded", timeout: 30_000 });

      if (this.spec.waitForSelector) {
        await this.page.waitForSelector(this.spec.waitForSelector, { timeout: 30_000 }).catch(() => {});
      }

      this.progress = 100;
      this.status = "done";
      await this.takeScreenshot();
      this.emit();

      // Periodic re-check
      this.pollTimer = setInterval(async () => {
        await this.takeScreenshot();
        this.emit();
      }, this.spec.screenshotIntervalMs);
    } catch (err) {
      this.status = "error";
      this.onChange({
        ...this.getState(),
        output: err instanceof Error ? err.message : String(err),
      });
      await this.stop();
    }
  }

  private async takeScreenshot(): Promise<void> {
    if (!this.page) return;
    try {
      const dir = path.join(config.dataDir, "screenshots");
      fs.mkdirSync(dir, { recursive: true });
      this.screenshotPath = path.join(dir, `web_${this.spec.id}_${Date.now()}.png`);
      await this.page.screenshot({ path: this.screenshotPath });
    } catch {}
  }

  async checkState(): Promise<Record<string, unknown>> {
    if (!this.page) return { error: "页面未加载" };
    try {
      return {
        title: await this.page.title(),
        url: this.page.url(),
        resources: this.resources.length,
        okResources: this.resources.filter((r) => r.status < 400).length,
        errorResources: this.resources.filter((r) => r.status >= 400).length,
      };
    } catch {
      return { error: "页面已关闭" };
    }
  }

  async getContent(): Promise<string> {
    if (!this.page) return "";
    try {
      return await this.page.evaluate(() => document.body?.innerText?.slice(0, 5000) ?? "");
    } catch {
      return "";
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    try { await this.browser?.close(); } catch {}
    this.browser = null;
    this.page = null;
  }

  getState(): MonitorState {
    return {
      id: this.spec.id,
      type: "web",
      label: this.spec.label,
      status: this.status,
      progress: this.progress,
      output: `${this.resources.length} 个资源请求`,
      url: this.spec.url,
      screenshotPath: this.screenshotPath,
      updatedAt: Date.now(),
    };
  }

  private emit(): void {
    this.onChange(this.getState());
  }
}