# Order approval

## Callouts

1. Entry point for every order.

## Elements

- **User** (`user`)
- **API** (`api`)
- **Orders DB** (`db`)
- **user → api** POST /orders
- **api → db** reserve stock
- **api → db** flag backorder
