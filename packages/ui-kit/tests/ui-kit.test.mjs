/**
 * Capsule UI kit — unit tests (node:test, no external deps).
 *
 * Run: pnpm --filter @capsule/ui-kit test   (or: node --test tests/)
 * These pin the *contract* of the class builders: every variant/size/preset
 * combination must produce stable, expected Tailwind classes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  button,
  card,
  input,
  textarea,
  select,
  table,
  tableRow,
  tokensFor,
  cn,
} from "../dist/index.js";

test("cn merges and deduplicates classes, dropping empties", () => {
  assert.equal(cn("a b", false, null, undefined, "b c"), "a b c");
});

test("button default variant has base classes and material radius", () => {
  const cls = button();
  assert.ok(cls.includes("inline-flex"));
  assert.ok(cls.includes("rounded-md")); // material preset radius
  assert.ok(cls.includes("bg-blue-600"));
  assert.ok(cls.includes("h-10")); // md size height
});

test("button variants are mutually exclusive on their signature class", () => {
  assert.ok(button({ variant: "outline" }).includes("border"));
  assert.ok(button({ variant: "danger" }).includes("bg-red-600"));
  assert.ok(button({ variant: "ghost" }).includes("text-blue-600"));
  assert.ok(!button({ variant: "ghost" }).includes("bg-blue-600"));
});

test("button link variant drops fixed height", () => {
  const cls = button({ variant: "link" });
  assert.ok(cls.includes("h-auto"));
  assert.ok(!cls.includes("h-10"));
});

test("button sizes change height", () => {
  assert.ok(button({ size: "sm" }).includes("h-8"));
  assert.ok(button({ size: "lg" }).includes("h-12"));
});

test("button preset overrides height and radius from tokens", () => {
  const ios = button({ preset: "ios" });
  const t = tokensFor("ios");
  assert.ok(ios.includes(t.controlHeight)); // h-11
  assert.ok(ios.includes("rounded-xl"));
  assert.ok(!ios.includes("h-10"));
});

test("button block adds full width", () => {
  assert.ok(button({ block: true }).includes("w-full"));
  assert.ok(!button().includes("w-full"));
});

test("card variants differ on shadow/border", () => {
  assert.ok(card().includes("shadow-sm"));
  assert.ok(card({ variant: "outline" }).includes("border"));
  assert.ok(card({ variant: "elevated" }).includes("shadow-lg"));
});

test("card preset changes radius", () => {
  assert.ok(card({ preset: "ios" }).includes("rounded-xl"));
});

test("input invalid state switches focus ring to red", () => {
  const ok = input();
  const bad = input({ invalid: true });
  assert.ok(ok.includes("focus:ring-blue-500"));
  assert.ok(bad.includes("focus:ring-red-500"));
  assert.ok(bad.includes("border-red-500"));
});

test("input preset applies control height and font size", () => {
  const cls = input({ preset: "ios" });
  assert.ok(cls.includes("h-11"));
  assert.ok(cls.includes("text-[17px]"));
});

test("textarea is multi-line (min-height, no control height)", () => {
  const cls = textarea();
  assert.ok(cls.includes("min-h-[80px]"));
  assert.ok(!cls.includes("h-10"));
});

test("select keeps native picker affordance (appearance-none, chevron)", () => {
  const cls = select();
  assert.ok(cls.includes("appearance-none"));
  assert.ok(cls.includes("bg-[url("));
  assert.ok(cls.includes("pr-10"));
});

test("table row striping and hover are opt-in", () => {
  const plain = tableRow();
  assert.ok(!plain.includes("even:bg-gray-50"));
  assert.ok(tableRow({ striped: true }).includes("even:bg-gray-50"));
  assert.ok(tableRow({ hoverable: true }).includes("hover:bg-blue-50"));
});

test("presets differ on the intended tokens", () => {
  const ios = tokensFor("ios");
  const material = tokensFor("material");
  assert.notEqual(ios.radius, material.radius);
  assert.notEqual(ios.controlHeight, material.controlHeight);
  assert.equal(ios.controlHeight, "h-11");
  assert.equal(material.controlHeight, "h-10");
});
