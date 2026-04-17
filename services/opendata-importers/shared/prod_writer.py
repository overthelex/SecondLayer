"""Bulk writer to prod PostgreSQL via SSH + docker exec + COPY."""
import logging
import os
import subprocess
from typing import Iterable


log = logging.getLogger(__name__)


def _ssh_cmd(host: str) -> list[str]:
    """Build ssh argv. Honors PROD_SSH_USER, PROD_SSH_KEY env vars to
    bypass ~/.ssh/config (which may have permissions issues in containers).
    """
    user = os.environ.get("PROD_SSH_USER", "")
    key = os.environ.get("PROD_SSH_KEY", "")
    target = f"{user}@{host}" if user else host
    base = ["ssh", "-F", "/dev/null",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR",
            "-o", "ServerAliveInterval=30"]
    if key:
        base += ["-i", key]
    base.append(target)
    return base


def _escape_copy(v) -> str:
    """Escape one cell for PostgreSQL COPY text format."""
    if v is None or v == "":
        return r"\N"
    s = str(v)
    return (s.replace("\\", "\\\\")
             .replace("\t", " ")
             .replace("\n", " ")
             .replace("\r", " "))


def copy_into(table: str, columns: list[str], rows: Iterable[tuple],
              ssh_host: str = "prod",
              container: str = "secondlayer-postgres-prod",
              dbuser: str = "secondlayer",
              dbname: str = "secondlayer_prod",
              on_conflict: str | None = None,
              pk_columns: list[str] | None = None) -> int:
    """COPY rows into a temp table, then INSERT ... ON CONFLICT into target.

    Returns the number of rows inserted (0 if all conflicted with DO NOTHING).
    Raises subprocess.CalledProcessError on psql failure.
    """
    rows = list(rows)
    if not rows:
        return 0

    col_csv = ", ".join(columns)
    payload_lines = ["\t".join(_escape_copy(c) for c in r) for r in rows]
    payload = "\n".join(payload_lines) + "\n"

    coldefs = ", ".join(f"{c} TEXT" for c in columns)
    conflict_clause = ""
    if on_conflict and pk_columns:
        if on_conflict == "do_nothing":
            conflict_clause = f"ON CONFLICT ({', '.join(pk_columns)}) DO NOTHING"
        elif on_conflict == "do_update":
            updates = ", ".join(f"{c}=EXCLUDED.{c}" for c in columns if c not in pk_columns)
            conflict_clause = f"ON CONFLICT ({', '.join(pk_columns)}) DO UPDATE SET {updates}"

    sql = f"""
BEGIN;
CREATE TEMP TABLE _stage ({coldefs}) ON COMMIT DROP;
COPY _stage FROM STDIN WITH (FORMAT text, NULL '\\N');
"""
    upsert = f"""
INSERT INTO {table} ({col_csv})
SELECT {col_csv} FROM _stage
{conflict_clause};
COMMIT;
"""
    full = sql + payload + "\\.\n" + upsert

    cmd = _ssh_cmd(ssh_host) + [
        f"docker exec -i {container} psql -U {dbuser} -d {dbname} -v ON_ERROR_STOP=1"]
    proc = subprocess.run(cmd, input=full, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        log.error(f"prod COPY failed: {proc.stderr[-2000:]}")
        raise subprocess.CalledProcessError(proc.returncode, cmd, proc.stdout, proc.stderr)
    # Find INSERT count from output
    for line in proc.stdout.splitlines():
        if line.startswith("INSERT 0 "):
            try:
                return int(line.split()[2])
            except (IndexError, ValueError):
                continue
    return len(rows)


def query_count(table: str,
                ssh_host: str = "prod",
                container: str = "secondlayer-postgres-prod",
                dbuser: str = "secondlayer",
                dbname: str = "secondlayer_prod") -> int:
    cmd = _ssh_cmd(ssh_host) + [
        f"docker exec {container} psql -U {dbuser} -d {dbname} -tAc 'SELECT COUNT(*) FROM {table}'"]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if proc.returncode != 0:
        return -1
    try:
        return int(proc.stdout.strip())
    except ValueError:
        return -1
