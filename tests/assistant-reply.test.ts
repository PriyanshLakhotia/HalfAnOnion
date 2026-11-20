import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplyContent } from "../src/client/assistant-reply";
import { applyOperation, emptyState, profileSchema } from "../src/domain/model";

const snapshot = () =>
  applyOperation(
    emptyState(),
    {
      id: crypto.randomUUID(),
      actions: [
        {
          type: "put",
          kind: "recipes",
          id: "soup",
          data: {
            name: "Tomato soup",
            ingredients: [{ name: "Tomatoes", quantity: 450, unit: "g" }],
          },
        },
        {
          type: "put",
          kind: "suggestions",
          id: "idea",
          data: {
            name: "Soup",
            recipeId: "soup",
            participants: ["cook"],
            expiresOn: "2099-01-01",
            reason: "Uses the tomatoes on hand.",
          },
        },
        {
          type: "put",
          kind: "items",
          id: "rice",
          data: {
            name: "Rice",
            quantity: 250,
            unit: "g",
            status: "proposed",
            origin: "inference",
          },
        },
      ],
    },
    "cook",
    [
      {
        id: "cook",
        name: "Cook",
        role: "owner",
        profile: profileSchema.parse({}),
      },
    ],
    Date.now(),
    "assistant",
  ).state;

function render(message: string, state = emptyState()) {
  return renderToStaticMarkup(
    createElement(ReplyContent, {
      reply: { prompt: "Dinner?", message },
      state,
      activity: state.activity.at(-1),
      openRecipe() {},
      openShopping() {},
    }),
  );
}

test("a suggested recipe linked by a meal idea appears once with its reason and ingredient quantities", () => {
  const html = render("Dinner is ready to review.", snapshot());
  assert.equal(html.match(/Tomato soup/g)?.length, 1);
  for (const value of [
    "Uses the tomatoes on hand.",
    "Ingredients (1)",
    "450 g",
    "Shopping list",
    "Suggested",
    "250 g",
  ])
    assert.ok(html.includes(value), value);
});

test("conversational replies render lists and emphasis without executing HTML or remote images", () => {
  const html = render(
    "## Ingredients\n\n- **Tomatoes**\n- Rice\n\n<img src=x onerror=alert(1)>\n\n![image](https://invalid.example/food.png)",
  );
  assert.match(html, /<h3>Ingredients<\/h3>/);
  assert.match(html, /<li><strong>Tomatoes<\/strong><\/li>/);
  assert.doesNotMatch(html, /<img|onerror|invalid\.example/);
});

test("undo removes the rich result actions and records from a past reply", () => {
  const state = snapshot();
  state.activity.at(-1)!.undone = true;
  const html = render("Dinner ideas", state);
  assert.match(html, /Change undone/);
  assert.doesNotMatch(html, /Tomato soup|Open list/);
});
