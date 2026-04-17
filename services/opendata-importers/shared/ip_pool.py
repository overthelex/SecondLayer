"""Auto-discover public IPv4 addresses on the host."""
import os
import re
import subprocess


PRIVATE_PREFIXES = ("127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
                    "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
                    "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
                    "172.30.", "172.31.", "192.168.", "169.254.", "100.64.",
                    "224.", "240.")


def _is_private(ip: str) -> bool:
    return any(ip.startswith(p) for p in PRIVATE_PREFIXES)


def discover_public_ips() -> list[str]:
    """Returns sorted list of public IPv4 addresses bound to host interfaces.

    Override via SOURCE_IPS env var (comma-separated) to bypass discovery.
    """
    override = os.environ.get("SOURCE_IPS", "").strip()
    if override:
        return [ip.strip() for ip in override.split(",") if ip.strip()]

    try:
        out = subprocess.check_output(["ip", "-4", "-o", "addr", "show"], text=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []

    ips = []
    for line in out.splitlines():
        m = re.search(r"inet (\d+\.\d+\.\d+\.\d+)", line)
        if m and not _is_private(m.group(1)):
            ips.append(m.group(1))
    return sorted(set(ips))
