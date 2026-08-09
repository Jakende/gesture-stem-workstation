export class WebMidiOutput {
  #access: MIDIAccess | undefined;
  #output: MIDIOutput | undefined;

  get supported(): boolean {
    return typeof navigator.requestMIDIAccess === "function";
  }

  async request(): Promise<Array<{ id: string; name: string }>> {
    if (typeof navigator.requestMIDIAccess !== "function") throw new Error("Web MIDI is not supported by this browser.");
    this.#access = await navigator.requestMIDIAccess();
    return [...this.#access.outputs.values()].map((output) => ({ id: output.id, name: output.name ?? output.id }));
  }

  select(outputId: string): void {
    this.#output = this.#access?.outputs.get(outputId);
  }

  sendControlChange(channel: number, controller: number, normalizedValue: number): void {
    if (!this.#output) return;
    const safeChannel = Math.max(1, Math.min(16, Math.round(channel)));
    const value = Math.max(0, Math.min(127, Math.round(normalizedValue * 127)));
    this.#output.send([0xb0 + safeChannel - 1, controller, value]);
  }
}
