import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  applyNumericChange,
  caretAfterEdit,
  commitNumericInput,
  finalizeNumericInput,
  formatNumericDisplay,
  normalizeTypedNumeric,
} = await import("../src/utils/numericInput.ts");
const { quickCategories, QUICK_CATEGORY_COUNT } = await import("../src/utils/quickCategories.ts");

describe("typed numeric input", () => {
  it("keeps digits and converts a comma to a decimal point", () => {
    assert.equal(normalizeTypedNumeric("12,5"), "12.5");
    assert.equal(normalizeTypedNumeric("12,50"), "12.50");
  });

  it("drops letters and a second separator", () => {
    assert.equal(normalizeTypedNumeric("12a.3b"), "12.3");
    assert.equal(normalizeTypedNumeric("12.3.4"), "12.34");
    assert.equal(normalizeTypedNumeric("12,3,4"), "12.34");
  });

  it("silently drops fractional digits past two places", () => {
    assert.equal(normalizeTypedNumeric("12.3456"), "12.34");
    assert.equal(normalizeTypedNumeric("12,3456"), "12.34");
  });

  it("keeps a trailing separator while the fraction is still being typed", () => {
    assert.equal(normalizeTypedNumeric("12,"), "12.");
    assert.equal(normalizeTypedNumeric("12."), "12.");
  });

  it("ignores a minus sign unless negatives are allowed", () => {
    assert.equal(normalizeTypedNumeric("-12.5"), "12.5");
    assert.equal(normalizeTypedNumeric("-12.5", { allowNegative: true }), "-12.5");
    assert.equal(normalizeTypedNumeric("-", { allowNegative: true }), "-");
  });
});

describe("pasted numeric input", () => {
  it("converts a comma decimal and keeps the fraction", () => {
    assert.equal(commitNumericInput("12,50"), "12.50");
    assert.equal(commitNumericInput("1 234,56 ₽"), "1234.56");
  });

  it("treats the last separator as decimal when both comma and dot are present", () => {
    assert.equal(commitNumericInput("1,234.56"), "1234.56");
    assert.equal(commitNumericInput("1.234,56"), "1234.56");
    assert.equal(commitNumericInput("$1,234.5678"), "1234.56");
  });

  it("drops repeated grouping separators", () => {
    assert.equal(commitNumericInput("1,234,567"), "1234567");
    assert.equal(commitNumericInput("1.234.567"), "1234567");
  });

  it("reads a single comma plus exactly three digits as a thousands group", () => {
    assert.equal(commitNumericInput("1,234"), "1234");
  });

  it("formats grouped display with one decimal separator", () => {
    assert.equal(formatNumericDisplay("1234.5"), "1\u202f234.5");
    assert.equal(formatNumericDisplay("1234."), "1\u202f234.");
    assert.equal(formatNumericDisplay("-12.5"), "-12.5");
  });

  it("uses the paste parser when several characters arrive at once", () => {
    assert.equal(applyNumericChange("1.234,56", "", {}), "1234.56");
    assert.equal(applyNumericChange("12,5", "12", {}), "12.5");
  });

  it("drops a trailing separator when the field is left", () => {
    assert.equal(finalizeNumericInput("12."), "12");
    assert.equal(finalizeNumericInput("-"), "");
  });

  it("places the caret after the kept digits", () => {
    const formatted = formatNumericDisplay("1234.5");
    const pos = caretAfterEdit("1234.5", formatted, (prefix) => normalizeTypedNumeric(prefix));
    assert.equal(pos, formatted.length);
  });
});

describe("quick categories", () => {
  const categories = Array.from({ length: 14 }, (_, index) => ({
    id: index + 1,
    name: `Cat ${String(index + 1).padStart(2, "0")}`,
    icon: "folder",
    type: "expense",
    parent: null,
  }));

  it("keeps at least ten categories in one ranked set when more exist", () => {
    const used = [3, 3, 3, 1, 1, 8];
    const picked = quickCategories(categories, used);
    assert.ok(picked.length >= 10);
    assert.equal(picked.length, QUICK_CATEGORY_COUNT);
    assert.equal(picked[0].id, 3);
    assert.equal(picked[1].id, 1);
    assert.equal(picked[2].id, 8);
  });

  it("returns every category when fewer than the quick set exist", () => {
    const picked = quickCategories(categories.slice(0, 4), []);
    assert.equal(picked.length, 4);
  });

  it("keeps the selected category visible when it is outside the common set", () => {
    const picked = quickCategories(categories, [1, 1], 14);
    assert.equal(picked.at(-1)?.id, 14);
    assert.ok(picked.length >= 10);
  });
});
