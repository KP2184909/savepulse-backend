import unittest

from etax_email import compose_invoice_email


TEST_TEXT = "TEST ONLY — ใบกำกับภาษีทดสอบ\nเลขที่ TEST-SP-TI-202611-000001 · วันที่ 2026-11-24\n"
LIVE_TEXT = (
    "ใบกำกับภาษี / Tax Invoice\nเลขที่ SP-TI-202611-000001 · วันที่ 2026-11-24\n"
    "เลขผู้เสียภาษี 0125554006077 · สำนักงานใหญ่ 00000"
)
SENDER = "savepulse.cloud@gmail.com"


class InvoiceEmailTest(unittest.TestCase):
    def test_preview_has_no_routable_delivery_address(self):
        message = compose_invoice_email("preview", TEST_TEXT, b"fixture PDF")
        self.assertEqual(message["Subject"], "[24112569][INV][TEST-SP-TI-202611-000001]")
        self.assertTrue(str(message["To"]).endswith("@example.invalid"))
        self.assertTrue(str(message["Cc"]).endswith("@example.invalid"))
        attachments = list(message.iter_attachments())
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0].get_filename(), "TEST-SP-TI-202611-000001.pdf")
        self.assertEqual(attachments[0].get_payload(decode=True), b"fixture PDF")

    def test_live_draft_uses_only_registered_sender_and_one_buyer(self):
        message = compose_invoice_email("live", LIVE_TEXT, b"fixture PDF", SENDER, "buyer@example.com")
        self.assertEqual(message["From"], SENDER)
        self.assertEqual(message["To"], "buyer@example.com")
        self.assertEqual(message["Cc"], "csemail@etax.teda.th")
        self.assertEqual(message["Subject"], "[24112569][INV][SP-TI-202611-000001]")

    def test_rejects_wrong_mode_addresses_and_ambiguous_document_identity(self):
        cases = [
            ("live", TEST_TEXT, SENDER, "buyer@example.com"),
            ("live", LIVE_TEXT, "other@example.com", "buyer@example.com"),
            ("live", LIVE_TEXT, SENDER, "buyer@example.com, other@example.com"),
            ("live", LIVE_TEXT, SENDER, "buyer@example.com\nBcc: other@example.com"),
            ("live", LIVE_TEXT, SENDER, "csemail@etax.teda.th"),
            ("live", LIVE_TEXT.replace("0125554006077", "0000000000000"), SENDER, "buyer@example.com"),
            ("uat", LIVE_TEXT, SENDER, "buyer@example.com"),
            ("preview", TEST_TEXT.replace("2026-11-24", "2026-11-31"), None, None),
            ("preview", TEST_TEXT + TEST_TEXT, None, None),
        ]
        for inputs in cases:
            mode, text, sender, buyer = inputs
            with self.subTest(inputs=inputs), self.assertRaises(ValueError):
                compose_invoice_email(mode, text, b"fixture PDF", sender, buyer)

    def test_uat_addresses_test_service_only(self):
        message = compose_invoice_email("uat", TEST_TEXT, b"fixture PDF", SENDER, "buyer@example.com")
        self.assertEqual(message["Cc"], "csemail@uat.etax.teda.th")


if __name__ == "__main__":
    unittest.main()
