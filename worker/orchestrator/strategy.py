"""Strategi orkestrasi agent (pluggable).

Lihat ADR-007 di docs/ARCHITECTURE.md: MVP memakai loop sendiri, tetapi
dibuat swappable supaya LangGraph / Pydantic AI / LlamaIndex Workflows /
OpenAI Agents SDK bisa ditambahkan nanti TANPA rewrite.

Cara menambah strategi baru:
    class LangGraphStrategy:  # name = "langgraph"
        async def run(self, job, runtime, run_ctx) -> None: ...
    orchestrator = Orchestrator(redis, api, strategy=LangGraphStrategy(...))
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

from mcp import McpClient, McpError, McpServerConfig
from providers import Message, ToolSpec, get_provider
from runtime import (
    BudgetExceeded,
    InternalAPIError,
    build_messages,
    new_id,
    render_tool_result,
)

if TYPE_CHECKING:
    from .loop import Job, RunContext

logger = logging.getLogger("orvexa.strategy")

# Model kecil / fallback teks: nama fungsi hanya boleh [a-zA-Z0-9_-],
# sehingga "room.post" dipetakan menjadi "room__post".
_FN_SEP = "__"

# F6-01: key tool MCP dari web berbentuk "mcp.<server>.<tool>". Karena
# server/tool bisa mengandung karakter di luar [a-zA-Z0-9_-], lookup spec
# dilakukan via fn-name (disanitasi sama dengan sisi web), bukan parsing key.
def fn_name(tool_key: str) -> str:
    return tool_key.replace(".", _FN_SEP).replace("-", "_")


def _safe_fn_part(value: str) -> str:
    """Sanitasi identik dengan `mcpFnName()` di apps/web/src/lib/mcp.ts."""
    return re.sub(r"[^a-zA-Z0-9]+", "_", value)


def mcp_fn_name(server_name: str, tool_name: str) -> str:
    return f"mcp{_FN_SEP}{_safe_fn_part(server_name)}{_FN_SEP}{_safe_fn_part(tool_name)}"


def tool_key_from_fn(name: str) -> str:
    return name.replace(_FN_SEP, ".")


def _is_mcp_spec(spec: dict[str, Any]) -> bool:
    return isinstance(spec.get("mcp"), dict) and bool(spec["mcp"].get("server_id"))


@runtime_checkable
class Strategy(Protocol):
    """Kontrak strategi. `runtime` memberi akses ke api/publisher orchestrator."""

    name: str

    async def run(self, job: "Job", runtime: Any, run_ctx: "RunContext") -> None:
        ...


class _TokenFlusher:
    """Menahan token sebentar lalu mengirim per batch agar Redis tidak banjir."""

    def __init__(self, emit: Any, *, max_chars: int = 32, max_delay: float = 0.05) -> None:
        self._emit = emit
        self._buffer: list[str] = []
        self._size = 0
        self._last = time.monotonic()
        self._max_chars = max_chars
        self._max_delay = max_delay

    async def push(self, text: str) -> None:
        if not text:
            return
        self._buffer.append(text)
        self._size += len(text)
        if self._size >= self._max_chars or (time.monotonic() - self._last) >= self._max_delay:
            await self.flush()

    async def flush(self) -> None:
        if not self._buffer:
            return
        payload = "".join(self._buffer)
        self._buffer.clear()
        self._size = 0
        self._last = time.monotonic()
        await self._emit(payload)


_TOOL_JSON_RE = re.compile(r"\{[^{}]*\"tool\"\s*:[^{}]*\}", re.DOTALL)


def _extract_text_tool_call(text: str) -> tuple[str, dict[str, Any]] | None:
    """Fallback tool call lewat JSON di dalam teks (model tanpa function calling)."""
    match = _TOOL_JSON_RE.search(text)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    key = data.get("tool")
    if not isinstance(key, str) or not key:
        return None
    args = data.get("args") if isinstance(data.get("args"), dict) else {}
    return key, args


class DefaultStrategy:
    """Loop observe → plan → act (tool) → reflect."""

    name = "default"

    async def run(self, job: "Job", runtime: Any, run_ctx: "RunContext") -> None:
        context = run_ctx.context
        provider_cfg = context.get("provider") or {}
        tool_defs = context.get("tools") or []

        # F5-03: resume setelah keputusan approval — sampaikan hasil keputusan
        # tanpa loop LLM (agent tidak memutuskan ulang; manusia yang memutuskan).
        trigger = run_ctx.job.trigger or {}
        if trigger.get("kind") == "approval.resume":
            await self._resume_from_approval(run_ctx)
            return

        provider = get_provider(
            str(provider_cfg.get("kind") or "openai"),
            api_key=str(provider_cfg.get("api_key") or ""),
            base_url=provider_cfg.get("base_url"),
            model=str(provider_cfg.get("model") or ""),
            timeout=float(getattr(runtime, "timeout_seconds", 180)),
        )

        native_tools = bool(tool_defs) and provider.supports("tools")
        tool_specs = (
            [
                ToolSpec(
                    name=(
                        mcp_fn_name(t["mcp"]["server_name"], t["mcp"]["tool_name"])
                        if _is_mcp_spec(t)
                        else fn_name(t["key"])
                    ),
                    description=t["description"],
                    parameters=t["parameters"],
                )
                for t in tool_defs
            ]
            if native_tools
            else []
        )

        messages = build_messages(context, native_tools)
        api = run_ctx.api
        publisher = run_ctx.publisher
        model = str(provider_cfg.get("model") or "")
        params = dict(provider_cfg.get("params") or {})

        message_key = new_id("mkey")
        flusher = _TokenFlusher(
            lambda chunk: publisher.token(
                run_ctx.room_id, job.agent_id, run_ctx.run_id, message_key, chunk
            )
        )
        reasoning_flusher = _TokenFlusher(
            lambda chunk: publisher.reasoning(
                run_ctx.room_id, job.agent_id, run_ctx.run_id, message_key, chunk
            )
        )

        if run_ctx.room_id:
            await publisher.message_started(
                run_ctx.room_id, job.agent_id, run_ctx.run_id, message_key, run_ctx.agent_name
            )

        accumulated: list[str] = []
        used_tools = False

        while True:
            step = run_ctx.budget.start_step()
            run_ctx.add_event("step.start", {"step": step, "model": model})

            started = time.monotonic()
            text_parts: list[str] = []
            usage_acc = {"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}
            raw_tool_calls: dict[int, dict[str, Any]] = {}
            finish_reason: str | None = None

            async for chunk in provider.chat(messages, model, tool_specs or None, stream=True, **params):
                if chunk.delta:
                    text_parts.append(chunk.delta)
                    await flusher.push(chunk.delta)
                if chunk.reasoning:
                    await reasoning_flusher.push(chunk.reasoning)
                if chunk.tool_call:
                    self._merge_tool_call(raw_tool_calls, chunk.tool_call)
                if chunk.usage:
                    for key, value in chunk.usage.items():
                        usage_acc[key] = usage_acc.get(key, 0) + int(value or 0)
                if chunk.finish_reason:
                    finish_reason = chunk.finish_reason

            await flusher.flush()
            await reasoning_flusher.flush()

            text = "".join(text_parts).strip()
            if text:
                accumulated.append(text)

            if usage_acc["input_tokens"] or usage_acc["output_tokens"]:
                await self._record_usage(run_ctx, usage_acc, int((time.monotonic() - started) * 1000))

            calls = self._normalize_tool_calls(raw_tool_calls)

            # Fallback: model tanpa function calling menulis JSON di teks.
            if not calls and not native_tools and text:
                parsed = _extract_text_tool_call(text)
                if parsed:
                    key, args = parsed
                    accumulated.pop()
                    spec = next(
                        (
                            t
                            for t in run_ctx.context.get("tools") or []
                            if t["key"] == key or _is_mcp_spec(t) and t["mcp"]["tool_name"] == key
                        ),
                        None,
                    )
                    fname = (
                        mcp_fn_name(spec["mcp"]["server_name"], spec["mcp"]["tool_name"])
                        if spec and _is_mcp_spec(spec)
                        else fn_name(key)
                    )
                    calls = [{"id": new_id("call"), "name": fname, "arguments": json.dumps(args)}]

            if not calls:
                break

            used_tools = True
            if text:
                messages.append(Message(role="assistant", content=text))

            for call in calls:
                result_text = await self._run_tool(run_ctx, call)
                messages.append(Message(role="user", content=result_text))

            run_ctx.add_event(
                "step.end",
                {"step": step, "tool_calls": [c["name"] for c in calls], "finish": finish_reason},
            )
            await api.update_run(
                run_ctx.run_id,
                step_count=run_ctx.budget.steps,
                tool_calls=run_ctx.tool_calls,
                state={"budget": run_ctx.budget.snapshot()},
            )

        final_text = "\n\n".join(p for p in accumulated if p).strip()
        run_ctx.result = final_text or None
        run_ctx.add_event("run.result", {"chars": len(final_text), "used_tools": used_tools})

        if run_ctx.room_id:
            # Kirim pesan final lebih dulu, baru tutup bubble streaming supaya
            # tidak ada kedipan di UI.
            await self._deliver(run_ctx, final_text, used_tools)
            await publisher.message_completed(
                run_ctx.room_id, job.agent_id, run_ctx.run_id, message_key
            )

    # ------------------------------------------------------------------
    # internal
    # ------------------------------------------------------------------

    def _merge_tool_call(self, acc: dict[int, dict[str, Any]], fragment: dict[str, Any]) -> None:
        index = int(fragment.get("index") or 0)
        item = acc.setdefault(index, {"id": None, "name": None, "arguments": ""})
        if fragment.get("id"):
            item["id"] = fragment["id"]
        if fragment.get("name"):
            item["name"] = fragment["name"]
        if fragment.get("arguments"):
            item["arguments"] = (item["arguments"] or "") + str(fragment["arguments"])

    def _normalize_tool_calls(self, acc: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
        calls: list[dict[str, Any]] = []
        for index in sorted(acc):
            item = acc[index]
            if not item.get("name"):
                continue
            calls.append(
                {
                    "id": item.get("id") or new_id("call"),
                    "name": str(item["name"]),
                    "arguments": item.get("arguments") or "{}",
                }
            )
        return calls

    def _permission_effect(self, run_ctx: "RunContext", permission: str) -> str | None:
        for p in run_ctx.context.get("permissions") or []:
            if p.get("permission") == permission:
                return str(p.get("effect"))
        return None

    async def _run_tool(self, run_ctx: "RunContext", call: dict[str, Any]) -> str:
        raw_name = str(call["name"])
        try:
            args = json.loads(call.get("arguments") or "{}")
            if not isinstance(args, dict):
                args = {}
        except json.JSONDecodeError:
            args = {}

        # F6-01: tool MCP dikenali dari fn-name `mcp__<server>__<tool>` —
        # jalannya lewat authorize (web) + McpClient (worker), bukan execute_tool.
        mcp_match = re.match(r"^mcp__([a-zA-Z0-9_]+)__([a-zA-Z0-9_]+)$", raw_name)
        if mcp_match:
            return await self._run_mcp_tool(run_ctx, mcp_match.group(1), mcp_match.group(2), args)

        key = tool_key_from_fn(raw_name)
        spec = next((t for t in run_ctx.context.get("tools") or [] if t["key"] == key), None)
        permission = (spec or {}).get("permission") or key
        effect = self._permission_effect(run_ctx, permission)

        run_ctx.add_event("tool.call", {"tool_key": key, "args": args, "effect": effect})
        await run_ctx.publisher.tool_call(
            run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, key, args
        )

        if effect == "disabled":
            message = f"Tool `{key}` dinonaktifkan untuk agent ini."
            run_ctx.add_event("tool.denied", {"tool_key": key, "reason": "disabled"})
            await run_ctx.publisher.tool_result(
                run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, key, False, message
            )
            return message

        if effect == "approval_required":
            message = (
                f"Tool `{key}` butuh approval manusia sebelum dijalankan. "
                "Ajukan approval dan jelaskan rencanamu; jangan mengklaim sudah dijalankan."
            )
            run_ctx.add_event("tool.approval_required", {"tool_key": key, "args": args})
            await run_ctx.publisher.tool_result(
                run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, key, False, message
            )
            return message

        try:
            response = await run_ctx.api.execute_tool(
                tool_key=key,
                args=args,
                company_id=run_ctx.job.company_id,
                agent_id=run_ctx.job.agent_id,
                room_id=run_ctx.room_id,
                run_id=run_ctx.run_id,
            )
            ok = bool(response.get("ok", True))
            result = response.get("result")
            error = response.get("error")
        except Exception as exc:  # noqa: BLE001 - tool gagal bukan akhir dunia
            logger.warning("tool %s gagal: %s", key, exc)
            ok, result, error = False, None, str(exc)

        run_ctx.tool_calls.append(
            {
                "tool_key": key,
                "ok": ok,
                "args": args,
                "result": result if ok else None,
                "error": error,
            }
        )
        run_ctx.add_event("tool.result", {"tool_key": key, "ok": ok, "error": error})
        await run_ctx.publisher.tool_result(
            run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, key, ok, result or error
        )

        return render_tool_result(key, ok, result, error)

    # ------------------------------------------------------------------
    # MCP (F6-01)
    # ------------------------------------------------------------------

    async def _run_mcp_tool(
        self, run_ctx: "RunContext", server_part: str, tool_part: str, args: dict[str, Any]
    ) -> str:
        """Authorize di web → eksekusi lewat MCP client di worker.

        Authorize adalah satu pintu izin + audit; hasilnya berisi connection
        detail + args yang sudah ter-injeksi kredensial (placeholder
        `${CREDENTIALS.<id>}`) sehingga kredensial tidak pernah melewati
        konteks run / prompt.
        """
        spec = next(
            (
                t
                for t in run_ctx.context.get("tools") or []
                if _is_mcp_spec(t)
                and _safe_fn_part(t["mcp"]["server_name"]) == server_part
                and _safe_fn_part(t["mcp"]["tool_name"]) == tool_part
            ),
            None,
        )
        if spec is None:
            label = f"mcp.{server_part}.{tool_part}"
            message = f"Tool MCP `{label}` tidak ada di konteks run ini."
            run_ctx.add_event("tool.denied", {"tool_key": label, "reason": "not_in_context"})
            await run_ctx.publisher.tool_result(
                run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, label, False, message
            )
            return message

        mcp_meta = spec["mcp"]
        tool_label = f"mcp.{mcp_meta['server_name']}.{mcp_meta['tool_name']}"
        effect = self._permission_effect(run_ctx, spec.get("permission") or tool_label)

        run_ctx.add_event("tool.call", {"tool_key": tool_label, "args": args, "effect": effect})
        await run_ctx.publisher.tool_call(
            run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, tool_label, args
        )

        if effect in ("disabled", "approval_required"):
            message = (
                f"Tool `{tool_label}` butuh approval manusia sebelum dijalankan. "
                "Ajukan approval dan jelaskan rencanamu; jangan mengklaim sudah dijalankan."
                if effect == "approval_required"
                else f"Tool `{tool_label}` dinonaktifkan untuk agent ini."
            )
            run_ctx.add_event(
                "tool.approval_required" if effect == "approval_required" else "tool.denied",
                {"tool_key": tool_label, "args": args},
            )
            await run_ctx.publisher.tool_result(
                run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, tool_label, False, message
            )
            return message

        try:
            decision = await run_ctx.api.authorize_mcp(
                server_id=mcp_meta["server_id"],
                tool_name=mcp_meta["tool_name"],
                args=args,
                company_id=run_ctx.job.company_id,
                agent_id=run_ctx.job.agent_id,
                room_id=run_ctx.room_id,
                run_id=run_ctx.run_id,
            )
        except InternalAPIError as exc:
            logger.warning("authorize MCP %s gagal: %s", tool_label, exc)
            ok, text, raw = False, "", {"error": str(exc)}
            run_ctx.tool_calls.append({"tool_key": tool_label, "ok": False, "args": args, "result": None, "error": str(exc)})
            run_ctx.add_event("tool.result", {"tool_key": tool_label, "ok": False, "error": str(exc)[:300]})
            await run_ctx.publisher.tool_result(
                run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, tool_label, False, str(exc)
            )
            return render_tool_result(tool_label, False, None, str(exc))

        if decision.get("requires_approval"):
            message = (
                f"Tool `{tool_label}` butuh approval manusia sebelum dijalankan. "
                "Ajukan approval dan jelaskan rencanamu; jangan mengklaim sudah dijalankan."
            )
            run_ctx.add_event("tool.approval_required", {"tool_key": tool_label, "args": args})
            await run_ctx.publisher.tool_result(
                run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, tool_label, False, message
            )
            return message

        if not decision.get("ok"):
            error = str(decision.get("error") or "authorize MCP gagal.")
            run_ctx.tool_calls.append({"tool_key": tool_label, "ok": False, "args": args, "result": None, "error": error})
            run_ctx.add_event("tool.result", {"tool_key": tool_label, "ok": False, "error": error[:300]})
            await run_ctx.publisher.tool_result(
                run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, tool_label, False, error
            )
            return render_tool_result(tool_label, False, None, error)

        conn = decision.get("mcp") or {}
        final_args = decision.get("args") if isinstance(decision.get("args"), dict) else args
        try:
            client = self._get_mcp_client(mcp_meta["server_id"], conn)
            result = await client.call_tool(mcp_meta["tool_name"], final_args)
            ok, text, raw = result.ok, result.text, result.raw
        except (McpError, asyncio.TimeoutError, OSError) as exc:
            logger.warning("eksekusi MCP %s gagal: %s", tool_label, exc)
            ok, text, raw = False, "", {"error": str(exc)}

        run_ctx.tool_calls.append(
            {
                "tool_key": tool_label,
                "ok": ok,
                "args": final_args,
                "result": raw if ok else None,
                "error": None if ok else (text or str(raw)),
            }
        )
        run_ctx.add_event("tool.result", {"tool_key": tool_label, "ok": ok, "error": None if ok else (text or str(raw))[:300]})
        await run_ctx.publisher.tool_result(
            run_ctx.room_id, run_ctx.job.agent_id, run_ctx.run_id, tool_label, ok, text or str(raw)
        )
        return render_tool_result(tool_label, ok, text, None if ok else str(raw))

    def _get_mcp_client(self, server_id: str, conn: dict[str, Any]) -> McpClient:
        """Cache McpClient per server (reuse sesi HTTP / proses stdio antar step)."""
        cache = getattr(self, "_mcp_clients", None)
        if cache is None:
            cache = {}
            setattr(self, "_mcp_clients", cache)
        client = cache.get(server_id)
        if client is None:
            client = McpClient(McpServerConfig.from_payload(conn))
            cache[server_id] = client
        return client

    async def _resume_from_approval(self, run_ctx: "RunContext") -> None:
        """Sampaikan hasil keputusan approval ke room & tutup run dengan rapi."""
        trigger = run_ctx.job.trigger or {}
        decision = str(trigger.get("decision") or "")
        tool_key = str(trigger.get("tool_key") or "")
        executed = bool(trigger.get("executed"))
        exec_error = trigger.get("exec_error")

        if decision == "approved" and executed:
            text = (
                f"✅ Approval untuk `{tool_key}` disetujui dan tool berhasil dijalankan. "
                "Melanjutkan pekerjaan."
            )
        elif decision == "approved":
            text = (
                f"⚠️ Approval untuk `{tool_key}` disetujui, tapi eksekusi gagal"
                + (f": {exec_error}" if exec_error else ".")
                + " Saya tunggu instruksi lanjutan."
            )
        else:
            text = (
                f"❌ Approval untuk `{tool_key}` ditolak oleh manusia."
                " Rencana terkait tidak dijalankan; mohon arahan alternatif."
            )

        run_ctx.add_event("approval.resume", {"decision": decision, "tool_key": tool_key})
        await self._deliver(run_ctx, text, used_tools=False)
        run_ctx.result = text

    async def _record_usage(
        self, run_ctx: "RunContext", usage: dict[str, int], latency_ms: int
    ) -> None:
        run_ctx.budget.add_usage(usage.get("input_tokens", 0), usage.get("output_tokens", 0))

        provider = run_ctx.context.get("provider") or {}
        pricing = provider.get("pricing") or {}
        cost = 0.0
        if pricing.get("input_per_1k") is not None:
            cost += usage.get("input_tokens", 0) / 1000 * float(pricing["input_per_1k"])
        if pricing.get("output_per_1k") is not None:
            cost += usage.get("output_tokens", 0) / 1000 * float(pricing["output_per_1k"])

        try:
            result = await run_ctx.api.record_usage(
                company_id=run_ctx.job.company_id,
                agent_id=run_ctx.job.agent_id,
                run_id=run_ctx.run_id,
                input_tokens=usage.get("input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0),
                cached_tokens=usage.get("cached_tokens", 0),
                estimated_cost=cost,
                latency_ms=latency_ms,
            )
            if isinstance(result.get("cost_today"), (int, float)):
                run_ctx.budget.sync_cost(float(result["cost_today"]))
            run_ctx.budget.check_daily_limit()
        except BudgetExceeded:
            raise
        except Exception:  # noqa: BLE001 - pencatatan usage tidak boleh mematikan run
            logger.warning("gagal mencatat usage", exc_info=True)

    async def _deliver(self, run_ctx: "RunContext", text: str, used_tools: bool) -> None:
        if not run_ctx.room_id:
            return

        content = text
        if not content and not used_tools:
            content = "_(agent tidak menghasilkan jawaban teks)_"

        if not content:
            return

        trigger = run_ctx.job.trigger or {}
        meta: dict[str, Any] = {"model": (run_ctx.context.get("provider") or {}).get("model")}
        if trigger.get("message_id"):
            meta["reply_to"] = trigger["message_id"]

        try:
            await run_ctx.api.post_message(
                run_ctx.run_id,
                content,
                kind="text",
                meta=meta,
            )
        except Exception:  # noqa: BLE001
            logger.exception("gagal mengirim pesan agent ke room")
