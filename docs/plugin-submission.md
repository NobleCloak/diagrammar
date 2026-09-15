# Submitting the plugin to the Claude Code plugin directory

Maintainer checklist. Users do not need any of this: they install with
`claude plugin marketplace add NobleCloak/diagrammar` and
`claude plugin install diagrammar@noblecloak`.

## Before submitting

- [ ] `plugin/.claude-plugin/plugin.json` `version` equals the released
      `@noblecloak/diagrammar` version (CI test `scripts/plugin.test.ts`).
- [ ] That version is live on npm with provenance (`npm view @noblecloak/diagrammar version`).
- [ ] Fresh install works end to end in a scratch project:
      `claude plugin marketplace add NobleCloak/diagrammar`,
      `claude plugin install diagrammar@noblecloak`, then `/mcp` shows `diagrammar`
      connected and a `diagrammar_render` call succeeds.
- [ ] `claude plugin validate ./plugin --strict` and
      `claude plugin validate ./.claude-plugin/marketplace.json --strict` both pass.
- [ ] The marketplace entry on `main` is installable the moment it merges: the CLI version
      pinned by `plugin.json`/`.mcp.json` must already be live on npm before announcing the
      plugin (the sync script moves both together in the Version Packages PR).

## The form

Submit at https://clau.de/plugin-directory-submission. The source is a
`git-subdir` entry:

- `url` = `https://github.com/NobleCloak/diagrammar`
- `path` = `plugin`
- `ref` = the release tag for the CLI version in `plugin.json`
  (`@noblecloak/diagrammar@<version>`)
- `sha` = that tag's commit (`git rev-parse '@noblecloak/diagrammar@<version>^{commit}'`)

## Security notes (what reviewers ask)

- File access is jailed to the working directory Claude Code spawned the
  server in: lexical normalisation plus symlink resolution
  (`packages/mcp/src/fs.ts`, `resolveInRoot`).
- `--no-fs` runs the server with no filesystem access at all; path-based
  tools are not even registered.
- Local `.svg` icons pass a sanitizer (scripts, event handlers, external
  references and `<style>` rejected; 256 KB cap).
- The server makes no network calls. The only network activity is `npx`
  fetching `@noblecloak/diagrammar` from npm, published with provenance
  attestations via trusted publishing.
- The plugin has no hooks, commands or agents, and reads no environment
  variables.

## Resubmitting

Resubmit whenever `plugin.json` changes its version: the directory pins the
`sha`, so a new release is invisible until the entry moves.
