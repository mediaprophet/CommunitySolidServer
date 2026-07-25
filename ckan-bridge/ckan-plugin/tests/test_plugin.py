"""
Unit tests for the Databox Bridge CKAN plugin (CKAN-02).

These tests verify:
- The plugin class exists and implements the required interfaces.
- Webhook emission with HMAC signature (opaque payload only).
- Auth functions restrict write access to the service token.
- Databox metadata fields are added to the dataset schema.
- Custom actions respond correctly.

Tests use mocking — no CKAN server is required.
"""

import hashlib
import hmac
import json
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


class TestDataboxBridgePlugin(unittest.TestCase):
    """Test the DataboxBridgePlugin class."""

    def test_plugin_import(self):
        """The plugin module imports without error."""
        from ckanext.databox_bridge.plugin import DataboxBridgePlugin
        self.assertIsNotNone(DataboxBridgePlugin)

    def test_plugin_is_singleton(self):
        """The plugin is a SingletonPlugin."""
        import ckan.plugins as plugins
        from ckanext.databox_bridge.plugin import DataboxBridgePlugin
        self.assertTrue(issubclass(DataboxBridgePlugin, plugins.SingletonPlugin))

    def test_databox_fields_defined(self):
        """Databox metadata fields are defined."""
        from ckanext.databox_bridge.plugin import DATABOX_FIELDS
        field_ids = [f[0] for f in DATABOX_FIELDS]
        self.assertIn("databox_provenance_iri", field_ids)
        self.assertIn("databox_policy_iri", field_ids)
        self.assertIn("databox_shacl_shape_iri", field_ids)
        self.assertIn("databox_consent_receipt_iri", field_ids)


