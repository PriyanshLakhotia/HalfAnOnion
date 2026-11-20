import React from "react";
import { type Entity } from "../domain/model";
import { navigateRecipeTabs } from "./recipe-tabs";

type RecipeLibraryProps = {
  saved: Entity[];
  suggestions: Entity[];
  view: string;
  setView: (view: string) => void;
  search: string;
  setSearch: (search: string) => void;
  open: (recipe: Entity) => void;
  save: (recipe: Entity) => void;
  dismiss: (recipe: Entity) => void;
};

export function RecipeLibrary({
  saved, suggestions, view, setView, search, setSearch, open, save, dismiss,
}: RecipeLibraryProps) {
  const collection = view === "saved" ? saved : suggestions;
  const recipes = collection.filter((recipe) =>
    [recipe.name, ...recipe.ingredients.map((i: { name: string }) => i.name)]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="library-tools">
        <div
          className="recipe-tabs library-tabs"
          role="tablist"
          aria-label="Recipe collection"
          onKeyDown={navigateRecipeTabs}
        >
          {[
            { id: "saved", label: "Our recipes", count: saved.length },
            { id: "suggested", label: "AI suggestions", count: suggestions.length },
          ].map(({ id, label, count }) => (
            <button
              key={id}
              id={`recipes-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={view === id}
              aria-controls="recipe-collection"
              tabIndex={view === id ? 0 : -1}
              onClick={() => setView(id)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
        <input
          className="recipe-search"
          type="search"
          aria-label="Search recipes"
          placeholder="Find a recipe or ingredient"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div id="recipe-collection" role="tabpanel" aria-labelledby={`recipes-tab-${view}`}>
        {recipes.length ? (
          <ul className="recipe-index">
            {recipes.map((recipe) => {
              const ingredients = recipe.ingredients
                .slice(0, 3)
                .map((i: { name: string }) => i.name)
                .join(", ");
              return (
                <li key={recipe.id}>
                  <button className="recipe-open" onClick={() => open(recipe)}>
                    <span className="recipe-info">
                      <span className="recipe-name">{recipe.name}</span>
                      {ingredients && <span className="recipe-ingredient-preview">{ingredients}</span>}
                    </span>
                    <span className="recipe-meta">
                      {recipe.totalMinutes > 0 && <span>{recipe.totalMinutes} min</span>}
                      {recipe.collection === "saved" && <span>Saved from AI</span>}
                    </span>
                  </button>
                  {view === "suggested" && (
                    <div className="actions">
                      <button onClick={() => save(recipe)}>Save recipe</button>
                      <button className="text-button" onClick={() => dismiss(recipe)}>Not now</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">
            {search ? "No matching recipes." : view === "saved" ? "No recipes saved." : "No recipe suggestions."}
          </p>
        )}
      </div>
    </>
  );
}
