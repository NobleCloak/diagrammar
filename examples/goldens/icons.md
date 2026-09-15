# Order platform with icons

![Order platform with icons](icons.png)

## Elements

- **API gateway** (`gateway`)
- **Kubernetes** (`k8s`)
- **PostgreSQL** (`pg`)
- **Cache** (`cache`)
- **Legacy export** (`legacy`)
- **gateway → k8s** routes
- **k8s → pg** read/write
- **k8s → cache** cache
- **pg → legacy** nightly
