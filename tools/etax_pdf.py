"""Local PDF/A-3b validation shared by the e-Tax operator tools."""

import subprocess
from xml.etree import ElementTree


MAX_PDF_SIZE = 2_000_000


def validate_pdfa(verapdf, pdf):
    if not 0 < pdf.stat().st_size <= MAX_PDF_SIZE:
        raise ValueError("PDF is empty or exceeds the SavePulse 2 MB limit")
    result = subprocess.run(
        [verapdf, "--flavour", "3b", "--format", "xml", str(pdf)],
        capture_output=True, timeout=90, check=False,
    )
    try:
        report = ElementTree.fromstring(result.stdout).find(".//validationReport")
    except ElementTree.ParseError:
        report = None
    if result.returncode or report is None or report.get("isCompliant") != "true":
        detail = report.findtext("statement") if report is not None else None
        raise ValueError(f"veraPDF did not validate PDF/A-3b: {detail or result.stderr.decode(errors='replace').strip()}")
