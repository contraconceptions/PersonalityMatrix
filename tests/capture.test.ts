import { describe, expect, it } from "vitest";
import { checkSelector, cleanCaptured, isCaptureMessage, MAX_CAPTURE_CHARS, originPattern, toMatchPattern } from "../src/lib/capture";

describe("chat capture settings", () => {
  it("turns what a supervisor types into a single-site match pattern", () => {
    expect(toMatchPattern("support.example.com")).toBe("https://support.example.com/*");
    expect(toMatchPattern("https://Support.Example.com/")).toBe("https://support.example.com/*");
    expect(toMatchPattern("https://crm.example.com/chat/*")).toBe("https://crm.example.com/chat/*");
    expect(toMatchPattern("http://localhost:8080")).toBe("http://localhost:8080/*");
  });

  it("refuses all-sites patterns and junk", () => {
    expect(toMatchPattern("")).toBeNull();
    expect(toMatchPattern("https://*/*")).toBeNull();
    expect(toMatchPattern("not a site at all")).toBeNull();
    expect(toMatchPattern("ftp://example.com")).toBeNull();
  });

  it("asks permission for the site's host, any path", () => {
    expect(originPattern("https://crm.example.com/chat/*")).toBe("https://crm.example.com/*");
  });

  it("checks CSS selectors when a document is available", () => {
    const doc = {
      querySelector: (s: string) => {
        if (s.includes("[[")) throw new Error("bad");
        return null;
      },
    };
    expect(checkSelector(".ok", doc)).toBeNull();
    expect(checkSelector("div[[", doc)).toMatch(/isn't a valid CSS selector/);
    expect(checkSelector("  ", doc)).toMatch(/Enter a CSS selector/);
  });

  it("cleans captured text and caps its length", () => {
    expect(cleanCaptured("  Hi,\n\n  I need   help  ")).toBe("Hi, I need help");
    expect(cleanCaptured("x".repeat(MAX_CAPTURE_CHARS + 50))).toHaveLength(MAX_CAPTURE_CHARS);
  });

  it("recognizes only well-formed capture messages", () => {
    expect(isCaptureMessage({ type: "pm-capture", text: "hi" })).toBe(true);
    expect(isCaptureMessage({ type: "pm-capture" })).toBe(false);
    expect(isCaptureMessage({ type: "other", text: "hi" })).toBe(false);
    expect(isCaptureMessage(null)).toBe(false);
  });
});
