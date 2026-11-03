import { afterEach, describe, expect, it, vi } from "vitest";
import { allAvatarUrls } from "./avatars";
import { allCardUrls, CARD_IMAGE_COUNT } from "./cards";
import { preloadImages } from "./preload";

describe("preloadImages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists every card image and portrait", () => {
    expect(allCardUrls()).toHaveLength(CARD_IMAGE_COUNT);
    expect(allAvatarUrls().length).toBeGreaterThan(0);
  });

  it("requests and decodes each image, even when one fails", async () => {
    const made: { src: string; decode: ReturnType<typeof vi.fn> }[] = [];
    class FakeImage {
      src = "";
      decoding = "";
      decode = vi.fn(() =>
        this.src.endsWith("bad.png")
          ? Promise.reject(new Error("broken"))
          : Promise.resolve(),
      );
      constructor() {
        made.push(this);
      }
    }
    vi.stubGlobal("Image", FakeImage);

    await expect(
      preloadImages(["a.png", "bad.png", "c.png"]),
    ).resolves.toBeUndefined();
    expect(made.map((m) => m.src)).toEqual(["a.png", "bad.png", "c.png"]);
    for (const m of made) expect(m.decode).toHaveBeenCalledOnce();
  });

  it("copes with an environment that cannot decode", async () => {
    class NoDecode {
      src = "";
      decoding = "";
    }
    vi.stubGlobal("Image", NoDecode);
    await expect(preloadImages(["a.png"])).resolves.toBeUndefined();
  });
});
