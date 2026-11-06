import { describe, expect, it } from "@jest/globals"
import { normalizeVenueSocialUrl, validateVenueSocialLinks } from "../venueSocialLinks"

describe("venue social links", () => {
  it("accepts and normalizes an allowed HTTPS platform URL", () => {
    expect(normalizeVenueSocialUrl(" https://www.instagram.com/yovibe ", "instagramUrl")).toBe("https://www.instagram.com/yovibe")
  })

  it("rejects insecure and mismatched platform URLs", () => {
    expect(() => normalizeVenueSocialUrl("http://instagram.com/yovibe", "instagramUrl")).toThrow("https://")
    expect(() => normalizeVenueSocialUrl("https://instagram.com/yovibe", "youtubeUrl")).toThrow("valid YouTube")
  })

  it("allows blank optional values and reports only invalid fields", () => {
    expect(validateVenueSocialLinks({
      tiktokUrl: "",
      facebookUrl: "https://fb.com/yovibe",
      instagramUrl: "not-a-url",
      xUrl: null,
      youtubeUrl: "https://youtu.be/example",
    })).toEqual({ instagramUrl: "Instagram link must be a complete URL." })
  })
})
