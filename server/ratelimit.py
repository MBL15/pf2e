"""Простой in-memory rate limiter по IP (для локального сервера)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Callable

_lock = threading.Lock()
_buckets: dict[tuple[str, str], list[float]] = defaultdict(list)


class RateLimited(Exception):
    """Слишком много запросов → 429."""

    def __init__(self, retry_after_sec: int) -> None:
        self.retry_after_sec = retry_after_sec
        super().__init__("Too many requests")


def _prune(times: list[float], now: float, window_sec: float) -> list[float]:
    cutoff = now - window_sec
    return [t for t in times if t > cutoff]


def check_rate_limit(key: str, action: str, *, max_attempts: int, window_sec: float) -> None:
    """Бросает RateLimited при превышении лимита."""
    now = time.monotonic()
    bucket_key = (key, action)
    with _lock:
        times = _prune(_buckets[bucket_key], now, window_sec)
        if len(times) >= max_attempts:
            oldest = times[0]
            retry = max(1, int(window_sec - (now - oldest)))
            raise RateLimited(retry)
        times.append(now)
        _buckets[bucket_key] = times


def client_ip_from_address(client_address: tuple[str, int] | None) -> str:
    if not client_address:
        return "unknown"
    return client_address[0]
