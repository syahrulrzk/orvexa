import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estimateCost } from "../src/lib/cost.ts";

describe("cost F5-06 — estimateCost", () => {
  it("pricing null → biaya 0", () => {
    assert.equal(estimateCost(1000, 500, { input_per_1k: null, output_per_1k: null }), 0);
  });

  it("hanya input pricing", () => {
    // 2000 token = 2 × $0.15/1k = $0.30
    assert.equal(estimateCost(2000, 0, { input_per_1k: 0.15, output_per_1k: null }), 0.3);
  });

  it("input + output penuh", () => {
    // 1000 in × $0.15/1k = $0.15; 500 out × $0.60/1k = $0.30 → $0.45
    assert.equal(estimateCost(1000, 500, { input_per_1k: 0.15, output_per_1k: 0.6 }), 0.45);
  });

  it("pembulatan 6 desimal (konsisten numeric(12,6))", () => {
    const cost = estimateCost(1, 1, { input_per_1k: 0.0000001, output_per_1k: 0.0000001 });
    assert.equal(cost, Math.round(cost * 1e6) / 1e6);
  });

  it("token nol → biaya nol", () => {
    assert.equal(estimateCost(0, 0, { input_per_1k: 0.15, output_per_1k: 0.6 }), 0);
  });
});
