import test from "node:test";
import assert from "node:assert/strict";
import {nextSaturdayShanghai} from "../shared/calendar";

test("candidate opening picks the next Shanghai Saturday",()=>{
  assert.equal(nextSaturdayShanghai(new Date("2026-11-13T18:00:00Z")),"2026-11-21");
  assert.equal(nextSaturdayShanghai(new Date("2026-11-16T03:00:00Z")),"2026-11-21");
});
