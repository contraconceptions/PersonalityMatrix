import { afterEach, describe, expect, it, vi } from "vitest";
import { customers } from "../src/lib/matrix";
import { aiAvailability, aiClassify, parseAiResponse, resetAi, responseSchema, systemPrompt } from "../src/lib/nano";

const ids = customers.map((c) => c.id);
const g = globalThis as { LanguageModel?: unknown };

function fakeModel(reply: string | (() => Promise<string>)) {
  const destroyed = vi.fn();
  const prompts: Array<{ input: string; options?: { responseConstraint?: object } }> = [];
  const session = {
    prompt: vi.fn(async (input: string, options?: { responseConstraint?: object }) => {
      prompts.push({ input, options });
      return typeof reply === "string" ? reply : reply();
    }),
    clone: vi.fn(async () => ({ ...session, destroy: destroyed })),
    destroy: vi.fn(),
  };
  const create = vi.fn(async () => session);
  g.LanguageModel = { availability: vi.fn(async () => "available"), create };
  return { create, destroyed, prompts };
}

afterEach(() => {
  resetAi();
  delete g.LanguageModel;
});

describe("on-device AI (Prompt API)", () => {
  it("reports unsupported when the browser has no Prompt API", async () => {
    expect(await aiAvailability()).toBe("unsupported");
  });

  it("passes through Chrome's availability", async () => {
    fakeModel("{}");
    expect(await aiAvailability()).toBe("available");
  });

  it("describes every customer type in the instructions", () => {
    const p = systemPrompt(customers);
    for (const c of customers) expect(p).toContain(c.id);
    expect(p).toMatch(/negation/i);
  });

  it("constrains the answer to the known types", () => {
    const s = responseSchema(ids) as { properties: { customerId: { enum: string[] } } };
    expect(s.properties.customerId.enum).toEqual(ids);
  });

  it("classifies a line on a fresh clone and cleans it up", async () => {
    const m = fakeModel(JSON.stringify({ customerId: "distressed", runnerUp: "demanding", confidence: "high", evidence: ["can't pay my rent"] }));
    const r = await aiClassify("I'm freaking out, I can't pay my rent", customers);
    expect(r).toEqual({ customerId: "distressed", runnerUp: "demanding", confidence: "high", evidence: ["can't pay my rent"] });
    expect(m.prompts[0].options?.responseConstraint).toBeDefined();
    expect(m.destroyed).toHaveBeenCalledTimes(1);
    await aiClassify("another line here", customers);
    expect(m.create).toHaveBeenCalledTimes(1); // the base session is reused
  });

  it("returns null instead of throwing when the model fails", async () => {
    fakeModel(() => Promise.reject(new Error("quota")));
    expect(await aiClassify("anything at all", customers)).toBeNull();
  });
});

describe("parseAiResponse", () => {
  const text = "You people NEVER call back. I want a supervisor.";

  it("keeps only evidence that appears in the text", () => {
    const r = parseAiResponse(
      JSON.stringify({ customerId: "demanding", runnerUp: "none", confidence: "medium", evidence: ["never call back", "I want a supervisor.", "made up quote"] }),
      text,
      ids,
    );
    expect(r).toEqual({ customerId: "demanding", runnerUp: null, confidence: "medium", evidence: ["never call back", "i want a supervisor"] });
  });

  it("rejects unknown types and invalid JSON", () => {
    expect(parseAiResponse(JSON.stringify({ customerId: "angry" }), text, ids)).toBeNull();
    expect(parseAiResponse("not json", text, ids)).toBeNull();
  });

  it("defaults a missing confidence to low", () => {
    expect(parseAiResponse(JSON.stringify({ customerId: "demanding" }), text, ids)?.confidence).toBe("low");
  });
});
