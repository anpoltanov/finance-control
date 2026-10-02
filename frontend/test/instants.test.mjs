import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const MOSCOW = "Europe/Moscow";
const UTC_MINUS_2 = "Atlantic/South_Georgia";

if (process.env.INSTANT_TZ_CHILD === "1") {
  const { localRangeBoundMs, parseApiDate } = await import("../src/utils/instants.ts");

  describe("report bounds in Europe/Moscow", () => {
    it("includes local midnight on the first day and excludes the previous UTC midnight", () => {
      const fromMs = localRangeBoundMs("2026-10-01", "start");
      const localMidnight = parseApiDate("2026-10-01T00:00:00+03:00").getTime();
      assert.equal(fromMs, localMidnight);
      assert.ok(localMidnight < Date.parse("2026-10-01"));
      assert.ok(localMidnight >= fromMs);
      assert.ok(localMidnight <= localRangeBoundMs("2026-10-31T23:59:59", "end"));
    });
  });
} else {
  const { localDayKey, localInputToIso, parseApiDate, toDateTimeLocalValue, zonedParts } = await import(
    "../src/utils/instants.ts"
  );

  describe("transaction instants across timezones", () => {
    it("reads a legacy naive UTC timestamp as 13:00 in Moscow and 08:00 in UTC-2", () => {
      const instant = parseApiDate("2026-10-02T10:00:00");
      assert.equal(instant.toISOString(), "2026-10-02T10:00:00.000Z");
      const moscow = zonedParts(instant, MOSCOW);
      assert.equal(moscow.hour, "13");
      assert.equal(moscow.day, "02");
      assert.equal(moscow.month, "10");
      const minus2 = zonedParts(instant, UTC_MINUS_2);
      assert.equal(minus2.hour, "08");
      assert.equal(minus2.day, "02");
      assert.equal(minus2.month, "10");
    });

    it("submits 13:00 entered in Moscow and reloads that wall time in each viewer zone", () => {
      const submitted = localInputToIso("2026-10-02T13:00", MOSCOW);
      assert.equal(submitted, "2026-10-02T10:00:00.000Z");
      const instant = parseApiDate(submitted);
      assert.equal(toDateTimeLocalValue(instant, MOSCOW), "2026-10-02T13:00");
      assert.equal(toDateTimeLocalValue(instant, UTC_MINUS_2), "2026-10-02T08:00");
    });

    it("puts the same instant on the viewer's local day", () => {
      const instant = parseApiDate("2026-10-01T22:00:00Z");
      assert.equal(localDayKey(instant, MOSCOW), "2026-10-02");
      assert.equal(localDayKey(instant, UTC_MINUS_2), "2026-10-01");
    });
  });

  it("checks local range bounds with the process timezone set to Europe/Moscow", () => {
    const res = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--test", new URL(import.meta.url).pathname],
      {
        env: { ...process.env, TZ: MOSCOW, INSTANT_TZ_CHILD: "1" },
        encoding: "utf8",
      }
    );
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  });
}
