#!/usr/bin/env python3
"""Build the Santhira dashboard HTML file from parts."""
import os

OUT = os.path.join(os.path.dirname(__file__), "index.html")
parts_dir = os.path.join(os.path.dirname(__file__), "parts")
os.makedirs(parts_dir, exist_ok=True)

def build():
    pieces = []
    # Ordered list: numbered parts with sub-parts (p5a, p5b, p5c) inserted after p5
    order = []
    for i in range(1, 20):
        order.append(f"p{i}.html")
        if i == 5:
            order.extend(["p5a.html", "p5b.html", "p5c.html"])
    for name in order:
        p = os.path.join(parts_dir, name)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                pieces.append(f.read())
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(pieces))
    print(f"Built {OUT} ({os.path.getsize(OUT)} bytes, {len(pieces)} parts)")

if __name__ == "__main__":
    build()
