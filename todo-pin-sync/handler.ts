import fs from "node:fs";
import { execSync } from "node:child_process";

const HOME = process.env.HOME || "";
const WORKSPACE = `${HOME}/.openclaw/workspace`;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY || "";

function initMtime(path: string): number {
  try { return fs.statSync(path).mtimeMs; } catch { return 0; }
}

// Channel file → pin mappings
const CHANNEL_SYNCS = [
  { name: "kagura-dm",      file: `${WORKSPACE}/channels/kagura-dm.md`,      pin: "1491651204445634600", channel: "1491602968741413039" },
  { name: "work",           file: `${WORKSPACE}/channels/work.md`,           pin: "1491653656481632287", channel: "1491636222853124176" },
  { name: "study",          file: `${WORKSPACE}/channels/study.md`,          pin: "1491652630013935717", channel: "1491644155451932934" },
  { name: "kagura-profile", file: `${WORKSPACE}/channels/kagura-profile.md`, pin: "1492518613892993084", channel: "1492516385300156547" },
  { name: "lobster-post",   file: `${WORKSPACE}/channels/lobster-post.md`,   pin: "1492532470632157388", channel: "1491644145826005164" },
  { name: "moltbook",       file: `${WORKSPACE}/channels/moltbook.md`,       pin: "1492522096515874947", channel: "1492522012789309650" },
  { name: "uncaged",        file: `${WORKSPACE}/channels/uncaged.md`,        pin: "1491982906099240981", channel: "1491972248188227735" },
  { name: "memex",          file: `${WORKSPACE}/channels/memex.md`,          pin: "1492536282960891904", channel: "1492001094237163651" },
  { name: "hermes",         file: `${WORKSPACE}/channels/hermes.md`,         pin: "1492040977257599006", channel: "1492040974157746348" },
  { name: "caduceus",       file: `${WORKSPACE}/channels/caduceus.md`,       pin: "1492536440419123240", channel: "1492072117389365378" },
  { name: "abti",           file: `${WORKSPACE}/channels/abti.md`,           pin: "1492341370567000175", channel: "1492340738422210696" },
  { name: "agent-memes",    file: `${WORKSPACE}/channels/agent-memes.md`,    pin: "1492638612578111720", channel: "1492638609596088390" },
  { name: "agent-collab",   file: `${WORKSPACE}/channels/agent-collab.md`,   pin: "1492647309526302933", channel: "1491678465773010995" },
];

// Original TODO/Strategy syncs (keep existing)
const TODO_SYNCS = [
  {
    name: "TODO",
    file: `${WORKSPACE}/TODO.md`,
    pin: "1491651533492850769",
    channel: "1491602968741413039",
    format: formatTodoForPin,
    lastMtime: initMtime(`${WORKSPACE}/TODO.md`),
  },
  {
    name: "Strategy",
    file: `${WORKSPACE}/wiki/strategy.md`,
    pin: "1491658212816982066",
    channel: "1491602968741413039",
    format: formatStrategyForPin,
    lastMtime: initMtime(`${WORKSPACE}/wiki/strategy.md`),
  },
];

// Init lastMtime for channel syncs
const channelState = CHANNEL_SYNCS.map(s => ({
  ...s,
  lastMtime: initMtime(s.file),
}));

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
  const lines = md.split("\n");
  const parts: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith("## 北极星")) {
      inSection = true;
      parts.push("🌟 **北极星：人类伴侣**\n");
      continue;
    }
    if (line.startsWith("## 主线")) {
      inSection = true;
      parts.push("\n**主线与辅线：**\n");
      continue;
    }
    if (line.startsWith("## 产品方向")) {
      inSection = true;
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

function formatChannelForPin(md: string, name: string): string {
  const now = timestamp();
  // Strip markdown headers formatting for Discord, keep content readable
  let result = md
    .replace(/^# (.+)$/m, `**$1**`)
    .replace(/^## (.+)$/gm, `\n**$1**`)
    .replace(/^### (.+)$/gm, `__$1__`);

  // Add timestamp
  result = result.trim() + `\n\n_更新: ${now}_`;

  // Discord limit: 2000 chars
  if (result.length > 2000) {
    result = result.substring(0, 1990) + "\n…(截断)";
  }
  return result;
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

function patchPin(channelId: string, pin: string, content: string) {
  const data = JSON.stringify({ content });
  const proxyArg = PROXY ? `-x "${PROXY}"` : "";
  execSync(
    `curl -s -X PATCH "https://discord.com/api/v10/channels/${channelId}/messages/${pin}" ` +
      `-H "Authorization: Bot ${BOT_TOKEN}" ` +
      `-H "Content-Type: application/json" ` +
      `-H "User-Agent: DiscordBot (https://openclaw.ai, 1.0)" ` +
      `${proxyArg} ` +
      `-d ${JSON.stringify(data)}`,
    { timeout: 10000 }
  );
}

function syncAll() {
  // Sync TODO/Strategy pins
  for (const sync of TODO_SYNCS) {
    try {
      const stat = fs.statSync(sync.file);
      if (stat.mtimeMs === sync.lastMtime) continue;
      sync.lastMtime = stat.mtimeMs;

      const content = fs.readFileSync(sync.file, "utf-8");
      const pinContent = sync.format(content);
      patchPin(sync.channel, sync.pin, pinContent);
      console.log(`[todo-pin-sync] ${sync.name} pin updated`);
    } catch {}
  }

  // Sync channel file pins
  for (const sync of channelState) {
    try {
      const stat = fs.statSync(sync.file);
      if (stat.mtimeMs === sync.lastMtime) continue;
      sync.lastMtime = stat.mtimeMs;

      const content = fs.readFileSync(sync.file, "utf-8");
      const pinContent = formatChannelForPin(content, sync.name);
      patchPin(sync.channel, sync.pin, pinContent);
      console.log(`[todo-pin-sync] channel:${sync.name} pin updated`);
    } catch {}
  }
}

const handler = async (event: any) => {
  if (event.type !== "message" || event.action !== "sent") return;

  // Check if any watched file changed
  let anyChanged = false;
  for (const sync of TODO_SYNCS) {
    try {
      const stat = fs.statSync(sync.file);
      if (stat.mtimeMs !== sync.lastMtime) anyChanged = true;
    } catch {}
  }
  for (const sync of channelState) {
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
