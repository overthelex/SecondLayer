import sys, zipfile, re
from pathlib import Path
p = Path(sys.argv[1])
if p.suffix == ".docx":
    xml = zipfile.ZipFile(p).read("word/document.xml").decode()
    t = " ".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", xml, re.S))
else:
    t = p.read_text(encoding="utf-8", errors="ignore")
print("chars:", len(t))
print("---")
print(t[:900])
