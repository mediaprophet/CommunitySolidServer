"""
Thin CKAN plugin for the Databox CKAN Bridge (CKAN-02).

This plugin's only job is to catch core CKAN events and forward them via webhooks
to the bridge microservice. It implements only the interfaces strictly required:

- IRoutes / IActions: expose custom /api/3/action/ckan_bridge_* endpoints for the bridge
  to call back for dataset status synchronisation.
- IAuthFunctions: restrict write access to the bridge's service API token only;
  public users get read-only.
- IDatasetForm: add Databox-specific metadata fields (provenance IRI, ODRL policy IRI,
  SHACL shape IRI, consent receipt IRI) to dataset schemas.

NO business logic, NO RDF parsing, NO SHACL validation, NO Solid authentication.
All heavy lifting is offloaded to the bridge microservice.
"""

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone

import ckan.plugins as plugins
import ckan.plugins.toolkit as toolkit
import requests

logger = logging.getLogger(__name__)

# Databox metadata fields added to dataset schemas
DATABOX_FIELDS = [
    ("databox_provenance_iri", "text", "Pod resource IRI this dataset was published from"),
    ("databox_policy_iri", "text", "ODRL policy IRI governing the source record"),
    ("databox_shacl_shape_iri", "text", "SHACL shape IRI used to validate the data"),
    ("databox_consent_receipt_iri", "text", "Signed consent receipt IRI authorising the publication"),
]


def _get_config(key: str, env_var: str) -> str | None:
    """Get a config value from CKAN config or environment variable."""
    value = toolkit.config.get(key)
    if value:
        return str(value)
    return os.environ.get(env_var)


def _get_webhook_url() -> str | None:
    return _get_config("ckanext.databox_bridge.webhook_url", "DATABOX_BRIDGE_WEBHOOK_URL")


def _get_webhook_secret() -> str | None:
    return _get_config("ckanext.databox_bridge.webhook_secret", "DATABOX_BRIDGE_WEBHOOK_SECRET")


def _get_service_token() -> str | None:
    return _get_config("ckanext.databox_bridge.service_token", "DATABOX_BRIDGE_SERVICE_TOKEN")


