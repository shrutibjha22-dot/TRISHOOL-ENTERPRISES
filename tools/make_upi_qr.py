"""
Generates the UPI QR code used on the TRISHOOL ENTERPRISES website.

The QR encodes a standard UPI intent URL for VPA 9324534405@ptaxis.
No amount is baked in: the customer types the amount in their UPI app,
which is the safest approach for a shop that takes variable order totals.

The website additionally builds a *dynamic* upi:// link that prefills the
cart total, so the static QR here is the always-works fallback.
"""

import pathlib
import segno

VPA = "9324534405@ptaxis"
PAYEE_NAME = "TRISHOOL ENTERPRISES"

out_dir = pathlib.Path(__file__).resolve().parent.parent / "assets"
out_dir.mkdir(parents=True, exist_ok=True)

upi_uri = (
    f"upi://pay?pa={VPA}"
    f"&pn={PAYEE_NAME.replace(' ', '%20')}"
    f"&cu=INR"
    f"&tn=Payment%20to%20TRISHOOL%20ENTERPRISES"
)

qr = segno.make(upi_uri, error="m")
png_path = out_dir / "upi-qr.png"
qr.save(png_path, scale=12, border=2, dark="#0B2A5B", light="#FFFFFF")

svg_path = out_dir / "upi-qr.svg"
qr.save(svg_path, scale=12, border=2, dark="#0B2A5B", light="#FFFFFF")

print("UPI intent :", upi_uri)
print("PNG        :", png_path, png_path.stat().st_size, "bytes")
print("SVG        :", svg_path, svg_path.stat().st_size, "bytes")
