import React from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Activity, Entity, State } from "../domain/model";

export type AssistantReply = {
  prompt: string;
  message: string;
  operationId?: string;
  relatedSuggestionIds?: string[];
  failed?: boolean;
};
type Ingredient = {
  name: string;
  quantity?: number | null;
  unit?: string;
  variant?: string;
};
const amount = (
  quantity: number | null | undefined,
  unit: string | undefined,
) => [quantity, unit].filter((v) => v != null && v !== "").join(" ");
const heading: Components["h3"] = ({ children }) => <h3>{children}</h3>;
const markup: Components = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  a: ({ href, children }) =>
    href && /^https?:\/\//i.test(href) ? (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  table: ({ children }) => (
    <div className="reply-table">
      <table>{children}</table>
    </div>
  ),
};
const markdownElements = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "br",
  "blockquote",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "del",
];

export function ReplyContent({
  reply,
  activity,
  state,
  openRecipe,
  openShopping,
  undo,
}: {
  reply: AssistantReply;
  activity?: Activity;
  state: State;
  openRecipe: (record: Entity) => void;
  openShopping: () => void;
  undo?: () => void;
}) {
  const recipes = new Map<string, { recipe: Entity; reason?: string }>();
  const groceries: Entity[] = [];
  const suggestionIds = new Set(
    activity?.undone ? [] : reply.relatedSuggestionIds,
  );
  const ideas: Entity[] = [];
  const meals: Entity[] = [];
  for (const change of activity?.undone ? [] : (activity?.changes ?? [])) {
    const record = state.entities[change.kind][change.id];
    if (!record || !change.after) continue;
    if (
      change.kind === "recipes" &&
      record.collection !== "dismissed" &&
      !recipes.has(record.id)
    ) {
      recipes.set(record.id, { recipe: record });
    } else if (change.kind === "suggestions" && record.status === "proposed") {
      suggestionIds.add(record.id);
    } else if (
      change.kind === "items" &&
      ["proposed", "confirmed", "purchased"].includes(record.status)
    ) {
      groceries.push(record);
    } else if (change.kind === "meals") meals.push(record);
  }
  for (const id of suggestionIds) {
    const idea = state.entities.suggestions[id];
    if (!idea || idea.status !== "proposed") continue;
    const recipe = state.entities.recipes[idea.recipeId];
    if (recipe && recipe.collection !== "dismissed")
      recipes.set(recipe.id, { recipe, reason: idea.reason });
    else if (!idea.recipeId) ideas.push(idea);
  }
  const hasRecords =
    recipes.size + groceries.length + ideas.length + meals.length > 0;
  const longNote = hasRecords && reply.message.length > 280;
  const note = (
    <div className="reply-prose">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        allowedElements={markdownElements}
        components={markup}
      >
        {reply.message}
      </Markdown>
    </div>
  );
  return (
    <>
      <p className="reply-prompt">
        <span className="sr-only">You asked: </span>
        {reply.prompt}
      </p>
      {!longNote && note}
      {recipes.size > 0 && (
        <section className="reply-group">
          <h3>{recipes.size === 1 ? "Recipe" : "Recipes"}</h3>
          <div className="reply-recipes">
            {Array.from(recipes.values(), ({ recipe, reason }) => (
              <article key={recipe.id}>
                <h4>
                  <button
                    className="reply-recipe-name"
                    onClick={() => openRecipe(recipe)}
                  >
                    {recipe.name}
                  </button>
                </h4>
                <p className="reply-meta">
                  {[
                    recipe.totalMinutes > 0 && `${recipe.totalMinutes} min`,
                    recipe.servings > 0 && `Serves ${recipe.servings}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {reason && <p>{reason}</p>}
                {recipe.ingredients.length > 0 && (
                  <details>
                    <summary>Ingredients ({recipe.ingredients.length})</summary>
                    <ul className="reply-ingredients">
                      {recipe.ingredients.map(
                        (item: Ingredient, index: number) => (
                          <li key={index}>
                            <span>
                              {item.name}
                              {item.variant && ` · ${item.variant}`}
                            </span>
                            <span>{amount(item.quantity, item.unit)}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {groceries.length > 0 && (
        <section className="reply-group">
          <div className="reply-section-heading">
            <h3>Shopping list</h3>
            <button className="text-button" onClick={openShopping}>
              Open list
            </button>
          </div>
          <ul className="reply-ingredients reply-groceries">
            {groceries.map((item) => (
              <li key={item.id}>
                <span>
                  {item.name}
                  <small>
                    {[
                      item.status === "proposed"
                        ? "Suggested"
                        : item.status === "purchased"
                          ? "Purchased"
                          : "On the list",
                      item.variant,
                      item.brand,
                      item.storeId !== "any" &&
                        state.entities.stores[item.storeId]?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <span>{amount(item.quantity, item.unit)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ideas.length > 0 && (
        <section className="reply-group">
          <h3>Meal ideas</h3>
          <ul className="reply-list">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <strong>{idea.name}</strong>
                {idea.location && <small>{idea.location}</small>}
                {idea.reason && <p>{idea.reason}</p>}
                {/^https?:\/\//i.test(idea.url) && (
                  <a href={idea.url} target="_blank" rel="noreferrer">
                    Website
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {meals.length > 0 && (
        <section className="reply-group">
          <h3>Meal plan</h3>
          <ul className="reply-list">
            {meals.map((meal) => (
              <li key={meal.id}>
                <strong>{meal.name}</strong>
                <small>
                  {[
                    new Date(meal.date + "T12:00:00").toLocaleDateString(
                      "en-GB",
                      { weekday: "short", day: "numeric", month: "short" },
                    ),
                    meal.mealType,
                    meal.time,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {longNote && (
        <details className="reply-note">
          <summary>Read full reply</summary>
          {note}
        </details>
      )}
      {activity?.undone ? (
        <p className="reply-meta">Change undone.</p>
      ) : (
        undo && (
          <button className="text-button reply-undo" onClick={undo}>
            Undo this change
          </button>
        )
      )}
    </>
  );
}
