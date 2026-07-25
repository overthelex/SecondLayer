"""JSON checkpoint for resume-after-crash."""
import json
import logging
from pathlib import Path
from typing import Any


log = logging.getLogger(__name__)


class Checkpoint:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._state: dict[str, Any] = {}
        self._load()

    def _load(self):
        if self.path.exists():
            try:
                self._state = json.loads(self.path.read_text())
                log.info(f"Loaded checkpoint from {self.path}: {len(self._state)} keys")
            except Exception as e:
                log.warning(f"Failed to load checkpoint {self.path}: {e}")
                self._state = {}

    def get(self, key: str, default=None):
        return self._state.get(key, default)

    def set(self, key: str, value):
        self._state[key] = value
        self.flush()

    def update(self, **kwargs):
        self._state.update(kwargs)
        self.flush()

    def add_done(self, item: str):
        done = self._state.setdefault("done", [])
        if item not in done:
            done.append(item)

    def delete(self, key: str):
        """Drop a key entirely. Used when an importer migrates to a different
        progress unit and the old one would keep bloating the file."""
        if key in self._state:
            del self._state[key]
            self.flush()

    def is_done(self, item: str) -> bool:
        return item in self._state.get("done", [])

    @property
    def done_set(self) -> set:
        return set(self._state.get("done", []))

    def flush(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._state, ensure_ascii=False, indent=2))
        tmp.replace(self.path)
