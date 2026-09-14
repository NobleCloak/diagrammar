export const GUIDE = `# Diagrammar authoring guide

A Diagrammar file is YAML. Every file starts with:

  diagrammar: 1
  type: flowchart   # flowchart | architecture | sequence

## Flowchart example

\`\`\`yaml
diagrammar: 1
type: flowchart
title: Order fulfilment
nodes:
  - { id: start, label: Order received, shape: oval }
  - { id: check, label: In stock? }
  - { id: ship, label: Ship order }
edges:
  - { from: start, to: check }
  - { id: instock, from: check, to: ship, label: "yes" }
notes:
  - { at: check, text: "Checks the reservation ledger, not raw stock." }
callouts:
  - { at: instock, text: Happy path continues here. }
\`\`\`

## Architecture example

\`\`\`yaml
diagrammar: 1
type: architecture
groups:
  - { id: aws, label: AWS }
nodes:
  - { id: api, label: API, shape: rect, in: aws }
  - { id: db, label: Postgres, shape: cylinder, in: aws }
edges:
  - { from: api, to: db }
\`\`\`

## Sequence example

\`\`\`yaml
diagrammar: 1
type: sequence
participants:
  - { id: user, label: User, kind: actor }
  - { id: api, label: API }
messages:
  - { from: user, to: api, label: "POST /orders", style: sync }
  - { from: api, to: user, label: "201 Created", style: return }
\`\`\`

Notes and callouts (see the flowchart example above) attach to any element
via "at" — a node id, an edge id, or an id-less edge's {from, to} pair.

Rules: every id must be unique across the file; every "from"/"to"/"in"/"at"
must reference an existing id; edges without an explicit id must have a
unique {from, to} pair. Call "diagrammar_validate" before "diagrammar_render"
to get errors with a JSON path and a YAML line number instead of a stack
trace.

## Editing with "diagrammar_edit"

Give exactly one of "ops" (typed operations) or "patch" (an RFC 6902 JSON
Patch array) — never both, never neither.

### Typed operations, by family

Every item in "ops" is an object with an "op" field naming the change:

- Nodes, groups, edges (flowchart/architecture): addNode, updateNode,
  removeNode, addGroup, updateGroup, removeGroup, addEdge, updateEdge,
  removeEdge.
- Participants, messages (sequence): addParticipant, updateParticipant,
  removeParticipant, insertMessage, updateMessage, removeMessage.
- Notes, callouts, views: addNote, updateNote, removeNote, addCallout,
  updateCallout, removeCallout, setView, removeView.
- Meta and renaming (any diagram type): setMeta, renameId.

### Selectors

Operations that address an existing element take a "target" selector, one
of:

- { id } — by id (nodes, groups, participants, notes, callouts, views).
- { from, to } — by endpoint pair (an id-less edge or message).
- { path } — a raw structural path, for cases the two forms above can't
  reach.

### Anchors

addNode, addGroup, addEdge, and addParticipant each accept an optional
"before" or "after" selector to place the new element next to an existing
one — give at most one of the two. insertMessage additionally accepts
"at": "end" as a third, mutually exclusive alternative to before/after,
appending to the top-level "messages" list.

### Cascade

removeNode, removeGroup, and removeParticipant accept an optional
"cascade": true to also remove everything that still references the
removed element (edges, messages, notes, callouts). Without "cascade", a
removal that would leave a dangling reference is rejected instead.
removeEdge and removeMessage have no "cascade" option: they always refuse
when a note or callout still references them.

### "setView" is a full replacement, not a merge

"setView" upserts a view by id. When a view with that id already exists,
its entire mapping is replaced by the operation's "view" — a field the old
view had that's omitted here (e.g. "title") is cleared, not carried
forward. Use "removeView" to delete a view outright.

### "update*" ops are a shallow merge

Every updateNode / updateGroup / updateEdge / updateParticipant /
updateMessage / updateNote / updateCallout op takes a "patch" object
merged shallowly onto the target: a key present in "patch" overwrites that
field, a key given as the literal value null deletes it, and any key not
mentioned in "patch" is left alone.

### Optimistic concurrency

Pass "expectedHash" (a content hash previously seen from
"diagrammar_describe" or an earlier "diagrammar_edit" response) to have the
edit rejected with a conflict error — no mutation made — if the document's
current hash no longer matches.

### Example: typed ops

\`\`\`json
[
  {
    "op": "addNode",
    "node": { "id": "review", "label": "Review order" },
    "after": { "id": "check" }
  },
  { "op": "addEdge", "edge": { "from": "check", "to": "review" } }
]
\`\`\`

### Example: JSON Patch

\`\`\`json
[
  { "op": "add", "path": "/nodes/-", "value": { "id": "review", "label": "Review order" } }
]
\`\`\`
`;
