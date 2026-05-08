import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from .parsers import TokenUsage


class TokenStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _get_today_start_timestamp(self) -> float:
        """获取今天开始的时间戳"""
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        return time.mktime(today.timetuple())

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS token_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    provider TEXT NOT NULL,
                    raw_model TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_tokens INTEGER NOT NULL,
                    completion_tokens INTEGER NOT NULL,
                    total_tokens INTEGER NOT NULL,
                    cached_tokens INTEGER NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_token_events_ts ON token_events(ts)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_token_events_model ON token_events(model)")

    def record(self, usage: TokenUsage) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO token_events (
                    ts, provider, raw_model, model, prompt_tokens,
                    completion_tokens, total_tokens, cached_tokens
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    time.time(),
                    usage.provider,
                    usage.raw_model,
                    usage.model,
                    usage.prompt_tokens,
                    usage.completion_tokens,
                    usage.total_tokens,
                    usage.cached_tokens,
                ),
            )

    def snapshot(self) -> Dict[str, object]:
        now = time.time()
        today_start = self._get_today_start_timestamp()
        with self._connect() as conn:
            five_min = conn.execute(
                "SELECT COALESCE(SUM(total_tokens), 0) AS total FROM token_events WHERE ts >= ?",
                (now - 300,),
            ).fetchone()["total"]
            total = conn.execute(
                "SELECT COALESCE(SUM(total_tokens), 0) AS total FROM token_events"
            ).fetchone()["total"]
            today = conn.execute(
                "SELECT COALESCE(SUM(total_tokens), 0) AS total FROM token_events WHERE ts >= ?",
                (today_start,),
            ).fetchone()["total"]
            last = conn.execute(
                "SELECT * FROM token_events ORDER BY id DESC LIMIT 1"
            ).fetchone()
            active = conn.execute(
                """
                SELECT model, SUM(total_tokens) AS tokens
                FROM token_events
                WHERE ts >= ?
                GROUP BY model
                ORDER BY MAX(ts) DESC
                LIMIT 5
                """,
                (now - 300,),
            ).fetchall()
            current = conn.execute(
                """
                SELECT model, provider, raw_model, ts
                FROM token_events
                WHERE ts >= ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (now - 300,),
            ).fetchone()

        return {
            "five_min_tokens": int(five_min or 0),
            "total_tokens": int(total or 0),
            "today_tokens": int(today or 0),
            "last": dict(last) if last else None,
            "current_model": dict(current) if current else None,
            "active_models": [dict(row) for row in active],
        }

    def recent_events(self, limit: int = 50) -> List[Dict[str, object]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM token_events ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def providers(self) -> List[str]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT provider FROM token_events ORDER BY provider"
            ).fetchall()
        return [str(row["provider"]) for row in rows]

    def model_usage_summary(
        self,
        since_ts: Optional[float] = None,
        provider: Optional[str] = None,
    ) -> Dict[str, object]:
        where, params = self._filters(since_ts, provider)
        with self._connect() as conn:
            total_row = conn.execute(
                f"""
                SELECT
                    COUNT(*) AS calls,
                    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                    COALESCE(SUM(total_tokens), 0) AS total_tokens,
                    COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
                    MIN(ts) AS first_ts,
                    MAX(ts) AS last_ts
                FROM token_events
                {where}
                """,
                params,
            ).fetchone()
            rows = conn.execute(
                f"""
                SELECT
                    model,
                    provider,
                    COUNT(*) AS calls,
                    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                    COALESCE(SUM(total_tokens), 0) AS total_tokens,
                    COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
                    MIN(ts) AS first_ts,
                    MAX(ts) AS last_ts
                FROM token_events
                {where}
                GROUP BY model, provider
                ORDER BY total_tokens DESC, last_ts DESC
                """,
                params,
            ).fetchall()
        return {
            "total": dict(total_row) if total_row else {},
            "rows": [dict(row) for row in rows],
        }

    def _filters(self, since_ts: Optional[float], provider: Optional[str]):
        clauses = []
        params: List[object] = []
        if since_ts is not None:
            clauses.append("ts >= ?")
            params.append(since_ts)
        if provider:
            clauses.append("provider = ?")
            params.append(provider)
        if not clauses:
            return "", params
        return "WHERE " + " AND ".join(clauses), params

    def clear(self) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM token_events")
    
    def clear_by_date_range(self, start_ts: float, end_ts: float) -> int:
        """删除指定时间范围内的数据，返回删除的行数"""
        with self._connect() as conn:
            result = conn.execute(
                "DELETE FROM token_events WHERE ts >= ? AND ts <= ?",
                (start_ts, end_ts),
            )
            return result.rowcount
    
    def hourly_stats(self, since_ts: Optional[float] = None, provider: Optional[str] = None) -> List[Dict[str, object]]:
        """获取每小时的统计数据"""
        where, params = self._filters(since_ts, provider)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT
                    strftime('%Y-%m-%d %H:00', ts, 'unixepoch', 'localtime') AS hour,
                    COUNT(*) AS calls,
                    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                    COALESCE(SUM(total_tokens), 0) AS total_tokens
                FROM token_events
                {where}
                GROUP BY hour
                ORDER BY hour DESC
                LIMIT 168
                """,
                params,
            ).fetchall()
        return [dict(row) for row in rows]
    
    def provider_breakdown(self, since_ts: Optional[float] = None) -> List[Dict[str, object]]:
        """按 Provider 分组的统计"""
        where, params = self._filters(since_ts, None)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT
                    provider,
                    COUNT(*) AS calls,
                    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                    COALESCE(SUM(total_tokens), 0) AS total_tokens
                FROM token_events
                {where}
                GROUP BY provider
                ORDER BY total_tokens DESC
                """,
                params,
            ).fetchall()
        return [dict(row) for row in rows]
