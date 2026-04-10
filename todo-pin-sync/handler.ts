import fs from "node:fs";
import { execSync } from "node:child_process";

const TODO_PATH = `${process.env.HOME}/.openclaw/workspace/TODO.md`;
const PIN_CHANNEL = "1491602968741413039"; // #kagura-dm
const PIN_MESSAGE = "1491651533492850769"; // TODO pin
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY || "";

let lastMtime = 0;
let debounceTimer = null;

function formatTodoForPin(md) {
  // Convert markdown TODO to compact Discord format
  const lines = md.split("\n");
  const sections = [];
  let currentSection = null;
  
  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentSection = { title: line.replace("## ", "").trim(), items: [] };
      sections.push(currentSection);
    } else if (currentSection && line.match(/^- \[.\]/)) {
      const item = line.replace(/^- \[.\] /, "").trim();
      if (item) currentSection.items.push(`• ${item}`);
    }
  }

  const now = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  let result = `📋 **Kagura TODO**（更新: ${now}）\n`;
  for (const section of sections) {
    if (section.items.length > 0) {
      result += `\n**${section.title}：**\n${section.items.join("\n")}\n`;
    }
  }
  return result.trim();
}

function syncPin() {
  try {
    const content = fs.readFileSync(TODO_PATH, "utf-8");
    const pinContent = formatTodoForPin(content);

    const data = JSON.stringify({ content: pinContent });
    execSync(
      `curl -s -X PATCH "https://discord.com/api/v10/channels/${PIN_CHANNEL}/messages/${PIN_MESSAGE}" ` +
        `-H "Authorization: Bot ${BOT_TOKEN}" ` +
        `-H "Content-Type: application/json" ` +
        `-H "User-Agent: DiscordBot (https://openclaw.ai, 1.0)" ` +
        `-x "${PROXY}" ` +
        `-d ${JSON.stringify(data)}`,
      { timeout: 10000 }
    );
    console.log("[todo-pin-sync] Pin updated");
  } catch (err) {
    console.error("[todo-pin-sync] Failed to sync pin:", err.message);
  }
}

const handler = async (event) => {
  if (event.type !== "message" || event.action !== "sent") return;

  try {
    const stat = fs.statSync(TODO_PATH);
    const mtime = stat.mtimeMs;

    if (mtime === lastMtime) return; // No change
    lastMtime = mtime;

    // Debounce: wait 3s to batch rapid changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      syncPin();
      debounceTimer = null;
    }, 3000);
  } catch {
    // TODO.md doesn't exist, skip
  }
};

export default handler;
