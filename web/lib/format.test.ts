import { describe, expect, it } from "vitest";
import { formatBudget, formatDuration, formatNativeAmount, formatTokenFloor, formatTokenAmount, isValidAmountInput, parseNativeAmount, parseTokenAmount } from "./format";

describe("money formatting", () => {
  it("formats 18-decimal tPOTv3", () => {
    expect(formatTokenAmount(7_500n * 10n ** 18n)).toBe("7,500.00 tPOTv3");
    expect(formatTokenAmount(1n)).toBe("0.00 tPOTv3");
    expect(formatTokenAmount(5n * 10n ** 16n)).toBe("0.05 tPOTv3");
    expect(formatTokenAmount(123_456_789n * 10n ** 18n + 10n ** 16n)).toBe("123,456,789.01 tPOTv3");
  });
  it("formats native tPOTv3", () => {
    expect(formatNativeAmount(10n ** 18n)).toBe("1.00 tPOTv3");
    expect(formatNativeAmount(25n * 10n ** 17n)).toBe("2.50 tPOTv3");
  });
  it("formats budgets", () => {
    expect(formatBudget(5_000n * 10n ** 18n, 10_000n * 10n ** 18n)).toBe("5,000.00–10,000.00 tPOTv3");
  });
  it("parses user input with explicit decimals", () => {
    expect(parseTokenAmount("7,500")).toBe(7_500n * 10n ** 18n);
    expect(parseTokenAmount("0.000000000000000001")).toBe(1n);
    expect(parseNativeAmount("1.5")).toBe(15n * 10n ** 17n);
    expect(() => parseTokenAmount("abc")).toThrow();
    expect(isValidAmountInput("1.1234567890123456789")).toBe(false);
    expect(isValidAmountInput("1.123456789012345678")).toBe(true);
  });
  it("formats durations", () => {
    expect(formatDuration(90061)).toBe("1d 1h 1m");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("wallet balance display", () => {
  it("rounds down to the cent, never up", async () => {
    const { formatNativeAmountFloor } = await import("./format");
    expect(formatNativeAmountFloor(44_929_233_183_968_200_000n)).toBe("44.92 tPOTv3");
    expect(formatNativeAmountFloor(999_999_999_999_999_999n)).toBe("0.99 tPOTv3");
    expect(formatNativeAmountFloor(1_234_567n * 10n ** 18n)).toBe("1,234,567.00 tPOTv3");
  });
});

describe("token amounts", () => {
  it("floors to the shown precision, never rounding up", () => {
    expect(formatTokenFloor(64_922_704n, 6)).toBe("64.92");
    expect(formatTokenFloor(89_601_608n, 6)).toBe("89.60");
    expect(formatTokenFloor(999_999n, 6)).toBe("0.99");
    expect(formatTokenFloor(1_234_567_000_000n, 6)).toBe("1,234,567.00");
  });
  it("shows BTC-style amounts with up to 8 decimals, trimmed", () => {
    expect(formatTokenFloor(14_991n, 8, 8, 0)).toBe("0.00014991");
    expect(formatTokenFloor(100_000_000n, 8, 8, 0)).toBe("1");
    expect(formatTokenFloor(150_000_000n, 8, 8, 0)).toBe("1.5");
    expect(formatTokenFloor(0n, 8, 8, 0)).toBe("0");
  });
});
