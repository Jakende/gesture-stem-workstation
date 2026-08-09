import { ProjectTransport } from "../../src/transport/project-transport";
import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeAudioContext {
  currentTime = 0;
  resume = (): Promise<void> => Promise.resolve();
}

describe("ProjectTransport", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("is the sole owner of elapsed playback time", async () => {
    const context = new FakeAudioContext();
    const transport = new ProjectTransport(context as unknown as AudioContext);
    let scheduledAt = -1;
    transport.configureAudioCallbacks((offset) => { scheduledAt = offset; }, () => undefined);
    transport.setDuration(20);
    transport.seek(4);
    await transport.play();
    expect(scheduledAt).toBe(4);
    context.currentTime = 3;
    expect(transport.snapshot.currentSeconds).toBe(7);
    transport.pause();
    expect(transport.snapshot.currentSeconds).toBe(7);
  });

  it("clamps seeks and loop bounds", () => {
    const transport = new ProjectTransport(new FakeAudioContext() as unknown as AudioContext);
    transport.setDuration(10);
    transport.seek(18);
    expect(transport.snapshot.currentSeconds).toBe(10);
    transport.setLoop({ enabled: true, startSeconds: -2, endSeconds: 30 });
    expect(transport.snapshot.loop).toEqual({ enabled: true, startSeconds: 0, endSeconds: 10 });
  });
});
