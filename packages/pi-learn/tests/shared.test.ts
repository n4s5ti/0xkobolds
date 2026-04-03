import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  estimateMessagesTokens,
  generateId,
  parseReasoningOutput,
  parseDreamOutput,
  buildReasoningPrompt,
  buildDreamPrompt,
  DEFAULT_TOKEN_BATCH_SIZE,
  SHORT_SUMMARY_INTERVAL,
} from "../src/shared";

describe("cosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it("should return -1 for opposite vectors", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it("should return 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("should throw for vectors of different lengths", () => {
    const a = [1, 2];
    const b = [1, 2, 3];
    expect(() => cosineSimilarity(a, b)).toThrow();
  });
});

describe("estimateMessagesTokens", () => {
  it("should return 0 for empty array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it("should estimate based on content length", () => {
    const messages = [
      { role: "user", content: "Hello world" },
      { role: "assistant", content: "Hi there" },
    ];
    const estimate = estimateMessagesTokens(messages);
    expect(estimate).toBeGreaterThan(0);
  });

  it("should scale with number of messages", () => {
    const single = [{ role: "user", content: "Hello" }];
    const double = [
      { role: "user", content: "Hello" },
      { role: "user", content: "Hello" },
    ];
    const singleEstimate = estimateMessagesTokens(single);
    const doubleEstimate = estimateMessagesTokens(double);
    expect(doubleEstimate).toBeGreaterThan(singleEstimate);
  });
});

describe("generateId", () => {
  it("should generate unique IDs", () => {
    const id1 = generateId("test_");
    const id2 = generateId("test_");
    expect(id1).not.toBe(id2);
  });

  it("should start with the prefix", () => {
    const id = generateId("myprefix_");
    expect(id.startsWith("myprefix_")).toBe(true);
  });
});

describe("parseReasoningOutput", () => {
  it("should parse valid JSON output", () => {
    const json = JSON.stringify({
      explicit: [{ content: "Test fact" }],
      deductive: [{ premises: ["p1"], conclusion: "c1" }],
      inductive: [{ pattern: "pattern", evidence: ["e1"] }],
      abductive: [{ observation: "obs", inference: "inf" }],
      peerCard: { name: "John", interests: ["coding"] },
      summary: { type: "short", content: "Summary" },
    });

    const result = parseReasoningOutput(json);
    expect(result.explicit).toHaveLength(1);
    expect(result.deductive).toHaveLength(1);
    expect(result.inductive).toHaveLength(1);
    expect(result.abductive).toHaveLength(1);
    expect(result.peerCard?.name).toBe("John");
    expect(result.summary?.content).toBe("Summary");
  });

  it("should handle empty/invalid JSON", () => {
    const result = parseReasoningOutput("invalid json");
    expect(result.explicit).toHaveLength(0);
    expect(result.deductive).toHaveLength(0);
  });

  it("should handle partial JSON", () => {
    const result = parseReasoningOutput('{"deductive": []}');
    expect(result.explicit ?? []).toHaveLength(0);
    expect(result.deductive ?? []).toHaveLength(0);
  });
});

describe("parseDreamOutput", () => {
  it("should parse valid dream JSON", () => {
    const json = JSON.stringify({
      newConclusions: [
        { type: "inductive", content: "Pattern observed", premises: ["evidence"], confidence: 0.8 },
      ],
      peerCardUpdates: { interests: ["deep learning"] },
    });

    const result = parseDreamOutput(json);
    expect(result.newConclusions ?? []).toHaveLength(1);
    expect(result.peerCardUpdates?.interests).toContain("deep learning");
  });

  it("should handle empty dream output", () => {
    const result = parseDreamOutput("{}");
    expect(result.newConclusions ?? []).toHaveLength(0);
  });
});

describe("buildReasoningPrompt", () => {
  it("should include messages in prompt", () => {
    const messages = [{ role: "user", content: "I love coding in Python" }];
    const prompt = buildReasoningPrompt(messages);
    expect(prompt).toContain("I love coding in Python");
  });

  it("should include existing context when provided", () => {
    const messages = [{ role: "user", content: "Hello" }];
    const existing = {
      conclusions: [{ type: "inductive" as const, content: "Previous pattern" }],
      summary: "Previous summary",
    };
    const prompt = buildReasoningPrompt(messages, existing);
    expect(prompt).toContain("Previous pattern");
    expect(prompt).toContain("Previous summary");
  });

  it("should handle empty messages", () => {
    const prompt = buildReasoningPrompt([]);
    expect(prompt).toContain("Messages to analyze:");
  });
});

describe("buildDreamPrompt", () => {
  it("should include messages in dream prompt", () => {
    const messages = [{ role: "user", content: "Recent chat" }];
    const conclusions: any[] = [];
    const prompt = buildDreamPrompt(messages, conclusions);
    expect(prompt).toContain("Recent chat");
  });

  it("should include conclusions", () => {
    const messages: any[] = [];
    const conclusions = [{ id: "1", content: "Old conclusion" } as any];
    const prompt = buildDreamPrompt(messages, conclusions);
    expect(prompt).toContain("Old conclusion");
  });
});

describe("constants", () => {
  it("should have reasonable token batch size", () => {
    expect(DEFAULT_TOKEN_BATCH_SIZE).toBeGreaterThan(100);
    expect(DEFAULT_TOKEN_BATCH_SIZE).toBeLessThan(10000);
  });

  it("should have reasonable summary interval", () => {
    expect(SHORT_SUMMARY_INTERVAL).toBeGreaterThan(0);
    expect(SHORT_SUMMARY_INTERVAL).toBeLessThan(100);
  });
});

describe("ID generation", () => {
  it("should generate IDs with correct prefixes", () => {
    const msgId = generateId("msg_");
    expect(msgId.startsWith("msg_")).toBe(true);
    
    const conclId = generateId("concl_");
    expect(conclId.startsWith("concl_")).toBe(true);
    
    const sumId = generateId("sum_");
    expect(sumId.startsWith("sum_")).toBe(true);
  });
});
