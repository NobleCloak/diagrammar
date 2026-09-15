# @noblecloak/diagrammar-icons-simple-icons

The [Simple Icons](https://simpleicons.org) brand mark set (CC0-1.0) packaged as a Diagrammar
`IconSet`, generated from `simple-icons`. Register it with an `IconRegistry` and reference icons
as `icon: simple-icons/<slug>` in diagram YAML:

```ts
import { IconRegistry } from '@noblecloak/diagrammar-core';
import { simpleIcons } from '@noblecloak/diagrammar-icons-simple-icons';

const registry = new IconRegistry();
registry.register(simpleIcons);
```

```yaml
nodes:
  - { id: db, shape: image, icon: simple-icons/postgresql }
```

Search available slugs and aliases with `diagrammar icons search postgresql`.

This set contains no Amazon/AWS marks; use `diagrammar icons import aws` for those. Brand marks
remain the property of their owners — see [NOTICE.md](./NOTICE.md) (the upstream disclaimer)
before using a mark in your project.
