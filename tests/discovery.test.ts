import test from "node:test";
import assert from "node:assert/strict";
import { validateOffer } from "../src/server/discovery";
import { schemas, today, plusDays } from "../src/domain/model";
const offer = () =>
  schemas.offers.parse({
    name: "Test fixture",
    retailer: "AH",
    variant: "",
    terms: "1+1 free",
    price: null,
    quantity: "2 items",
    start: today(),
    end: plusDays(today(), 6),
    sourceUrl: "https://www.ah.nl/bonus",
    fetchedAt: Date.now(),
    scope: "national public in store",
    loyalty: "Bonus card required",
    activation: "not required",
    productKey: "fixture",
  });
test("discovery preserves actual conditions and unknown price", () => {
  const r = validateOffer(offer(), "AH");
  assert.equal(r.price, null);
  assert.equal(r.loyalty, "Bonus card required");
});
test("expired, stale and untrusted offer evidence is rejected", () => {
  assert.throws(() =>
    validateOffer({ ...offer(), end: plusDays(today(), -1) }, "AH"),
  );
  assert.throws(() =>
    validateOffer({ ...offer(), fetchedAt: Date.now() - 90000000 }, "AH"),
  );
  assert.throws(() =>
    validateOffer({ ...offer(), sourceUrl: "https://attacker.test" }, "AH"),
  );
});
test("personal Bonus Box is excluded", () =>
  assert.throws(() =>
    validateOffer({ ...offer(), terms: "Personal Bonus Box" }, "AH"),
  ));
