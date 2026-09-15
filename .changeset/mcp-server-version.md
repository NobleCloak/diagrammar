---
'@noblecloak/diagrammar-mcp': patch
---

The MCP server now reports its real package version in the `initialize`
handshake (it was hardcoded to 0.1.0). `SERVER_VERSION` is exported.
