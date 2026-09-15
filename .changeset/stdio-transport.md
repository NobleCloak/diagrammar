---
'@noblecloak/diagrammar-mcp': minor
---

New `serveStdio(config)` runs the same tools and resources over stdio for
clients that spawn the server themselves. `buildContext` and `buildServer`
are exported so other transports can reuse the registered server.
