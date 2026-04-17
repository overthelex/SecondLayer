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


_TYPE_CACHE: dict[tuple, dict[str, str]] = {}


def _column_types(table: str, columns: list[str], ssh_host: str, container: str,
                  dbuser: str, dbname: str) -> dict[str, str]:
    """Returns map column_name -> PostgreSQL type. Cached per (host, db, table)."""
    key = (ssh_host, container, dbname, table)
    if key in _TYPE_CACHE:
        return _TYPE_CACHE[key]
    cmd = _ssh_cmd(ssh_host) + [
        f"docker exec {container} psql -U {dbuser} -d {dbname} -tAc "
        f"\"SELECT column_name||':'||udt_name FROM information_schema.columns "
        f"WHERE table_name='{table}' AND table_schema='public'\""]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if proc.returncode != 0:
        log.warning(f"could not introspect {table}: {proc.stderr[-500:]}")
        return {c: "text" for c in columns}
    types = {}
    for line in proc.stdout.strip().splitlines():
        if ":" in line:
            n, t = line.split(":", 1)
            types[n.strip()] = t.strip()
    _TYPE_CACHE[key] = types
    return types


_PG_TYPE_ALIASES = {
    "varchar": "text", "char": "text", "bpchar": "text", "name": "text",
    "int2": "smallint", "int4": "integer", "int8": "bigint",
    "float4": "real", "float8": "double precision",
    "bool": "boolean", "timestamptz": "timestamp with time zone",
}


def _stage_type(udt: str) -> str:
    udt = udt.lower()
    if udt.startswith("_"):  # array
        elem = udt[1:]
        return f"{_PG_TYPE_ALIASES.get(elem, elem)}[]"
    return _PG_TYPE_ALIASES.get(udt, udt)


def copy_into(table: str, columns: list[str], rows: Iterable[tuple],
              ssh_host: str = "prod",
              container: str = "secondlayer-postgres-prod",
              dbuser: str = "secondlayer",
              dbname: str = "secondlayer_prod",
              on_conflict: str | None = None,
              pk_columns: list[str] | None = None) -> int:
    """COPY rows into a temp table, then INSERT ... ON CONFLICT into target.

    The temp table mirrors the target's column types so PostgreSQL casts
    text-format COPY inputs into DATE / JSONB / etc. natively.
    Returns the number of rows inserted (0 if all conflicted with DO NOTHING).
    Raises subprocess.CalledProcessError on psql failure.
    """
    rows = list(rows)
    if not rows:
        return 0

    types = _column_types(table, columns, ssh_host, container, dbuser, dbname)
    col_csv = ", ".join(columns)
    payload_lines = ["\t".join(_escape_copy(c) for c in r) for r in rows]
    payload = "\n".join(payload_lines) + "\n"

    coldefs = ", ".join(f"{c} {_stage_type(types.get(c, 'text'))}" for c in columns)
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
