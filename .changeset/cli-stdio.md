---
'@noblecloak/diagrammar': minor
---

`diagrammar mcp --stdio` speaks MCP over stdin/stdout (for the Claude Code
plugin and other clients that spawn the server). It cannot be combined with
`--port`, `--host` or `--allow-origin`; `--root`, `--no-fs` and `--icons`
work as before.
