import { describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";

describe("EventBus", () => {
  it("retains 500 events and replays events after a sequence", () => {
    const bus = new EventBus(500);
    for (let index = 0; index < 505; index += 1) bus.publish("p1", "log", { index });
    expect(bus.snapshot().length).toBe(500);
    expect(bus.snapshot()[0]?.sequence).toBe(6);
    expect(bus.replayAfter(503).map((event) => event.sequence)).toEqual([504, 505]);
  });

  it("subscribes and cleanly unsubscribes", () => {
    const bus = new EventBus();
    const seen: number[] = [];
    const unsubscribe = bus.subscribe((event) => seen.push(event.sequence));
    bus.publish("p1", "stage", {});
    unsubscribe();
    bus.publish("p1", "stage", {});
    expect(seen).toEqual([1]);
  });
});
