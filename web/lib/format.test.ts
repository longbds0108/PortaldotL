import { describe, expect, it } from "vitest";
import { formatBudget, formatDuration, formatNativeWei, formatUsdc6, isValidAmountInput, parseNativeWei, parseUsdc6 } from "./format";

describe("money formatting", () => {
  it("formats 6-decimal USDC", () => {
    expect(formatUsdc6(7_500_000_000n)).toBe("$7,500.00");
    expect(formatUsdc6(1n)).toBe("$0.00");
    expect(formatUsdc6(5_000n)).toBe("$0.01");
    expect(formatUsdc6(123_456_789_012_345n)).toBe("$123,456,789.01");
  });
  it("formats native 18-decimal USDC on the same single USDC line", () => {
    expect(formatNativeWei(10n ** 18n)).toBe("$1.00");
    expect(formatNativeWei(25n * 10n ** 17n)).toBe("$2.50");
  });
  it("formats budgets", () => {
    expect(formatBudget(5_000_000_000n, 10_000_000_000n)).toBe("$5,000.00–$10,000.00");
  });
  it("parses user input with explicit decimals", () => {
    expect(parseUsdc6("7,500")).toBe(7_500_000_000n);
    expect(parseUsdc6("$0.000001")).toBe(1n);
    expect(parseNativeWei("1.5")).toBe(15n * 10n ** 17n);
    expect(() => parseUsdc6("abc")).toThrow();
    expect(isValidAmountInput("1.1234567")).toBe(false);
    expect(isValidAmountInput("1.123456")).toBe(true);
  });
  it("formats durations", () => {
    expect(formatDuration(90061)).toBe("1d 1h 1m");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(-5)).toBe("0s");
  });
});
