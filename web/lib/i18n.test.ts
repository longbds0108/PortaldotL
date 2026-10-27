import { afterEach, describe, expect, it } from "vitest";
import { dateLocale, parseLang, setActiveLang, tr, translator, type Text } from "./i18n";

describe("i18n", () => {
  afterEach(() => setActiveLang("en"));

  it("reads only en and vi from the cookie, defaulting to en", () => {
    expect(parseLang("vi")).toBe("vi");
    expect(parseLang("en")).toBe("en");
    expect(parseLang("fr")).toBe("en");
    expect(parseLang(undefined)).toBe("en");
  });

  it("picks one half of a pair, or of a stored Text", () => {
    const pair: Text = ["Open", "Đang mở"];
    expect(translator("en")("Open", "Đang mở")).toBe("Open");
    expect(translator("vi")("Open", "Đang mở")).toBe("Đang mở");
    expect(translator("en")(pair)).toBe("Open");
    expect(translator("vi")(pair)).toBe("Đang mở");
  });

  it("tr follows the language set by the provider", () => {
    expect(tr("Withdraw", "Rút")).toBe("Withdraw");
    setActiveLang("vi");
    expect(tr("Withdraw", "Rút")).toBe("Rút");
    expect(tr(["Seal bid", "Niêm phong"] as Text)).toBe("Niêm phong");
  });

  it("formats dates per language", () => {
    expect(dateLocale("en")).toBe("en-US");
    expect(dateLocale("vi")).toBe("vi-VN");
  });
});
