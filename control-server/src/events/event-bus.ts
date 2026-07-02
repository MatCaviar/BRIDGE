import type { WorkbenchEvent } from "@bridge/workbench-contracts";

type Listener = (event: WorkbenchEvent) => void;

export class EventBus {
  readonly #events: WorkbenchEvent[] = [];
  readonly #listeners = new Set<Listener>();
  #sequence = 0;

  constructor(readonly capacity = 500) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("Event capacity must be positive");
  }

  publish(projectId: string, type: WorkbenchEvent["type"], payload: Record<string, unknown>): WorkbenchEvent {
    const event: WorkbenchEvent = {
      sequence: ++this.#sequence,
      projectId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.#events.push(event);
    if (this.#events.length > this.capacity) this.#events.splice(0, this.#events.length - this.capacity);
    for (const listener of this.#listeners) listener(event);
    return event;
  }

  snapshot(): readonly WorkbenchEvent[] { return [...this.#events]; }
  replayAfter(sequence: number): readonly WorkbenchEvent[] { return this.#events.filter((event) => event.sequence > sequence); }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
