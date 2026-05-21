"""Text cleaning utilities for CPT pipeline."""

import re
import unicodedata


RE_MULTI_NEWLINE = re.compile(r'\n{3,}')
RE_MULTI_SPACE = re.compile(r'[ \t]{2,}')
RE_CONTROL_CHARS = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')

RE_RTF_CONTROL = re.compile(r'\\[a-zA-Z]+-?\d*\s?')
RE_RTF_PAR = re.compile(r'\\par\b')
RE_RTF_LINE = re.compile(r'\\line\b')
RE_RTF_TAB = re.compile(r'\\tab\b')
RE_RTF_BYTE = re.compile(r"\\'([0-9a-fA-F]{2})")
RE_RTF_UNICODE = re.compile(r'\\u(\d+)\??')
RE_RTF_HEADER = re.compile(r'\\rtf1[^\\{]*')

RE_XML_TAGS = re.compile(r'<[^>]+>')

RE_REPEATED_SENTENCE = re.compile(r'(.{30,}?[.!?])\s*(?:\1\s*){3,}', re.DOTALL)


def _decode_win1251_byte(match):
    byte_val = int(match.group(1), 16)
    if byte_val > 127:
        try:
            return bytes([byte_val]).decode('windows-1251')
        except Exception:
            return chr(byte_val)
    return chr(byte_val)


def _decode_unicode(match):
    code = int(match.group(1))
    return chr(code) if 0 <= code <= 0x10FFFF else ''


def clean_rtf_artifacts(text: str) -> str:
    if '\\rtf' in text[:50] or '\\par' in text[:500]:
        text = RE_RTF_PAR.sub('\n', text)
        text = RE_RTF_LINE.sub('\n', text)
        text = RE_RTF_TAB.sub('\t', text)
        text = RE_RTF_BYTE.sub(_decode_win1251_byte, text)
        text = RE_RTF_UNICODE.sub(_decode_unicode, text)
        text = RE_RTF_HEADER.sub('', text)
        text = RE_RTF_CONTROL.sub('', text)
        text = text.replace('{', '').replace('}', '')
    return text


def clean_html_entities(text: str) -> str:
    if '&' in text:
        import html
        text = html.unescape(text)
    return text


def clean_xml_tags(text: str) -> str:
    if '<' in text:
        return RE_XML_TAGS.sub('', text)
    return text


def clean_text(text: str) -> str:
    if not text:
        return ""

    text = clean_rtf_artifacts(text)
    text = clean_html_entities(text)
    text = clean_xml_tags(text)
    text = RE_CONTROL_CHARS.sub('', text)
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = RE_MULTI_NEWLINE.sub('\n\n', text)
    text = RE_MULTI_SPACE.sub(' ', text)
    text = unicodedata.normalize('NFC', text)
    text = text.encode('utf-8', errors='surrogatepass').decode('utf-8', errors='replace')
    text = text.strip()

    return text


def has_excessive_repetition(text: str, threshold: float = 0.5) -> bool:
    if len(text) < 200:
        return False
    lines = text.split('\n')
    if len(lines) < 5:
        return False
    line_counts = {}
    for line in lines:
        line = line.strip()
        if len(line) > 20:
            line_counts[line] = line_counts.get(line, 0) + 1
    if not line_counts:
        return False
    max_count = max(line_counts.values())
    total_meaningful = sum(1 for l in lines if len(l.strip()) > 20)
    if total_meaningful == 0:
        return False
    return (max_count / total_meaningful) > threshold
