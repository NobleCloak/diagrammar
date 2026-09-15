# @noblecloak/diagrammar-icons-lucide

The [Lucide](https://lucide.dev) icon set (ISC) packaged as a Diagrammar `IconSet`, generated
from `lucide-static`. Register it with an `IconRegistry` and reference icons as `icon:
lucide/<name>` in diagram YAML, using the names from lucide.dev:

```ts
import { IconRegistry } from '@noblecloak/diagrammar-core';
import { lucide } from '@noblecloak/diagrammar-icons-lucide';

const registry = new IconRegistry();
registry.register(lucide);
```

```yaml
nodes:
  - { id: db, shape: image, icon: lucide/database }
```

Search available names and aliases with `diagrammar icons search database`.
