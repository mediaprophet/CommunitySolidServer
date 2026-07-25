# ckanext-databox-bridge

> **This is an opt-in deployment profile.** This plugin does not change CKAN's default behavior
> unless the `databox_bridge` plugin is explicitly enabled in CKAN's `ckan.ini` configuration.

## What this is

A minimal CKAN plugin that:
- Emits webhooks to the Databox CKAN Bridge on dataset lifecycle events (created, updated, deleted, datastore changes).
- Exposes custom Action API endpoints for the bridge to call back for status synchronisation.
- Adds Databox-specific metadata fields to dataset schemas (provenance IRI, policy IRI, SHACL shape IRI, consent receipt IRI).
- Restricts write access to the bridge's service API token only; public users get read-only.

## What this is NOT

- No business logic, no heavy data processing, no external API routing.
- No Solid authentication, no RDF parsing, no SHACL validation.
- No direct database manipulation.

All heavy lifting is offloaded to the bridge microservice.

## Installation

```sh
cd ckan-bridge/ckan-plugin
pip install -e .
```

Enable in `ckan.ini`:

```ini
ckan.plugins = activity datastore databox_bridge
```

## Configuration

Set these in `ckan.ini` or via environment variables:

| Config | Env var | Description |
|---|---|---|
| `ckanext.databox_bridge.webhook_url` | `DATABOX_BRIDGE_WEBHOOK_URL` | Bridge webhook endpoint URL |
| `ckanext.databox_bridge.webhook_secret` | `DATABOX_BRIDGE_WEBHOOK_SECRET` | Shared HMAC secret for webhook signing |
| `ckanext.databox_bridge.service_token` | `DATABOX_BRIDGE_SERVICE_TOKEN` | Bridge service API token for write access |