def _sign_webhook(body: str, secret: str) -> str:
    """Compute HMAC-SHA256 signature for the webhook body."""
    return hmac.new(
        secret.encode("utf-8"),
        body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _emit_webhook(event_type: str, dataset_id: str | None = None,
                  resource_id: str | None = None) -> None:
    """Emit a webhook to the bridge with opaque ids and a callback URL only.

    No sensitive content is included — the bridge fetches details via the Action API
    using its service token.
    """
    webhook_url = _get_webhook_url()
    if not webhook_url:
        logger.warning("databox_bridge: webhook URL not configured, skipping event %s", event_type)
        return

    webhook_secret = _get_webhook_secret()
    if not webhook_secret:
        logger.warning("databox_bridge: webhook secret not configured, skipping event %s", event_type)
        return

    callback_base = toolkit.config.get("ckan.site_url", "")
    payload = {
        "type": event_type,
        "dataset_id": dataset_id,
        "resource_id": resource_id,
        "callback_url": f"{callback_base}/api/3/action/package_show?id={dataset_id}" if dataset_id else "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    body = json.dumps(payload, separators=(",", ":"))
    signature = _sign_webhook(body, webhook_secret)

    try:
        response = requests.post(
            webhook_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Databox-Signature": signature,
            },
            timeout=10,
        )
        response.raise_for_status()
        logger.info("databox_bridge: webhook %s sent for dataset %s", event_type, dataset_id)
    except requests.RequestException as e:
        logger.error("databox_bridge: webhook delivery failed for %s: %s", event_type, e)


class DataboxBridgePlugin(plugins.SingletonPlugin):
    """Thin CKAN plugin for the Databox CKAN Bridge."""

    plugins.implements(plugins.IActions)
    plugins.implements(plugins.IAuthFunctions)
    plugins.implements(plugins.IDatasetForm, inherit=True)

    # --- IActions ---

    def get_actions(self):
        """Expose custom Action API endpoints for the bridge to call back."""
        return {
            "ckan_bridge_status": _action_ckan_bridge_status,
            "ckan_bridge_sync": _action_ckan_bridge_sync,
        }

    # --- IAuthFunctions ---

    def get_auth_functions(self):
        """Restrict write access to the bridge service token; public read-only."""
        return {
            "ckan_bridge_status": _auth_ckan_bridge_status,
            "ckan_bridge_sync": _auth_ckan_bridge_sync,
        }

    # --- IDatasetForm ---

    def _modify_package_schema(self, schema):
        """Add Databox metadata fields to the dataset schema."""
        for field_id, field_type, _help in DATABOX_FIELDS:
            schema.update({
                field_id: [
                    toolkit.get_validator("ignore_missing"),
                    toolkit.get_validator("unicode_safe"),
                ],
            })
        return schema

    def create_package_schema(self):
        schema = super().create_package_schema()
        return self._modify_package_schema(schema)

    def update_package_schema(self):
        schema = super().update_package_schema()
        return self._modify_package_schema(schema)

    def show_package_schema(self):
        schema = super().show_package_schema()
        for field_id, _field_type, _help in DATABOX_FIELDS:
            schema.update({
                field_id: [
                    toolkit.get_validator("ignore_missing"),
                    toolkit.get_validator("unicode_safe"),
                ],
            })
        return schema

    def is_fallback(self):
        return False

    def package_types(self):
        return []


# --- Action functions ---

def _action_ckan_bridge_sync(context, data_dict):
    """Bridge callback to synchronise dataset status.

    The bridge calls this to record that a dataset was published from a Pod resource.
    Only the bridge service token is authorised to call this.
    """
    toolkit.check_access("ckan_bridge_sync", context, data_dict)

    dataset_id = data_dict.get("dataset_id")
    if not dataset_id:
        raise toolkit.ValidationError({"dataset_id": ["dataset_id is required"]})

    databox_metadata = {
        "databox_provenance_iri": data_dict.get("databox_provenance_iri"),
        "databox_policy_iri": data_dict.get("databox_policy_iri"),
        "databox_shacl_shape_iri": data_dict.get("databox_shacl_shape_iri"),
        "databox_consent_receipt_iri": data_dict.get("databox_consent_receipt_iri"),
    }

    # Patch the dataset with Databox metadata (extras)
    extras = [{"key": k, "value": v} for k, v in databox_metadata.items() if v]
    if extras:
        toolkit.get_action("package_patch")(context, {
            "id": dataset_id,
            "extras": extras,
        })

    return {"success": True, "dataset_id": dataset_id}


def _action_ckan_bridge_status(context, data_dict):
    """Return the bridge plugin status and configuration (read-only, public)."""
    return {
        "success": True,
        "plugin": "ckanext-databox-bridge",
        "version": "0.1.0",
        "webhook_configured": _get_webhook_url() is not None,
    }


# --- Auth functions ---

def _auth_ckan_bridge_status(context, data_dict):
    """Public read-only access to bridge status."""
    return {"success": True}


def _auth_ckan_bridge_sync(context, data_dict):
    """Only the bridge service token can call the sync action."""
    service_token = _get_service_token()
    if not service_token:
        return {"success": False}

    # Check if the requesting user's API key matches the service token
    api_key = context.get("user") or context.get("auth_user_obj", None)
    if api_key and hasattr(api_key, "apikey") and api_key.apikey == service_token:
        return {"success": True}

    # Also check via the model (token-based auth)
    user_obj = context.get("auth_user_obj")
    if user_obj and hasattr(user_obj, "apikey") and user_obj.apikey == service_token:
        return {"success": True}

    # Check if the token is passed directly
    token_in_data = data_dict.get("service_token")
    if token_in_data and token_in_data == service_token:
        return {"success": True}

    return {"success": False}


# --- Webhook emitters (called by CKAN event hooks) ---

def _on_dataset_created(context, data_dict):
    """Hook: dataset was created in CKAN."""
    dataset_id = data_dict.get("id")
    _emit_webhook("dataset_created", dataset_id=dataset_id)


def _on_dataset_updated(context, data_dict):
    """Hook: dataset metadata changed."""
    dataset_id = data_dict.get("id")
    _emit_webhook("dataset_updated", dataset_id=dataset_id)


def _on_dataset_deleted(context, data_dict):
    """Hook: dataset was deleted."""
    dataset_id = data_dict.get("id")
    _emit_webhook("dataset_deleted", dataset_id=dataset_id)
