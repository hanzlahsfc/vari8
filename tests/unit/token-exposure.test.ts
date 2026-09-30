import { describe, expect, it } from "vitest";

import {
  TokenFlowNotExposableError,
  assertTokenFlowsExternallyExposable,
} from "../../lib/tokens";

describe("S1-F1 external-exposure boundary", () => {
  it("fails closed: token flows are not exposable", () => {
    expect(() => assertTokenFlowsExternallyExposable()).toThrow(
      TokenFlowNotExposableError,
    );
    expect(() => assertTokenFlowsExternallyExposable()).toThrow(
      "token_flows_not_exposable",
    );
  });

  it("is a pure structural boundary (no parameters, no side effects)", () => {
    expect(assertTokenFlowsExternallyExposable).toHaveLength(0);
    try {
      assertTokenFlowsExternallyExposable();
    } catch (error) {
      expect(error).toBeInstanceOf(TokenFlowNotExposableError);
      expect((error as TokenFlowNotExposableError).code).toBe(
        "token_flows_not_exposable",
      );
      expect((error as Error).message).toBe("token_flows_not_exposable");
    }
  });
});
