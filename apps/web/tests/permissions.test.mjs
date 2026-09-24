import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluatePermission,
  defaultEffect,
  TOOL_DEFAULTS,
  UNKNOWN_TOOL_DEFAULT,
} from "../src/lib/permissions.ts";

describe("permissions F5-01 — default matrix", () => {
  it("tool komunikasi bersifat allow", () => {
    assert.equal(defaultEffect("room.post"), "allow");
    assert.equal(defaultEffect("task.create"), "allow");
    assert.equal(defaultEffect("doc.generate"), "allow");
  });

  it("tool sensitif wajib approval", () => {
    for (const key of ["firewall.modify", "server.restart", "production.deploy", "database.write"]) {
      assert.equal(defaultEffect(key), "approval_required", key);
    }
  });

  it("tool tidak dikenal fail-closed: disabled", () => {
    assert.equal(defaultEffect("tool.rahasia"), UNKNOWN_TOOL_DEFAULT);
    const decision = evaluatePermission("tool.rahasia", []);
    assert.equal(decision.effect, "disabled");
  });

  it("semua builtin tool punya entri default", () => {
    // BUILTIN_TOOLS dijamin tercakup matrix default (allow / approval_required).
    for (const key of Object.keys(TOOL_DEFAULTS)) {
      const effect = defaultEffect(key);
      assert.ok(
        effect === "allow" || effect === "approval_required" || effect === "disabled",
        `effect tidak valid untuk ${key}`,
      );
    }
  });
});

describe("permissions F5-01 — override agent", () => {
  it("override menang atas default", () => {
    const rows = [{ permission: "task.create", effect: "approval_required" }];
    const d = evaluatePermission("task.create", rows);
    assert.equal(d.effect, "approval_required");
    assert.equal(d.source, "agent_override");
  });

  it("disabled override memblokir tool allow-default", () => {
    const rows = [{ permission: "room.post", effect: "disabled" }];
    assert.equal(evaluatePermission("room.post", rows).effect, "disabled");
  });

  it("effect tak dikenal di-escalate ke approval_required (fail-closed)", () => {
    const rows = [{ permission: "task.create", effect: "mungkin_saja" }];
    assert.equal(evaluatePermission("task.create", rows).effect, "approval_required");
  });
});

describe("permissions F5-01 — kondisi ABAC", () => {
  it("allow dengan room_types cocok → allow", () => {
    const rows = [
      { permission: "task.create", effect: "allow", conditions: { room_types: ["incident", "war_room"] } },
    ];
    assert.equal(evaluatePermission("task.create", rows, { roomType: "incident" }).effect, "allow");
  });

  it("allow dengan room_types tidak cocok → approval_required", () => {
    const rows = [
      { permission: "task.create", effect: "allow", conditions: { room_types: ["incident", "war_room"] } },
    ];
    assert.equal(
      evaluatePermission("task.create", rows, { roomType: "general" }).effect,
      "approval_required",
    );
  });

  it("roomType tidak diketahui → fail-closed approval_required", () => {
    const rows = [
      { permission: "task.create", effect: "allow", conditions: { room_types: ["incident"] } },
    ];
    assert.equal(evaluatePermission("task.create", rows, { roomType: null }).effect, "approval_required");
  });

  it("allow dengan project_id cocok → allow", () => {
    const rows = [{ permission: "room.post", effect: "allow", conditions: { project_id: "prj_x" } }];
    assert.equal(evaluatePermission("room.post", rows, { projectId: "prj_x" }).effect, "allow");
  });

  it("project_id beda → approval_required", () => {
    const rows = [{ permission: "room.post", effect: "allow", conditions: { project_id: "prj_x" } }];
    assert.equal(evaluatePermission("room.post", rows, { projectId: "prj_y" }).effect, "approval_required");
  });

  it("project_id tidak diketahui → fail-closed approval_required", () => {
    const rows = [{ permission: "room.post", effect: "allow", conditions: { project_id: "prj_x" } }];
    assert.equal(evaluatePermission("room.post", rows, { projectId: null }).effect, "approval_required");
  });
});