class TestWebhookEmission(unittest.TestCase):
    """Test webhook emission with HMAC signing."""

    @patch("ckanext.databox_bridge.plugin._get_webhook_url")
    @patch("ckanext.databox_bridge.plugin._get_webhook_secret")
    @patch("ckanext.databox_bridge.plugin.requests.post")
    @patch("ckanext.databox_bridge.plugin.toolkit.config", {"ckan.site_url": "https://ckan.example.org"})
    def test_emit_webhook_signs_body(self, mock_post, mock_secret, mock_url):
        """Webhook is signed with HMAC-SHA256 and carries only opaque ids."""
        from ckanext.databox_bridge.plugin import _emit_webhook, _sign_webhook

        mock_url.return_value = "https://bridge.example.org/webhook"
        mock_secret.return_value = "test-secret"

        _emit_webhook("dataset_created", dataset_id="test-001")

        self.assertTrue(mock_post.called)
        call_args = mock_post.call_args

        # Verify the body contains only opaque ids
        body = json.loads(call_args[1]["data"])
        self.assertEqual(body["type"], "dataset_created")
        self.assertEqual(body["dataset_id"], "test-001")
        self.assertIn("callback_url", body)
        self.assertIn("timestamp", body)

        # Verify the signature header
        signature = call_args[1]["headers"]["X-Databox-Signature"]
        expected_sig = _sign_webhook(call_args[1]["data"], "test-secret")
        self.assertEqual(signature, expected_sig)

    @patch("ckanext.databox_bridge.plugin._get_webhook_url")
    @patch("ckanext.databox_bridge.plugin._get_webhook_secret")
    @patch("ckanext.databox_bridge.plugin.requests.post")
    def test_emit_webhook_no_sensitive_content(self, mock_post, mock_secret, mock_url):
        """Webhook payload contains NO sensitive content — only opaque ids and callback URL."""
        from ckanext.databox_bridge.plugin import _emit_webhook

        mock_url.return_value = "https://bridge.example.org/webhook"
        mock_secret.return_value = "test-secret"

        _emit_webhook("dataset_updated", dataset_id="test-002")

        body = json.loads(mock_post.call_args[1]["data"])
        # Must NOT contain any data fields, only metadata
        allowed_keys = {"type", "dataset_id", "resource_id", "callback_url", "timestamp"}
        self.assertEqual(set(body.keys()) - {None}, set(body.keys()))
        for key in body:
            self.assertIn(key, allowed_keys)

    @patch("ckanext.databox_bridge.plugin._get_webhook_url")
    @patch("ckanext.databox_bridge.plugin.requests.post")
    def test_emit_webhook_no_url_skips(self, mock_post, mock_url):
        """Webhook emission is skipped when URL is not configured."""
        from ckanext.databox_bridge.plugin import _emit_webhook

        mock_url.return_value = None
        _emit_webhook("dataset_created", dataset_id="test-003")
        self.assertFalse(mock_post.called)

    @patch("ckanext.databox_bridge.plugin._get_webhook_url")
    @patch("ckanext.databox_bridge.plugin._get_webhook_secret")
    @patch("ckanext.databox_bridge.plugin.requests.post")
    def test_emit_webhook_no_secret_skips(self, mock_post, mock_secret, mock_url):
        """Webhook emission is skipped when secret is not configured."""
        from ckanext.databox_bridge.plugin import _emit_webhook

        mock_url.return_value = "https://bridge.example.org/webhook"
        mock_secret.return_value = None
        _emit_webhook("dataset_created", dataset_id="test-004")
        self.assertFalse(mock_post.called)

    def test_sign_webhook(self):
        """HMAC-SHA256 signature is computed correctly."""
        from ckanext.databox_bridge.plugin import _sign_webhook
        body = '{"type":"dataset_created","dataset_id":"test"}'
        secret = "test-secret"
        sig = _sign_webhook(body, secret)
        expected = hmac.new(
            secret.encode("utf-8"),
            body.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(sig, expected)


class TestAuthFunctions(unittest.TestCase):
    """Test auth functions restrict write access."""

    @patch("ckanext.databox_bridge.plugin._get_service_token")
    def test_sync_auth_rejects_no_token(self, mock_token):
        """Sync auth rejects when no service token is configured."""
        from ckanext.databox_bridge.plugin import _auth_ckan_bridge_sync
        mock_token.return_value = None
        result = _auth_ckan_bridge_sync({}, {})
        self.assertFalse(result["success"])

    @patch("ckanext.databox_bridge.plugin._get_service_token")
    def test_sync_auth_rejects_wrong_token(self, mock_token):
        """Sync auth rejects a wrong token."""
        from ckanext.databox_bridge.plugin import _auth_ckan_bridge_sync
        mock_token.return_value = "correct-token"
        result = _auth_ckan_bridge_sync({}, {"service_token": "wrong-token"})
        self.assertFalse(result["success"])

    @patch("ckanext.databox_bridge.plugin._get_service_token")
    def test_sync_auth_accepts_correct_token(self, mock_token):
        """Sync auth accepts the correct service token."""
        from ckanext.databox_bridge.plugin import _auth_ckan_bridge_sync
        mock_token.return_value = "correct-token"
        result = _auth_ckan_bridge_sync({}, {"service_token": "correct-token"})
        self.assertTrue(result["success"])

    def test_status_auth_is_public(self):
        """Status auth is public read-only."""
        from ckanext.databox_bridge.plugin import _auth_ckan_bridge_status
        result = _auth_ckan_bridge_status({}, {})
        self.assertTrue(result["success"])


class TestActions(unittest.TestCase):
    """Test custom Action API endpoints."""

    @patch("ckanext.databox_bridge.plugin._get_webhook_url")
    def test_status_action_returns_info(self, mock_url):
        """Status action returns plugin info."""
        from ckanext.databox_bridge.plugin import _action_ckan_bridge_status
        mock_url.return_value = "https://bridge.example.org/webhook"
        result = _action_ckan_bridge_status({}, {})
        self.assertTrue(result["success"])
        self.assertEqual(result["plugin"], "ckanext-databox-bridge")
        self.assertTrue(result["webhook_configured"])

    @patch("ckanext.databox_bridge.plugin._get_webhook_url")
    def test_status_action_no_webhook(self, mock_url):
        """Status action reports when webhook is not configured."""
        from ckanext.databox_bridge.plugin import _action_ckan_bridge_status
        mock_url.return_value = None
        result = _action_ckan_bridge_status({}, {})
        self.assertFalse(result["webhook_configured"])


if __name__ == "__main__":
    unittest.main()
