import React from 'react';
import { type Entity } from '../domain/model';
export function RecipeLibrary({ saved, suggestions, view, setView, search, setSearch, open, save, dismiss }: {
  saved: Entity[]; suggestions: Entity[]; view: string; setView: (view: string) => void;
  search: string; setSearch: (search: string) => void; open: (recipe: Entity) => void;
  save: (recipe: Entity) => void; dismiss: (recipe: Entity) => void;
}) {
  const recipes = (view === 'saved' ? saved : suggestions).filter(r =>
    (r.name + ' ' + r.ingredients.map((i: any) => i.name).join(' ')).toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="recipe-tabs library-tabs" role="tablist" aria-label="Recipe collection">
      <button role="tab" aria-selected={view === 'saved'} aria-controls="recipe-collection" onClick={() => setView('saved')}>Our recipes <span>{saved.length}</span></button>
      <button role="tab" aria-selected={view === 'suggested'} aria-controls="recipe-collection" onClick={() => setView('suggested')}>AI suggestions <span>{suggestions.length}</span></button>
    </div>
    <div className="search"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a recipe or ingredient" aria-label="Search recipes" /></div>
    <div id="recipe-collection" role="tabpanel" aria-label={view === 'saved' ? 'Our recipes' : 'AI suggestions'}>
      {recipes.length ? <div className="recipe-grid">{recipes.map(r => <article className="recipe-card" key={r.id}>
        <button className="recipe-open" onClick={() => open(r)}>
          <h3>{r.name}</h3>
          {(r.totalMinutes > 0 || r.collection === 'saved') && <p className="recipe-meta">{[r.totalMinutes > 0 ? `${r.totalMinutes} min` : '', r.collection === 'saved' ? 'Saved from AI' : ''].filter(Boolean).join(' · ')}</p>}
        </button>
        {view === 'suggested' && <div className="actions"><button onClick={() => save(r)}>Save recipe</button><button className="text-button" onClick={() => dismiss(r)}>Not now</button></div>}
      </article>)}</div> : <p className="empty">{search ? 'No matching recipes.' : view === 'saved' ? 'No recipes saved.' : 'No recipe suggestions.'}</p>}
    </div>
  </>;
}
