export interface Skill {
  name: string;
  description: string;
  run: (args: Record<string, unknown>) => Promise<string>;
}

class SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  list(): Skill[] {
    return [...this.skills.values()];
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  async run(name: string, args: Record<string, unknown>): Promise<string> {
    const skill = this.skills.get(name);
    if (!skill) return JSON.stringify({ error: `技能 "${name}" 未注册` });
    return skill.run(args);
  }
}

export const skillRegistry = new SkillRegistry();

// ---- built-in skills ----
skillRegistry.register({
  name: "summarize_url",
  description: "抓取一个 URL 并返回前 2000 字摘要",
  run: async (args) => {
    const url = String(args.url ?? "");
    if (!url) return JSON.stringify({ error: "缺少 url" });
    try {
      const res = await fetch(url, { headers: { "User-Agent": "CheckOne/1.0" }, signal: AbortSignal.timeout(15_000) });
      const html = await res.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, "\n")
        .trim()
        .slice(0, 2000);
      return JSON.stringify({ ok: true, url, summary: text });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
});

skillRegistry.register({
  name: "ping_host",
  description: "检测一个主机是否可达（用于监控服务可用性）",
  run: async (args) => {
    const host = String(args.host ?? "");
    if (!host) return JSON.stringify({ error: "缺少 host" });
    try {
      const res = await fetch(host, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
      return JSON.stringify({ ok: true, host, status: res.status });
    } catch {
      return JSON.stringify({ ok: false, host, error: "不可达" });
    }
  },
});