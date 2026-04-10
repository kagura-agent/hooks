---
name: todo-pin-sync
description: "Auto-sync TODO.md to Discord #kagura-dm pin whenever the file changes"
metadata:
  {
    "openclaw":
      {
        "emoji": "📌",
        "events": ["message:sent"],
        "requires": { "bins": ["curl"] },
      },
  }
---

# TODO Pin Sync Hook

Watches TODO.md for changes and automatically updates the Discord #kagura-dm pin message.

Triggered on every `message:sent` event but only does work when TODO.md mtime has changed since last check. Zero overhead when nothing changed.
