# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately using GitHub's private
vulnerability reporting feature for this repository, rather than opening a
public issue: go to the repository's **Security** tab, then **Report a
vulnerability**. This opens a private draft security advisory visible only to
the maintainers.

Please include:

- a description of the vulnerability and its impact,
- steps to reproduce (a minimal `.yaml` file and command line, where relevant),
- the version(s) of `@noblecloak/diagrammar-core`, `@noblecloak/diagrammar-mcp`, and `@noblecloak/diagrammar`
  affected — they release in lockstep via one Changesets `fixed` group, so
  this is normally a single version number.

We aim to acknowledge reports within 5 business days and to ship a fix or
mitigation before any public disclosure. Please give us a reasonable window to
respond before disclosing publicly.

## Supported versions

| Version              | Supported |
| -------------------- | --------- |
| latest `0.x` release | ✅        |
| anything older       | ❌        |

Diagrammar is pre-1.0: there is one supported line (the latest release across
all published packages, which move together under Changesets' fixed
versioning) and no long-term-support branches yet. That will be revisited at
the 1.0 release.

## Scope

This policy covers all three packages published from this repository:
`@noblecloak/diagrammar-core`, `@noblecloak/diagrammar-mcp`, and `@noblecloak/diagrammar`. It does not cover the
two vendored rendering dependencies (D2 and resvg) directly — report issues in
those upstream — but if a Diagrammar-specific misuse of either (for example,
passing untrusted input to a render tool's `source` in a hosted MCP
deployment) creates a vulnerability, that is in scope here.
