"""Generate and validate a SavePulse TEST invoice on a local workstation."""

import argparse
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory

from PIL import ImageCms
import pikepdf

from etax_pdf import validate_pdfa

MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def create_pdfa(raw_pdf, output):
    with pikepdf.Pdf.open(raw_pdf) as pdf:
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        icc = pdf.make_stream(profile)
        icc.N = 3
        pdf.Root.OutputIntents = pikepdf.Array([
            pikepdf.Dictionary(
                Type=pikepdf.Name.OutputIntent,
                S=pikepdf.Name.GTS_PDFA1,
                OutputConditionIdentifier="sRGB",
                DestOutputProfile=icc,
            )
        ])
        if "/Info" in pdf.trailer:
            del pdf.trailer["/Info"]
        if "/Metadata" in pdf.Root:
            del pdf.Root.Metadata
        with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as metadata:
            metadata["dc:title"] = "SavePulse TEST invoice"
            metadata["pdfaid:part"] = "3"
            metadata["pdfaid:conformance"] = "B"
        pdf.save(output, min_version="1.7", deterministic_id=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", default=shutil.which("google-chrome") or shutil.which("chromium") or MAC_CHROME)
    parser.add_argument("--verapdf", default=shutil.which("verapdf"), help="Path to the veraPDF CLI")
    parser.add_argument("output", type=Path, help="Path for the new TEST PDF")
    args = parser.parse_args()
    if not args.verapdf:
        parser.error("provide --verapdf or add veraPDF to PATH")
    if args.output.exists():
        parser.error("choose an output path that does not exist")

    generator = Path(__file__).with_name("tax-invoice-qa-html.js")
    with TemporaryDirectory(prefix="savepulse-tax-qa-") as folder:
        work = Path(folder)
        html, raw_pdf, pdf = (work / name for name in ("invoice.html", "chrome.pdf", "invoice.pdf"))
        with html.open("wb") as writer:
            subprocess.run(["node", str(generator)], stdout=writer, check=True, timeout=30)
        chrome = subprocess.run([
            args.chrome, "--headless", "--disable-background-networking",
            f"--user-data-dir={work / 'chrome-profile'}", "--no-pdf-header-footer",
            f"--print-to-pdf={raw_pdf}", html.as_uri(),
        ], capture_output=True, timeout=60, check=False)
        if chrome.returncode or not raw_pdf.is_file():
            raise SystemExit(f"Chrome could not print the TEST invoice: {chrome.stderr.decode(errors='replace').strip()}")
        create_pdfa(raw_pdf, pdf)
        try:
            validate_pdfa(args.verapdf, pdf)
        except ValueError as error:
            parser.error(str(error))
        with args.output.open("xb") as target, pdf.open("rb") as source:
            shutil.copyfileobj(source, target)
        print(f"PDF/A-3b validated by veraPDF ({pdf.stat().st_size} bytes): {args.output}")


if __name__ == "__main__":
    main()
