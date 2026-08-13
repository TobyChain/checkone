import fs from "node:fs";
import path from "node:path";
import { config, setLlmOverride, isMaskedKey } from "./config.js";

// ---- types ----
export interface Settings {
  llm: { baseUrl: string; apiKey: string; model: string };
  screenshotIntervalSec: number;
  terminalPollIntervalSec: number;
  autoCleanupDays: number;
  notifyOnDone: boolean;
  notifyOnError: boolean;
}

export interface RuntimeState {
  lastSessionAt: number;
}

export interface MemoryEntry {
  ts: number;
  text: string;
}

export const DEFAULT_SETTINGS: Settings = {
  llm: { baseUrl: "", apiKey: "", model: "" },
  screenshotIntervalSec: 5,
  terminalPollIntervalSec: 2,
  autoCleanupDays: 7,
  notifyOnDone: true,
  notifyOnError: true,
};

const DEFAULT_STATE: RuntimeState = {
  lastSessionAt: 0,
};

// ---- file paths ----
function settingsPath(): string { return path.join(config.dataDir, "settings.json"); }
function statePath(): string { return path.join(config.dataDir, "state.json"); }
function memoryPath(): string { return path.join(config.dataDir, "memory.json"); }

// ---- atomic write ----
function atomicWrite(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function deepMergeDefaults<T>(loaded: Partial<T>, defaults: T): T {
  const merged = { ...defaults } as T;
  for (const key of Object.keys(defaults as object) as (keyof T)[]) {
    if (loaded[key] !== undefined) (merged as Record<string, unknown>)[key as string] = loaded[key];
  }
  return merged;
}

// ---- store ----
function loadSettings(): Settings {
  const raw = readJson<Partial<Settings>>(settingsPath(), {});
  return deepMergeDefaults(raw, DEFAULT_SETTINGS);
}

function loadState(): RuntimeState {
  return readJson<RuntimeState>(statePath(), DEFAULT_STATE);
}

function loadMemory(): MemoryEntry[] {
  return readJson<MemoryEntry[]>(memoryPath(), []);
}

export const store = {
  settings: loadSettings(),
  state: loadState(),
  memory: loadMemory(),

  saveSettings(): void {
    atomicWrite(settingsPath(), this.settings);
    setLlmOverride(this.settings.llm);
  },

  saveState(): void {
    atomicWrite(statePath(), this.state);
  },

  saveMemory(): void {
    if (this.memory.length > 100) this.memory = this.memory.slice(-100);
    atomicWrite(memoryPath(), this.memory);
  },

  addMemory(text: string): void {
    this.memory.push({ ts: Date.now(), text });
    this.saveMemory();
  },

  maskApiKey(): string {
    const key = this.settings.llm.apiKey || "";
    if (!key) return "";
    if (key.length <= 8) return "****";
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
  },
};

// Initialize LLM override from loaded settings
setLlmOverride(store.settings.llm);

export interface SettingsPatch {
  llm?: { baseUrl?: string; apiKey?: string; model?: string };
  screenshotIntervalSec?: number;
  terminalPollIntervalSec?: number;
  autoCleanupDays?: number;
  notifyOnDone?: boolean;
  notifyOnError?: boolean;
}

export function applySettingsPatch(patch: SettingsPatch): Settings {
  const s = store.settings;
  if (patch.llm) {
    if (patch.llm.baseUrl !== undefined) s.llm.baseUrl = patch.llm.baseUrl;
    if (patch.llm.model !== undefined) s.llm.model = patch.llm.model;
    if (patch.llm.apiKey !== undefined && !isMaskedKey(patch.llm.apiKey)) {
      s.llm.apiKey = patch.llm.apiKey;
    }
  }
  if (typeof patch.screenshotIntervalSec === "number" && patch.screenshotIntervalSec >= 1) {
    s.screenshotIntervalSec = patch.screenshotIntervalSec;
  }
  if (typeof patch.terminalPollIntervalSec === "number" && patch.terminalPollIntervalSec >= 1) {
    s.terminalPollIntervalSec = patch.terminalPollIntervalSec;
  }
  if (typeof patch.autoCleanupDays === "number") s.autoCleanupDays = patch.autoCleanupDays;
  if (typeof patch.notifyOnDone === "boolean") s.notifyOnDone = patch.notifyOnDone;
  if (typeof patch.notifyOnError === "boolean") s.notifyOnError = patch.notifyOnError;
  store.saveSettings();
  return s;
}