"""Budget guard untuk satu run agent (F3-04).

Menjaga tiga hal:
1. Jumlah **step** (iterasi LLM ↔ tool) tidak melebihi `agent.max_steps`.
2. Jumlah **token** tidak melebihi budget job.
3. Biaya harian agent tidak melewati `agents.daily_cost_limit`.
"""

from __future__ import annotations


class BudgetExceeded(RuntimeError):
    """Dilempar saat budget habis; run ditutup sebagai `failed`/`cancelled`."""


class BudgetGuard:
    def __init__(
        self,
        *,
        max_steps: int = 8,
        max_tokens: int = 12000,
        daily_cost_limit: float | None = None,
        cost_today: float = 0.0,
    ) -> None:
        self.max_steps = max(1, max_steps)
        self.max_tokens = max(256, max_tokens)
        self.daily_cost_limit = daily_cost_limit
        self.cost_today = cost_today

        self.steps = 0
        self.input_tokens = 0
        self.output_tokens = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    @property
    def remaining_tokens(self) -> int:
        return max(0, self.max_tokens - self.total_tokens)

    def check_daily_limit(self) -> None:
        if self.daily_cost_limit is not None and self.cost_today >= self.daily_cost_limit:
            raise BudgetExceeded(
                f"Limit biaya harian agent tercapai (${self.cost_today:.4f} / "
                f"${self.daily_cost_limit:.4f})."
            )

    def start_step(self) -> int:
        """Panggil sebelum satu iterasi LLM. Mengembalikan nomor step."""
        self.check_daily_limit()
        if self.steps >= self.max_steps:
            raise BudgetExceeded(f"Batas langkah tercapai ({self.max_steps} step).")
        if self.total_tokens >= self.max_tokens:
            raise BudgetExceeded(f"Batas token tercapai ({self.max_tokens} token).")
        self.steps += 1
        return self.steps

    def add_usage(self, input_tokens: int = 0, output_tokens: int = 0) -> None:
        self.input_tokens += max(0, input_tokens)
        self.output_tokens += max(0, output_tokens)

    def sync_cost(self, cost_today: float) -> None:
        """Perbarui akumulasi biaya harian dari respons internal API."""
        self.cost_today = cost_today

    def snapshot(self) -> dict[str, int | float]:
        return {
            "steps": self.steps,
            "max_steps": self.max_steps,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "max_tokens": self.max_tokens,
            "cost_today": round(self.cost_today, 6),
        }
