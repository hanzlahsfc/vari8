import { describe, expect, it } from "vitest";

import {
  AccountSecurityNotExposableError,
  TokenFlowNotExposableError,
  assertAccountSecurityExternallyExposable,
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

  it("S1-F2B: the account-security surface is not exposable either", () => {
    expect(() => assertAccountSecurityExternallyExposable()).toThrow(
      AccountSecurityNotExposableError,
    );
    expect(() => assertAccountSecurityExternallyExposable()).toThrow(
      "account_security_not_exposable",
    );
    expect(assertAccountSecurityExternallyExposable).toHaveLength(0);
  });
});
