"""Prepare a local e-Tax invoice email for operator review."""

import argparse
from datetime import date
from email.headerregistry import Address
from email.message import EmailMessage
from email.policy import SMTP
import json
from pathlib import Path
import re
import shutil
import subprocess
from tempfile import TemporaryDirectory

from etax_pdf import MAX_PDF_SIZE, validate_pdfa


REGISTERED_SENDER = "savepulse.cloud@gmail.com"
ETDA_PRODUCTION = "csemail@etax.teda.th"
ETDA_UAT = "csemail@uat.etax.teda.th"
SELLER_CONFIG = Path(__file__).resolve().parents[1] / "config" / "billing-seller.json"
DOCUMENT_ID = re.compile(
    r"^เลขที่ ((?:TEST-)?SP-TI-[0-9]{6}-[0-9]{6}) · วันที่ ([0-9]{4}-[0-9]{2}-[0-9]{2})$",
    re.MULTILINE,
)


def one_mailbox(value):
    if not value or re.search(r"[\s<>,;]", value):
        raise ValueError("enter a single email address")
    addr = Address(addr_spec=value)
    if not addr.username or "." not in addr.domain or str(addr) != value:
        raise ValueError("enter a single email address")
    return addr


def compose_invoice_email(mode, text, pdf_data, sender=None, buyer=None):
    if mode not in {"preview", "uat", "live"}:
        raise ValueError("unknown delivery mode")
    matches = DOCUMENT_ID.findall(text)
    if len(matches) != 1:
        raise ValueError("expected one invoice number and date in the SavePulse PDF")
    number, issue_date = matches[0]
    issued = date.fromisoformat(issue_date)
    test_document = number.startswith("TEST-")
    if test_document != (mode != "live"):
        raise ValueError("invoice number does not match delivery mode")
    if mode == "live":
        seller_tax_id = json.loads(SELLER_CONFIG.read_text(encoding="utf-8"))["taxId"]
        if ("ใบกำกับภาษี / Tax Invoice" not in text.splitlines() or
                f"เลขผู้เสียภาษี {seller_tax_id} · สำนักงานใหญ่ 00000" not in text or
                "TEST DOCUMENT" in text or "TEST ONLY" in text):
            raise ValueError("expected a production SavePulse invoice for the registered seller")
        if sender != REGISTERED_SENDER:
            raise ValueError("use the production sender registered for SavePulse")
    elif "TEST ONLY" not in text:
        raise ValueError("expected a PDF marked TEST ONLY")

    if mode == "preview":
        if sender or buyer:
            raise ValueError("preview uses reserved example email addresses")
        sender, buyer, cc = ("sender@example.invalid", "buyer@example.invalid", "etda@example.invalid")
    else:
        cc = ETDA_PRODUCTION if mode == "live" else ETDA_UAT
    sender = one_mailbox(sender)
    buyer = one_mailbox(buyer)
    if buyer.domain.lower().endswith("etax.teda.th") or sender.domain.lower().endswith("etax.teda.th"):
        raise ValueError("ETDA may appear only in the prescribed Cc field")

    message = EmailMessage(policy=SMTP)
    message["From"], message["To"], message["Cc"] = sender, buyer, cc
    email_date = f"{issued.day:02d}{issued.month:02d}{issued.year + 543:04d}"
    message["Subject"] = f"[{email_date}][INV][{number}]"
    message.set_content("เรียนผู้รับบริการ\n\nโปรดดูใบกำกับภาษีที่แนบมาครับ\n\nSavePulse")
    message.add_attachment(pdf_data, maintype="application", subtype="pdf", filename=f"{number}.pdf")
    return message


def main():
    import pymupdf

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("preview", "uat", "live"), default="preview")
    parser.add_argument("--from", dest="sender")
    parser.add_argument("--to", dest="buyer")
    parser.add_argument("--verapdf", default=shutil.which("verapdf"))
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if not args.verapdf:
        parser.error("provide --verapdf or add veraPDF to PATH")
    if args.output.suffix.lower() != ".eml" or args.output.exists():
        parser.error("choose a new .eml output path")

    try:
        with args.pdf.open("rb") as source:
            pdf_data = source.read(MAX_PDF_SIZE + 1)
        with TemporaryDirectory(prefix="savepulse-etax-email-") as folder:
            snapshot = Path(folder) / "invoice.pdf"
            snapshot.write_bytes(pdf_data)
            validate_pdfa(args.verapdf, snapshot)
        with pymupdf.open(stream=pdf_data, filetype="pdf") as document:
            text = "\n".join(page.get_text() for page in document)
        message = compose_invoice_email(args.mode, text, pdf_data, args.sender, args.buyer)
        with args.output.open("xb") as target:
            target.write(message.as_bytes())
    except (OSError, ValueError, subprocess.TimeoutExpired, pymupdf.FileDataError) as error:
        parser.error(str(error))
    print(f"Prepared a local {args.mode} email draft: {args.output}")


if __name__ == "__main__":
    main()
