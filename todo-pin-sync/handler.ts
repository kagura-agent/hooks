import fs from "node:fs";
import { execSync } from "node:child_process";

const HOME = process.env.HOME || "";
const WORKSPACE = `${HOME}/.openclaw/workspace`;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY || "";
const CHANNEL = "1491602968741413039"; // #kagura-dm

// File → Pin mapping
const SYNCS = [
  {
    name: "TODO",
    file: `${WORKSPACE}/TODO.md`,
    pin: "1491651533492850769",
    format: formatTodoForPin,
    lastMtime: 0,
  },
  {
    name: "Strategy",
    file: `${WORKSPACE}/wiki/strategy.md`,
    pin: "1491658212816982066",
    format: formatStrategyForPin,
    lastMtime: 0,
  },
];

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function formatTodoForPin(md: string): string {
  const lines = md.split("\n");
  const sections: { title: string; items: string[] }[] = [];
  let currentSection: { title: string; items: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentSection = { title: line.replace("## ", "").trim(), items: [] };
      sections.push(currentSection);
    } else if (currentSection && line.match(/^- \[.\]/)) {
      const item = line.replace(/^- \[.\] /, "").trim();
      if (item) currentSection.items.push(`• ${item}`);
    }
  }

  const now = timestamp();
  let result = `📋 **Kagura TODO**（更新: ${now}）\n`;
  for (const section of sections) {
    if (section.items.length > 0) {
      result += `\n**${section.title}：**\n${section.items.join("\n")}\n`;
    }
  }
  return result.trim();
}

function formatStrategyForPin(md: string): string {
  // Extract key sections from strategy.md
  const lines = md.split("\n");
  const parts: string[] = [];
  let inSection = false;
  let sectionDepth = 0;

  for (const line of lines) {
    if (line.startsWith("## 北极星")) {
      inSection = true;
      sectionDepth = 2;
      parts.push("🌟 **北极星：人类伴侣**\n");
      continue;
    }
    if (line.startsWith("## 主线")) {
      inSection = true;
      sectionDepth = 2;
      parts.push("\n**主线与辅线：**\n");
      continue;
    }
    if (line.startsWith("## 产品方向")) {
      inSection = true;
      sectionDepth = 2;
      parts.push("\n**产品方向：**\n");
      continue;
    }
    if (line.startsWith("## ") && inSection) {
      inSection = false;
      continue;
    }
    if (inSection && line.startsWith("- ")) {
      parts.push(`• ${line.replace(/^- /, "").trim()}`);
    }
  }

  const now = timestamp();
  return parts.join("\n").trim() + `\n\n_更新: ${now} · 详见 wiki/strategy.md_`;
}

function timestamp(): string {
  return new Date().toLocaleString("en-US", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function patchPin(pin: string, content: string) {
  const data = JSON.stringify({ content });
  const proxyArg = PROXY ? `-x "${PROXY}"` : "";
  execSync(
    `curl -s -X PATCH "https://discord.com/api/v10/channels/${CHANNEL}/messages/${pin}" ` +
      `-H "Authorization: Bot ${BOT_TOKEN}" ` +
      `-H "Content-Type: application/json" ` +
      `-H "User-Agent: DiscordBot (https://openclaw.ai, 1.0)" ` +
      `${proxyArg} ` +
      `-d ${JSON.stringify(data)}`,
    { timeout: 10000 }
  );
}

function syncAll() {
  for (const sync of SYNCS) {
    try {
      const stat = fs.statSync(sync.file);
      if (stat.mtimeMs === sync.lastMtime) continue;
      sync.lastMtime = stat.mtimeMs;

      const content = fs.readFileSync(sync.file, "utf-8");
      const pinContent = sync.format(content);
      patchPin(sync.pin, pinContent);
      console.log(`[todo-pin-sync] ${sync.name} pin updated`);
    } catch {
      // File doesn't exist, skip
    }
  }
}

const handler = async (event: any) => {
  if (event.type !== "message" || event.action !== "sent") return;

  // Check if any watched file changed
  let anyChanged = false;
  for (const sync of SYNCS) {
    try {
      const stat = fs.statSync(sync.file);
      if (stat.mtimeMs !== sync.lastMtime) anyChanged = true;
    } catch {}
  }
  if (!anyChanged) return;

  // Debounce: wait 3s to batch rapid changes
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    syncAll();
    debounceTimer = null;
  }, 3000);
};

export default handler;
