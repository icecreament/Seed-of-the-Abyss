/** Consume a physical key edge once, even if the engine replays its queue. */
export class InputEdgeGuard {
  private readonly seen = new WeakSet<object>();
  accept(event: { readonly repeat?: boolean }): boolean {
    if (this.seen.has(event)) return false;
    // Remember blocked/repeating events too: replay after a menu closes is not new input.
    this.seen.add(event);
    return !event.repeat;
  }
}
