# Annotated order fulfilment

![Annotated order fulfilment](annotated.png)

## Callouts

1. Entry point for both the web UI and MCP-driven agents.
2. Fast path — no human involved.
3. Inventory hold is placed atomically with this check.
4. Terminal state — triggers the fulfilment webhook.

## Elements

- **Order received** (`start`): Submitted via web or MCP.
- **Check inventory** (`check`): Checks the reservation ledger, not raw stock.
- **Create backorder** (`backorder`): Notifies the customer of the delay and reserves the next inbound shipment.
- **Ship order** (`ship`): Hands the order to the configured carrier integration.
- **Order fulfilled** (`done`): Terminal state; triggers the fulfilment webhook.
- **check → ship** in stock
- **check → backorder** out of stock
