import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Mic,
  Square,
} from "lucide-react";
import {
  DEFAULT_MODEL,
  today,
  plusDays,
  pendingSuggestions,
  suggestedRecipes,
  profileSchema,
  activeOffer,
  type Kind,
  type Entity,
  type Operation,
} from "../domain/model";
import { retailerRules } from "../domain/retailers";
import { api, clearLocal, useKitchen, type Snapshot } from "./store";
import "./style.css";
import "./forms.css";
import "./collections.css";
import "./login.css";
import "./assistant-reply.css";
import { ScheduleStatus } from "./schedule-status";
import { RecipeLibrary } from "./recipe-library";
import { RecipeCreator } from "./recipe-creator";
import { useAssistantStatus } from "./use-assistant-status";
import { useVoiceInput } from "./use-voice-input";
import { ReplyContent, type AssistantReply } from "./assistant-reply";
const units = [
  "",
  "g",
  "kg",
  "ml",
  "l",
  "piece",
  "packet",
  "tbsp",
  "tsp",
  "cup",
];
const titleCase = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const entries = (obj: Record<string, Entity>) => Object.values(obj);
function Onion({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24 7c0 10-16 11-16 24a16 12 0 0 0 32 0C40 18 24 17 24 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M24 16c0 6-10 9-10 16s20 10 20 0-10-10-10-16Zm0 8c0 3-4 5-4 9s8 4 8 0-4-6-4-9Zm0-17 5-3M24 7l-4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Empty({ title }: { title: string }) {
  return (
    <div className="empty">
      <p>{title}</p>
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="icon" aria-label="Close" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Login({
  done,
  embedded = false,
}: {
  done: () => void;
  embedded?: boolean;
}) {
  const invite = new URLSearchParams(location.search).get("invite") ?? "";
  const [canCreate, setCanCreate] = useState(false),
    [create, setCreate] = useState(!!invite),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/api/auth/status")
      .then((s) => setCanCreate(s.canCreate))
      .catch(() => {});
  }, []);
  const Container = embedded ? "div" : "main";
  return (
    <Container className={embedded ? "auth-embedded" : "auth-page"}>
      {!embedded && (
        <div className="auth-cover">
          <div className="auth-cover-inner">
            <p className="auth-wordmark">Half an <em>Onion</em></p>
            <img
              className="auth-photo"
              src="/onion-still-life.webp"
              alt=""
              width="1536"
              height="1024"
              fetchPriority="high"
            />
          </div>
        </div>
      )}
      <div className="auth-form">
        {!embedded && (
          <h1>{create ? (invite ? "Join household" : "Create account") : "Sign in"}</h1>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const d = Object.fromEntries(new FormData(e.currentTarget));
              await api("/api/auth/" + (create ? "register" : "login"), {
                ...d,
                ...(invite ? { invite } : {}),
              });
              history.replaceState({}, "", "/");
              done();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {create && (
            <Field label="Your name">
              <input
                name="name"
                required
                maxLength={80}
                autoComplete="given-name"
              />
            </Field>
          )}
          <Field
            label="Username"
            hint={create ? "3–30 letters, numbers or underscores." : undefined}
          >
            <input
              name="username"
              required
              pattern="[A-Za-z0-9_]{3,30}"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Password"
            hint={create ? "At least 12 characters." : undefined}
          >
            <input
              name="password"
              type="password"
              minLength={create ? 12 : 1}
              maxLength={72}
              autoComplete={create ? "new-password" : "current-password"}
              required
            />
          </Field>
          {create && !invite && (
            <Field label="Kitchen name">
              <input
                name="householdName"
                defaultValue="Our kitchen"
                maxLength={80}
              />
            </Field>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy
              ? create ? "Creating account…" : "Signing in…"
              : create ? "Create my account" : "Sign in"}
          </button>
        </form>
        {!invite && (
          <div className="auth-help">
            {canCreate ? (
              <button
                className="text-button"
                onClick={() => setCreate(!create)}
              >
                {create ? "I already have an account" : "Set up our kitchen"}
              </button>
            ) : (
              <>
                <p>Use an invitation to join a household.</p>
                <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
                  Owner setup with ChatGPT
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
function App() {
  const k = useKitchen(),
    { data } = k;
  const [tab, setTab] = useState("plan"),
    [modal, setModal] = useState<{
      kind: string;
      item?: Entity;
      date?: string;
    } | null>(null),
    [store, setStore] = useState("all"),
    [search, setSearch] = useState(""),
    [recipeView, setRecipeView] = useState("saved"),
    [start, setStart] = useState(today()),
    [person, setPerson] = useState("all"),
    [text, setText] = useState(
      () => sessionStorage.getItem("onion-draft") ?? "",
    ),
    [processing, setProcessing] = useState(false),
    [captureError, setCaptureError] = useState(""),
    [connecting, setConnecting] = useState(false),
    [signIn, setSignIn] = useState<Entity | null>(null),
    [copyMessage, setCopyMessage] = useState(""),
    [reply, setReply] = useState<AssistantReply | null>(null),
    [replyExpanded, setReplyExpanded] = useState(false),
    [invite, setInvite] = useState(""),
    [invitations, setInvitations] = useState<any[]>([]),
    [settings, setSettings] = useState("household");
  const { status: ai, retry: retryStatus, confirmed: confirmStatus } = useAssistantStatus(data?.user.id);
  const commandPending = useRef(false);
  const retryCommand = useRef<{ id: string; text: string; context: string } | null>(null);
  const replySection = useRef<HTMLElement>(null);
  const activeTab = useRef(tab);
  activeTab.current = tab;
  const voice = useVoiceInput(transcript => {
    const instruction = [text.trim(), transcript].filter(Boolean).join(" ");
    setText(instruction);
    void command(instruction);
  }, setCaptureError);
  const { recording, transcribing } = voice;
  const connectingRef = useRef(false);
  const codeInput = useRef<HTMLInputElement | null>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const storesSection = useRef<HTMLElement>(null);
  useEffect(() => {
    if (
      data &&
      !data.members.find((m) => m.id === data.user.id)?.profile.onboarded
    )
      setModal({ kind: "profile" });
  }, [data?.user.id]);
  useEffect(() => {
    setReplyExpanded(false);
    window.scrollTo(0, 0);
  }, [tab]);
  useEffect(() => {
    sessionStorage.setItem("onion-draft", text);
  }, [text]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          reg.onupdatefound = () => {
            if (navigator.serviceWorker.controller)
              k.setNotice(
                "An update is ready. Close and reopen the app when you’re done.",
              );
          };
        })
        .catch(() => {});
  }, []);
  useEffect(() => {
    if (data?.user.role === "owner" && tab === "settings")
      api("/api/invites")
        .then(setInvitations)
        .catch(() => {});
  }, [data?.user.id, tab, invite]);
  useEffect(() => {
    if (replyExpanded && replySection.current) {
      replySection.current.focus({ preventScroll: true });
      replySection.current.scrollIntoView({ block: "start" });
    }
  }, [reply, replyExpanded]);
  async function act(actions: Operation["actions"]) {
    try {
      await k.act(actions);
    } catch (e: any) {
      k.setError(e.message);
      throw e;
    }
  }
  const quietly = (actions: Operation["actions"]) =>
    act(actions).catch(() => {});
  if (!k.loaded)
    return (
      <main className="auth-loading">
        <p className="auth-wordmark">Half an <em>Onion</em></p>
        <p role="status">Loading your kitchen…</p>
      </main>
    );
  if (!data) return <Login done={() => k.refresh()} />;
  const { state, members, user } = data,
    e = state.entities,
    stores = entries(e.stores),
    allMeals = entries(e.meals),
    items = entries(e.items),
    recipes = entries(e.recipes).filter(r => ["ours", "saved"].includes(r.collection)),
    memories = entries(e.memories).filter((m) => !m.forgotten),
    pantry = entries(e.pantry);
  const models = ai.models ?? [];
  const connectionKnown = typeof ai.connected === "boolean";
  const checkingConnection = !connectionKnown && !ai.error && ai.available !== false;
  const canConnect = user.role === "owner" && ai.connected === false;
  const selectedModel = models.find(m => m.model === state.model);
  const thinkingLevels = selectedModel?.supportedReasoningEfforts ?? [];
  const pending = items.filter((i) => i.status === "confirmed").length;
  const days = Array.from({ length: 7 }, (_, i) => plusDays(start, i));
  const meals = allMeals
    .filter(
      (m) =>
        m.date >= start &&
        m.date <= days[6] &&
        (person === "all" || m.participants.includes(person)),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        ["breakfast", "lunch", "dinner", "snack", "custom"].indexOf(
          a.mealType,
        ) -
          ["breakfast", "lunch", "dinner", "snack", "custom"].indexOf(
            b.mealType,
          ),
    );
  const openDays = days.filter(date => !meals.some(meal => meal.date === date)).length;
  const weekLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  }).formatRange(new Date(start + "T12:00:00"), new Date(days[6] + "T12:00:00"));
  const suggestions = pendingSuggestions(e.suggestions);
  const latest = [...state.activity]
    .reverse()
    .find((a) => a.actor === user.id && !a.undone);
  const open = (kind: string, item?: Entity, date?: string) =>
    setModal({ kind, item, date });
  const saveRecipe = async (recipe: Entity) => {
    await act([{ type: "save-recipe", kind: "recipes", id: recipe.id, expected: { version: recipe.version } }]);
    setModal(null);
    setRecipeView("saved");
  };
  const dismissRecipe = async (recipe: Entity) => {
    await act([{ type: "dismiss-recipe", kind: "recipes", id: recipe.id, expected: { version: recipe.version } }]);
    setModal(null);
  };
  function insertPrompt(prompt: string) {
    setText(prompt);
    draftInput.current?.focus();
  }
  function manageStores() {
    setSettings("household");
    requestAnimationFrame(() => {
      storesSection.current?.focus({ preventScroll: true });
      storesSection.current?.scrollIntoView({ block: "start" });
    });
  }
  async function command(instruction: string) {
    if (!instruction.trim() || commandPending.current) return;
    if (instruction.trim().length > 4000) {
      setCaptureError("Shorten the instruction to 4,000 characters and send it again.");
      return;
    }
    commandPending.current = true;
    setProcessing(true);
    k.setNotice("");
    setCaptureError("");
    const request = retryCommand.current?.text === instruction ? retryCommand.current : {
      id: crypto.randomUUID(), text: instruction, context: sessionStorage.getItem("onion-context") ?? "",
    };
    retryCommand.current = request;
    try {
      const result = await api("/api/ai/command", request);
      retryCommand.current = null;
      if (result.context) sessionStorage.setItem("onion-context", result.context);
      if (result.completed || result.context) setText(draft => draft === instruction ? "" : draft);
      if (result.operationId) await k.refresh();
      setReply({
        prompt: instruction, message: result.message, operationId: result.operationId,
        relatedSuggestionIds: result.relatedSuggestionIds,
      });
    } catch (error: any) {
      setReply({ prompt: instruction, message: error.message, failed: true });
    } finally {
      const draft = draftInput.current;
      const editingNext = document.activeElement === draft && !!draft?.value && draft.value !== instruction;
      setReplyExpanded(!editingNext && tab === activeTab.current && !document.querySelector("dialog[open]"));
      setProcessing(false);
      commandPending.current = false;
    }
  }
  async function connectAssistant() {
    // Closing the dialog only hides it; keep the active request and code.
    if (connectingRef.current) {
      if (signIn) setModal({ kind: "ai-connect" });
      return;
    }
    connectingRef.current = true;
    setConnecting(true);
    setCopyMessage("");
    try {
      if (ai.connected) {
        confirmStatus(await api("/api/ai/disconnect", {}));
        return;
      }
      const response = await fetch("/api/ai/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(210000),
      });
      if (!response.ok)
        throw new Error(
          ((await response.json()) as any).error ?? "Could not start sign-in.",
        );
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let connected = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.error) throw new Error(event.error);
          if (event.auth_url) {
            const url = new URL(event.auth_url);
            if (
              url.protocol !== "https:" ||
              !["auth.openai.com", "chatgpt.com"].includes(url.hostname)
            )
              throw new Error("Unexpected sign-in URL.");
            setSignIn({
              ...event,
              id: "connection",
              version: 1,
              actor: user.id,
              updatedAt: Date.now(),
            });
            setModal({ kind: "ai-connect" });
          }
          if (event.connected) {
            connected = true;
            confirmStatus(event);
            setSignIn(null);
            setModal((current) =>
              current?.kind === "ai-connect" ? null : current,
            );
            k.setNotice("ChatGPT connected. Your assistant is ready.");
          }
        }
        if (done) break;
      }
      if (!connected)
        throw new Error("Sign-in did not finish. Connect ChatGPT again.");
    } catch (error: any) {
      setSignIn(null);
      k.setError(error.message ?? "Sign-in failed. Try again.");
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  }
  async function copySignInCode() {
    if (!signIn?.user_code) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(signIn.user_code);
      setCopyMessage("Code copied.");
    } catch {
      codeInput.current?.focus();
      codeInput.current?.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
        /* Keep the code selected for manual copying. */
      }
      setCopyMessage(
        copied
          ? "Code copied."
          : "Code selected. Use Copy on your keyboard or touch menu.",
      );
    }
  }
  return (
    <div className="app">
      <a className="skip-link" href="#kitchen-content">Skip to content</a>
      <header className="masthead">
        <div className="masthead-inner">
          <div className="wordmark">
            <Onion size={34} />
            <span>Half an <i>Onion</i></span>
          </div>
          <nav className="main-nav" aria-label="Kitchen">
            {[
              ["plan", "Week"],
              ["shop", "Shopping"],
              ["recipes", "Recipes"],
              ["pantry", "Pantry"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {
                  setTab(id);
                  if (!window.matchMedia("(max-width: 680px)").matches) setSearch("");
                }}
              >
                {label}
                {id === "shop" && pending > 0 && <span className="count">{pending}</span>}
              </button>
            ))}
          </nav>
          <button
            className="kitchen-account"
            aria-label={`Settings for ${data.household.name}, signed in as ${user.name}`}
            aria-current={tab === "settings" ? "page" : undefined}
            onClick={() => setTab("settings")}
          >
            <span className="account-letter" aria-hidden="true">{user.name.slice(0, 1)}</span>
            <span className="account-copy">
              <strong>{data.household.name}</strong>
              <span>{user.name} · Settings</span>
            </span>
          </button>
        </div>
      </header>
      <div className="workspace">
        <main className="content" id="kitchen-content" tabIndex={-1}>
          {(!k.online || k.pending.length > 0) && (
            <p className="sync-state" role="status">
              {!k.online
                ? "Offline · changes saved on this device"
                : `${k.pending.length} changes waiting to sync`}
            </p>
          )}
          {(k.error || k.needsLogin) && (
            <div className="banner error" role="alert">
              <span>
                {k.needsLogin
                  ? "Sign in again to sync. Your offline changes are saved on this device."
                  : k.error}
              </span>
              {k.needsLogin ? (
                <button onClick={() => open("signin")}>Sign in</button>
              ) : (
                <button
                  className="icon"
                  onClick={() => k.setError("")}
                  aria-label="Dismiss error"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {k.pending
            .filter((p) => p.error)
            .map((p) => (
              <div className="banner error" key={p.id}>
                <span>{p.error} This local change was not applied.</span>
                <button onClick={() => k.discard(p.id)}>
                  Discard local change
                </button>
              </div>
            ))}
          {tab === "plan" && (
            <>
              <div className="planner-cover">
                <div className="planner-title">
                  <h1>Meal planner</h1>
                  <p>
                    {meals.length} {meals.length === 1 ? "meal" : "meals"} planned · {openDays} {openDays === 1 ? "day" : "days"} open
                  </p>
                  <button
                    className="primary"
                    onClick={() => open("meals", undefined, today())}
                  >
                    Add a meal
                  </button>
                </div>
                <img src="/onion-still-life.webp" alt="" width="1536" height="1024" />
              </div>
              <div className="week-toolbar">
                <h2 aria-live="polite">{weekLabel}</h2>
                <div className="date-switch">
                  <button
                    className="icon"
                    aria-label="Previous week"
                    onClick={() => setStart(plusDays(start, -7))}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    className="icon"
                    aria-label="Next week"
                    onClick={() => setStart(plusDays(start, 7))}
                  >
                    <ChevronRight size={20} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setStart(today())}
                  >
                    Today
                  </button>
                </div>
                <select
                  aria-label="Filter by person"
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                >
                  <option value="all">Everyone</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="week-grid">
                {days.map((date) => {
                  const daily = meals.filter((m) => m.date === date);
                  return (
                    <section
                      className={"day " + (date === today() ? "today" : "")}
                      key={date}
                      aria-label={new Date(
                        date + "T12:00:00",
                      ).toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    >
                      <header>
                        <span className="day-name">
                          {new Date(date + "T12:00:00").toLocaleDateString(
                            "en-GB",
                            { weekday: "short" },
                          )}
                          {date === today() && <small>Today</small>}
                        </span>
                        <b>{Number(date.slice(-2))}</b>
                      </header>
                      <div className="day-meals">
                        {daily.map((m) => (
                          <button
                            className={
                              "meal " +
                              (m.kind === "eating-out" ? "outing" : "")
                            }
                            key={m.id}
                            onClick={() => open("meals", m)}
                          >
                            <small>
                              {titleCase(m.mealType)}
                              {m.time ? " · " + m.time : ""}
                            </small>
                            <strong>{m.name}</strong>
                            {m.components.length > 0 && (
                              <span className="components">
                                {m.components
                                  .map((c: any) => c.name)
                                  .join(" + ")}
                              </span>
                            )}
                            <span className="meal-people">
                              {m.participants.length === members.length
                                ? "Everyone"
                                : m.participants
                                    .map(
                                      (p: string) =>
                                        members.find((x) => x.id === p)?.name,
                                    )
                                    .join(", ")}
                            </span>
                            {m.cooked && <span className="cooked">Cooked</span>}
                          </button>
                        ))}
                        <button
                          className="open-day"
                          aria-label={"Add meal on " + date}
                          onClick={() => open("meals", undefined, date)}
                        >
                          Add meal
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
              {suggestions.length > 0 && (
                <section className="ideas">
                  <div className="section-heading">
                    <h2>Meal ideas</h2>
                  </div>
                  <div className="suggestion-grid">
                    {suggestions.map((s) => (
                      <article key={s.id}>
                        <small className="idea-kind">{s.kind === "restaurant" ? "Eating out" : s.kind === "meal" ? "Meal idea" : "Cook at home"}</small>
                        {e.recipes[s.recipeId] ? <button className="idea-title" onClick={() => open("recipe-detail", e.recipes[s.recipeId])}><h3>{s.name}</h3></button> : <h3>{s.name}</h3>}
                        {s.location && <p>{s.location}</p>}
                        {s.reason && <p>{s.reason}</p>}
                        {s.totalMinutes > 0 && (s.kind ?? "recipe") === "recipe" && <small>{s.totalMinutes} min</small>}
                        {s.url && <a className="source-link" href={s.url} target="_blank" rel="noreferrer">Website</a>}
                        <div className="actions">
                          <button
                            onClick={() =>
                              quietly([
                                {
                                  type: "accept",
                                  kind: "suggestions",
                                  id: s.id,
                                  expected: { version: s.version },
                                  data: { date: s.date ?? today() },
                                },
                              ])
                            }
                          >
                            {s.kind === "restaurant" ? "Plan visit" : "Plan this"}
                          </button>
                          {e.recipes[s.recipeId]?.collection === "suggested" && <button onClick={() => saveRecipe(e.recipes[s.recipeId]).catch(() => {})}>Save recipe</button>}
                          <button
                            className="text-button"
                            onClick={() =>
                              quietly([
                                {
                                  type: "dismiss",
                                  kind: "suggestions",
                                  id: s.id,
                                },
                              ])
                            }
                          >
                            Not now
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {tab === "shop" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Shopping</h1>
                </div>
                <button className="secondary" onClick={() => open("stores")}>
                  Add a store
                </button>
              </div>
              <div className="shopping-layout">
                <div className="shopping-list">
                  <div className="store-filter" role="group" aria-label="Filter by store">
                    <button
                      aria-pressed={store === "all"}
                      onClick={() => setStore("all")}
                    >
                      All stores
                    </button>
                    {stores.map((s) => (
                      <button
                        key={s.id}
                        aria-pressed={store === s.id}
                        onClick={() => setStore(s.id)}
                      >
                        <span>{s.name}</span>
                        {s.locality && <small>{s.locality}</small>}
                      </button>
                    ))}
                  </div>
                  <form
                    className="quick-add"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const d = Object.fromEntries(new FormData(form));
                      try {
                        await act([
                          {
                            type: "put",
                            kind: "items",
                            id: crypto.randomUUID(),
                            data: {
                              name: String(d.name),
                              quantity: d.quantity ? Number(d.quantity) : null,
                              unit: d.unit,
                              storeId: store === "all" ? "any" : store,
                            },
                          },
                        ]);
                        form.reset();
                      } catch {}
                    }}
                  >
                    <input
                      name="name"
                      placeholder="Add an item"
                      aria-label="Grocery name"
                      required
                      maxLength={180}
                    />
                    <input
                      className="qty"
                      name="quantity"
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder="Qty"
                      aria-label="Quantity"
                    />
                    <select name="unit" aria-label="Unit">
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {u || "unit"}
                        </option>
                      ))}
                    </select>
                    <button className="primary">Add</button>
                  </form>
                  {stores
                    .filter((s) => store === "all" || store === s.id)
                    .map((s) => {
                      const list = items.filter(
                        (i) =>
                          i.storeId === s.id &&
                          ["confirmed", "proposed", "purchased"].includes(
                            i.status,
                          ) &&
                          !(
                            i.status === "proposed" &&
                            i.expiresOn &&
                            i.expiresOn < today()
                          ),
                      );
                      if (!list.length) return null;
                      return (
                        <section className="shopping-group" key={s.id}>
                          <div className="section-heading">
                            <h2>
                              {s.name}
                              <small>{s.locality}</small>
                            </h2>
                            <span className="muted">
                              {list.filter((i) => i.status === "confirmed").length}{" "}
                              to get
                            </span>
                          </div>
                          {["confirmed", "proposed", "purchased"].map((status) => {
                            const group = list.filter((i) => i.status === status);
                            return (
                              group.length > 0 && (
                                <div
                                  key={status}
                                  className={
                                    status === "proposed" ? "proposal-group" : ""
                                  }
                                >
                                  {status === "proposed" && (
                                    <p className="proposal-label">
                                      Suggested · awaiting approval
                                    </p>
                                  )}
                                  {status === "purchased" && (
                                    <p className="purchased-label">Purchased</p>
                                  )}
                                  {group.map((i) => (
                                    <div
                                      className={"item-row " + status}
                                      key={i.id}
                                    >
                                      {status !== "proposed" && (
                                        <button
                                          className={
                                            "checkbox " +
                                            (status === "purchased"
                                              ? "checked"
                                              : "")
                                          }
                                          aria-pressed={status === "purchased"}
                                          aria-label={
                                            (status === "purchased"
                                              ? "Unmark "
                                              : "Mark purchased ") + i.name
                                          }
                                          onClick={() =>
                                            quietly([
                                              {
                                                type: "purchase",
                                                kind: "items",
                                                id: i.id,
                                                expected: { status: i.status },
                                                data: {
                                                  purchased: status !== "purchased",
                                                },
                                              },
                                            ])
                                          }
                                        >
                                          {status === "purchased" && (
                                            <Check size={16} />
                                          )}
                                        </button>
                                      )}
                                      <button
                                        className="item-name"
                                        onClick={() => open("items", i)}
                                      >
                                        <strong>
                                          {i.name}
                                          {i.brand && <small> · {i.brand}</small>}
                                        </strong>
                                        {i.variant && <span>{i.variant}</span>}
                                        {status === "proposed" && (
                                          <span>
                                            {i.notes || "From your meal plan"}
                                          </span>
                                        )}
                                        {i.offerId && e.offers[i.offerId] && (
                                          <span>
                                            {activeOffer(e.offers[i.offerId])
                                              ? e.offers[i.offerId].terms
                                              : "Offer ended · item kept"}
                                          </span>
                                        )}
                                      </button>
                                      <span className="quantity">
                                        {i.quantity ?? ""} {i.unit}
                                      </span>
                                      {status === "proposed" ? (
                                        <div className="proposal-actions">
                                          <button
                                            onClick={() =>
                                              quietly([
                                                {
                                                  type: "accept",
                                                  kind: "items",
                                                  id: i.id,
                                                },
                                              ])
                                            }
                                          >
                                            Add to list
                                          </button>
                                          <button
                                            className="text-button"
                                            aria-label={
                                              "Dismiss suggestion " + i.name
                                            }
                                            onClick={() =>
                                              quietly([
                                                {
                                                  type: "dismiss",
                                                  kind: "items",
                                                  id: i.id,
                                                },
                                              ])
                                            }
                                          >
                                            Dismiss
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          className="text-button edit-item"
                                          aria-label={"Edit " + i.name}
                                          onClick={() => open("items", i)}
                                        >
                                          Edit
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )
                            );
                          })}
                        </section>
                      );
                    })}
                  {!items.some(
                    (i) =>
                      (store === "all" || i.storeId === store) &&
                      ["confirmed", "proposed", "purchased"].includes(i.status) &&
                      !(i.status === "proposed" && i.expiresOn && i.expiresOn < today()),
                  ) && <Empty title="No items on your list." />}
                </div>
                <aside className="offers-block" aria-labelledby="store-offers-heading">
                  <div className="section-heading">
                    <h2 id="store-offers-heading">Store offers</h2>
                  </div>
                  {entries(e.offers)
                    .filter(
                      (o) =>
                        activeOffer(o) &&
                        stores.some((s) => s.chain === o.retailer),
                    )
                    .map((o) => (
                      <div className="offer-row" key={o.id}>
                        <div>
                          <strong>{o.name}</strong>
                          <p>
                            {o.terms} · {o.retailer}
                          </p>
                          <small>
                            {o.start} — {o.end}
                            {o.loyalty ? " · " + o.loyalty : ""}
                            {o.activation ? " · " + o.activation : ""}
                          </small>
                        </div>
                        <a href={o.sourceUrl} target="_blank" rel="noreferrer">
                          Source
                        </a>
                        <button
                          onClick={() =>
                            quietly([
                              {
                                type: "put",
                                kind: "items",
                                id: crypto.randomUUID(),
                                data: {
                                  name: o.name,
                                  variant: o.variant,
                                  storeId:
                                    stores.find((s) => s.chain === o.retailer)
                                      ?.id ?? "any",
                                  offerId: o.id,
                                  notes: o.terms,
                                },
                              },
                            ])
                          }
                        >
                          Add to list
                        </button>
                      </div>
                    ))}
                  {!entries(e.offers).some((o) =>
                    activeOffer(o) && stores.some((s) => s.chain === o.retailer),
                  ) && <p className="muted">No current offers.</p>}
                  <details>
                    <summary>Offer sources and updates</summary>
                    {!stores.some((s) => s.discovery && Object.hasOwn(retailerRules, s.chain)) && (
                      <p className="source-empty">No stores have automatic offers enabled.</p>
                    )}
                    {Object.entries(retailerRules)
                      .filter(([chain]) =>
                        stores.some((s) => s.chain === chain && s.discovery),
                      )
                      .map(([chain, rule]) => (
                        <div className="source-status" key={chain}>
                          <strong>{rule.name}</strong>
                          <p>
                            {rule.publication} ·{" "}
                            {rule.confidence.replace("-", " ")}
                          </p>
                          <small>
                            {state.offerJobs[chain]
                              ? state.offerJobs[chain].status +
                                " · checked " +
                                new Date(
                                  state.offerJobs[chain].checkedAt,
                                ).toLocaleString("en-GB", {
                                  timeZone: "Europe/Amsterdam",
                                })
                              : "Waiting for the first scheduled collection"}
                          </small>
                          <a href={rule.source} target="_blank" rel="noreferrer">
                            Schedule evidence
                          </a>
                        </div>
                      ))}
                  </details>
                </aside>
              </div>
            </>
          )}
          {tab === "recipes" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Recipes</h1>
                </div>
                <button className="primary" onClick={() => open("recipes")}>
                  Save a recipe
                </button>
              </div>
              <RecipeLibrary saved={recipes} suggestions={suggestedRecipes(state)} view={recipeView} setView={setRecipeView}
                search={search} setSearch={setSearch} open={r => open("recipe-detail", r)}
                save={r => { saveRecipe(r).catch(() => {}); }} dismiss={r => { dismissRecipe(r).catch(() => {}); }} />
            </>
          )}
          {tab === "pantry" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Pantry</h1>
                </div>
                <button className="primary" onClick={() => open("pantry")}>
                  Add a staple
                </button>
              </div>
              <div className="pantry-list">
                {pantry.length ? (
                  pantry.map((p) => (
                    <div className="pantry-row" key={p.id}>
                      <button
                        className="item-name"
                        onClick={() => open("pantry", p)}
                      >
                        <strong>{p.name}</strong>
                        <span>
                          {p.confirmedAt
                            ? "Checked " +
                              new Date(p.confirmedAt).toLocaleDateString(
                                "en-GB",
                                { month: "short", day: "numeric" },
                              )
                            : "Usual staple · availability unknown"}
                        </span>
                      </button>
                      <div className="stock-control" role="group" aria-label={"Stock of " + p.name}>
                        {["have", "low", "out", "usual"].map((status) => (
                          <button
                            key={status}
                            aria-pressed={p.state === status}
                            onClick={() =>
                              quietly([
                                {
                                  type: "patch",
                                  kind: "pantry",
                                  id: p.id,
                                  expected: { state: p.state },
                                  data: {
                                    state: status,
                                    confirmedAt:
                                      status === "usual" ? null : Date.now(),
                                  },
                                },
                              ])
                            }
                          >
                            {titleCase(status)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty title="No pantry items." />
                )}
                <p className="quiet-note">
                  “Have” confirms stock for 3 days. “Usual” records a regular purchase without confirming stock.
                </p>
              </div>
            </>
          )}
          {tab === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Settings</h1>
                </div>
              </div>
              <div className="settings-layout">
                <nav className="settings-menu" aria-label="Settings sections">
                  {["household", "preferences", "assistant", "data"].map((s) => (
                    <button
                      aria-current={settings === s ? "page" : undefined}
                      key={s}
                      onClick={() => setSettings(s)}
                    >
                      {titleCase(s)}
                    </button>
                  ))}
                </nav>
                <div className="settings-body">
                  {settings === "household" && (
                    <>
                      <section className="settings-section">
                        <h2>Members</h2>
                        {members.map((m) => (
                          <div className="member-row" key={m.id}>
                            <div>
                              <strong>{m.name}</strong>
                              <small>
                                {titleCase(m.profile.diet)}
                                {m.role === "owner" ? " · Owner" : ""}
                              </small>
                            </div>
                            {m.id === user.id && (
                              <button onClick={() => open("profile")}>
                                My profile
                              </button>
                            )}
                          </div>
                        ))}
                        {user.role === "owner" && (
                          <div className="invite-box">
                            <div>
                              <strong>Invite a member</strong>
                              <p>The link works once and expires in 48 hours.</p>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  setInvite((await api("/api/invites", {})).url);
                                } catch (e: any) {
                                  k.setError(e.message);
                                }
                              }}
                            >
                              Create invite
                            </button>
                            {invite && (
                              <div className="invite-link">
                                <Field label="Share this invitation">
                                  <input
                                    readOnly
                                    value={invite}
                                    onFocus={(e) => e.target.select()}
                                  />
                                </Field>
                                <button
                                  onClick={() =>
                                    navigator.clipboard
                                      .writeText(invite)
                                      .then(() => k.setNotice("Invitation copied"))
                                  }
                                >
                                  Copy link
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {user.role === "owner" &&
                          invitations
                            .filter(
                              (i) =>
                                !i.revoked &&
                                !i.used_by &&
                                i.expires_at > Date.now(),
                            )
                            .map((i) => (
                              <div className="setting-row" key={i.hash}>
                                <small>
                                  Invitation · expires{" "}
                                  {new Date(i.expires_at).toLocaleDateString(
                                    "en-GB",
                                  )}
                                </small>
                                <button
                                  onClick={async () => {
                                    try {
                                      await api("/api/invites", { revoke: i.hash });
                                      setInvitations(await api("/api/invites"));
                                      setInvite("");
                                    } catch (e: any) {
                                      k.setError(e.message);
                                    }
                                  }}
                                >
                                  Revoke
                                </button>
                              </div>
                            ))}
                      </section>
                      <section
                        className="settings-section store-settings"
                        ref={storesSection}
                        tabIndex={-1}
                        aria-labelledby="stores-heading"
                      >
                        <div className="section-heading">
                          <h2 id="stores-heading">Stores</h2>
                          <button onClick={() => open("stores")}>Add store</button>
                        </div>
                        {stores
                          .filter((s) => s.id !== "any")
                          .map((s) => (
                            <div className="setting-row" key={s.id}>
                              <div>
                                <strong>{s.name}</strong>
                                <small>
                                  {s.locality || s.chain}
                                  {s.name.toLowerCase().includes("bahar")
                                    ? " · Shopping only"
                                    : s.discovery
                                      ? " · Offer discovery enabled"
                                      : ""}
                                </small>
                              </div>
                              <button onClick={() => open("stores", s)}>
                                Edit
                              </button>
                            </div>
                          ))}
                      </section>
                      <section className="settings-section">
                        <h2>Your account</h2>
                        <div className="setting-row">
                          <span>@{user.username}</span>
                          <button onClick={() => open("password")}>
                            Change password
                          </button>
                        </div>
                        <button
                          className="text-button"
                          onClick={async () => {
                            if (
                              k.pending.length &&
                              !confirm(
                                "Some changes are waiting to sync. Signing out removes them from this device. Continue?",
                              )
                            )
                              return;
                            await api("/api/auth/logout", {});
                            await clearLocal();
                            location.reload();
                          }}
                        >
                          Sign out
                        </button>
                      </section>
                    </>
                  )}
                  {settings === "preferences" && (
                    <section className="settings-section">
                      <div className="section-heading">
                        <h2>Preferences</h2>
                        <button onClick={() => open("memories")}>
                          Add preference
                        </button>
                      </div>
                      <p className="muted">Manage allergies in your profile.</p>
                      {memories.length ? (
                        memories.map((m) => (
                          <div className="memory-row" key={m.id}>
                            <div>
                              <strong>{m.fact}</strong>
                              <small>
                                {m.scope === "household"
                                  ? "Household"
                                  : members.find((p) => p.id === m.scope)
                                      ?.name}{" "}
                                ·{" "}
                                {m.kind === "explicit"
                                  ? "You told us"
                                  : "Tentative pattern"}
                                {m.provenance ? " · " + m.provenance : ""}
                              </small>
                            </div>
                            <button onClick={() => open("memories", m)}>
                              Edit
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                quietly([
                                  { type: "forget", kind: "memories", id: m.id },
                                ])
                              }
                            >
                              Forget
                            </button>
                          </div>
                        ))
                      ) : (
                        <Empty title="No saved preferences." />
                      )}
                    </section>
                  )}
                  {settings === "assistant" && (
                    <section className="settings-section">
                      <h2>Assistant</h2>
                      <div className="setting-row">
                        <div>
                          <strong>
                            {connectionKnown
                              ? ai.connected ? "ChatGPT connected" : "ChatGPT not connected"
                              : ai.busy ? "Assistant is busy" : checkingConnection ? "Checking connection…" : "Connection unavailable"}
                          </strong>
                          {ai.error && <small>{ai.error}</small>}
                        </div>
                        {!checkingConnection && !connectionKnown && (
                          <button onClick={retryStatus}>Check again</button>
                        )}
                        {user.role === "owner" && (connectionKnown || connecting || ai.login_pending) && (
                          <button
                            disabled={connecting && !signIn}
                            onClick={connectAssistant}
                          >
                            {connecting
                              ? signIn
                                ? "Show sign-in code"
                                : "Starting sign-in…"
                              : ai.connected
                                ? "Disconnect"
                                : ai.login_pending
                                  ? "Resume sign-in"
                                  : "Connect ChatGPT"}
                          </button>
                        )}
                      </div>
                      <div className="model-fields">
                        <Field label="Model">
                          <select
                            value={state.model}
                            disabled={user.role !== "owner" || !models.length}
                            onChange={(event) => {
                              const next = models.find(m => m.model === event.target.value);
                              if (!next) return;
                              const reasoning = next.supportedReasoningEfforts.some(r => r.reasoningEffort === state.reasoning)
                                ? state.reasoning : next.defaultReasoningEffort;
                              quietly([{ type: "settings", data: { model: next.model, reasoning } }]);
                            }}
                          >
                            {!selectedModel && <option value={state.model}>
                              {state.model}{models.length ? " (unavailable)" : ""}
                            </option>}
                            {models.map(m => (
                              <option key={m.model} value={m.model}>
                                {m.displayName || m.model}{m.model === DEFAULT_MODEL ? " (default)" : ""}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Thinking">
                          <select
                            value={state.reasoning}
                            disabled={user.role !== "owner" || !thinkingLevels.length}
                            onChange={(event) =>
                              quietly([
                                {
                                  type: "settings",
                                  data: {
                                    model: state.model,
                                    reasoning: event.target.value,
                                  },
                                },
                              ])
                            }
                          >
                            {!thinkingLevels.some(r => r.reasoningEffort === state.reasoning) && (
                              <option value={state.reasoning}>
                                {titleCase(state.reasoning)}{thinkingLevels.length ? " (unavailable)" : ""}
                              </option>
                            )}
                            {thinkingLevels.map(r => (
                              <option
                                key={r.reasoningEffort}
                                value={r.reasoningEffort}
                              >
                                {titleCase(r.reasoningEffort)}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <div className="setting-row">
                        <div>
                          <strong>Voice input</strong>
                          <small>
                            {ai.transcription
                              ? "Stop recording to transcribe and send."
                              : checkingConnection ? "Checking availability…" : "Transcription unavailable"}
                          </small>
                        </div>
                      </div>
                      <p className="fine voice-retention">Recordings are deleted after transcription.</p>
                      <ScheduleStatus
                        configured={ai.schedules}
                        connected={ai.connected}
                        stores={stores}
                        offerJobs={state.offerJobs}
                        onManageStores={manageStores}
                      />
                    </section>
                  )}
                  {settings === "data" && (
                    <>
                      <section className="settings-section">
                        <h2>Data</h2>
                        <div className="setting-row">
                          <div>
                            <strong>Export data</strong>
                            <small>
                              Meals, recipes, lists, pantry and preferences.
                            </small>
                          </div>
                          <a className="button" href="/api/export" download>
                            Export JSON
                          </a>
                        </div>
                        <div className="setting-row">
                          <div>
                            <strong>Recent activity</strong>
                            <small>
                              Kept for 30 days. Clearing it keeps your preferences.
                            </small>
                          </div>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  "Clear recent activity and undo history for the household?",
                                )
                              )
                                quietly([{ type: "clear-history" }]);
                            }}
                          >
                            Clear history
                          </button>
                        </div>
                        {user.role === "owner" && (
                          <button
                            className="danger text-button"
                            onClick={() => open("delete-household")}
                          >
                            Delete household data
                          </button>
                        )}
                      </section>
                      <section className="settings-section">
                        <h2>Install app</h2>
                        <p className="muted">
                          iPhone: Safari → Share → Add to Home Screen.
                          <br />
                          Android: Chrome → menu → Install app.
                        </p>
                        <p className="fine">
                          Saved shopping and planning work offline after your first
                          sign-in. Sign out to clear this device’s copy.
                        </p>
                      </section>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          {reply && replyExpanded && (
            <section className="assistant-reply" id="assistant-reply" tabIndex={-1} aria-labelledby="reply-title" ref={replySection}>
              <div className="reply-header">
                <h2 id="reply-title">{reply.failed ? "Couldn’t complete request" : "Assistant reply"}</h2>
                <button className="text-button" onClick={() => { setReplyExpanded(false); draftInput.current?.focus(); }}>Hide reply</button>
              </div>
              <ReplyContent reply={reply} activity={state.activity.find(a => a.id === reply.operationId && a.actor === user.id)}
                state={state} openRecipe={recipe => open("recipe-detail", recipe)}
                openShopping={() => { setStore("all"); setTab("shop"); setReplyExpanded(false); }}
                undo={latest && latest.id === reply.operationId ? () => quietly([{ type: "undo", id: latest.id }]) : undefined}
              />
            </section>
          )}
        </main>
        <footer className="workspace-footer">
          <div className="capture-wrap">
            {k.notice && (
              <div className="toast" role="status">
                <span>{k.notice}</span>
                {latest && (
                  <button
                    onClick={() => quietly([{ type: "undo", id: latest.id }])}
                  >
                    Undo
                  </button>
                )}
                <button
                  className="icon"
                  aria-label="Dismiss status"
                  onClick={() => k.setNotice("")}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="assistant-bar">
              <h2>Kitchen assistant</h2>
              <span className="sr-only" role="status">{processing ? "Waiting for the assistant" : reply ? "Assistant reply available" : ""}</span>
              {reply && !replyExpanded && <button className="text-button connect-link" onClick={() => setReplyExpanded(true)}>View reply</button>}
              {canConnect && <button
                className="text-button connect-link"
                onClick={() => {
                  setTab("settings");
                  setSettings("assistant");
                }}
              >Connect ChatGPT</button>}
            </div>
            <div className={"capture " + (recording ? "recording" : "")}>
              <button
                className="mic"
                aria-label={
                  recording ? "Stop and send recording" : "Record an instruction"
                }
                onClick={() => {
                  setCaptureError("");
                  if (recording || ai.transcription) void voice.toggle();
                  else setCaptureError("Voice transcription is unavailable. You can type your instruction.");
                }}
                disabled={processing || transcribing || voice.phase === "starting" || (checkingConnection && !ai.transcription)}
              >
                {recording ? <Square size={18} /> : <Mic size={21} />}
              </button>
              <div className="capture-draft">
                <div className="capture-draft-size" aria-hidden="true">
                  {text}{" "}
                </div>
                <textarea
                  ref={draftInput}
                  rows={1}
                  aria-label="Ask the assistant"
                  placeholder={
                    recording
                      ? "Listening… stop to send"
                      : transcribing
                        ? "Transcribing…"
                        : processing ? "Working on your request…" : "Ask the kitchen assistant…"
                  }
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (voice.phase === "idle") void command(text);
                    }
                  }}
                />
              </div>
              <button
                className="send"
                aria-label="Send instruction"
                disabled={!text.trim() || processing || voice.phase !== "idle"}
                onClick={() => void command(text)}
              >
                {processing ? (
                  <span className="processing-dot" />
                ) : (
                  <ArrowRight size={20} />
                )}
              </button>
            </div>
            {tab === "plan" && (
              <div
                className="capture-prompts"
                role="group"
                aria-label="Suggested prompts"
              >
                <button
                  type="button"
                  onClick={() =>
                    insertPrompt(
                      `Suggest groceries for the meals planned from ${start} through ${days[6]}. Add them as shopping list suggestions for review.`,
                    )
                  }
                >
                  Suggest groceries
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertPrompt(
                      "Suggest three meals for the gaps this week, using our recipes and preferences.",
                    )
                  }
                >
                  Suggest meals
                </button>
              </div>
            )}
            {captureError && <p className="capture-hint error" role="alert">{captureError}</p>}
            {(recording || transcribing || voice.phase === "starting") && (
              <p className="capture-hint" role="status">
                {recording ? "Stop to send · 60 seconds max" : transcribing ? "Transcribing…" : "Waiting for microphone…"}
              </p>
            )}
          </div>
        </footer>
      </div>
      {modal && (
        <Modal
          title={
            modal.kind === "recipe-detail"
              ? modal.item!.name
              : modal.kind === "profile"
                ? "Your profile"
                : modal.kind === "signin"
                  ? "Sign in to sync"
                  : modal.kind === "ai-connect"
                    ? "Connect your ChatGPT account"
                    : modal.kind === "delete-household"
                      ? "Delete our household"
                      : modal.kind === "password"
                        ? "Change your password"
                        : (modal.item ? "Edit " : "Add ") +
                          (
                            {
                              meals: "a meal",
                              items: "a grocery",
                              recipes: "a recipe",
                              stores: "a store",
                              pantry: "a staple",
                              memories: "a preference",
                            } as any
                          )[modal.kind]
          }
          close={() => setModal(null)}
        >
          {modal.kind === "signin" ? (
            <Login
              embedded
              done={() => {
                setModal(null);
                k.refresh();
              }}
            />
          ) : modal.kind === "recipe-detail" ? (
            <RecipeDetail
              recipe={modal.item!}
              save={() => { saveRecipe(modal.item!).catch(() => {}); }}
              dismiss={() => { dismissRecipe(modal.item!).catch(() => {}); }}
              close={() => setModal(null)}
              edit={() => open("recipes", modal.item)}
              variation={() =>
                open("recipes", {
                  ...modal.item!,
                  id: "",
                  origin: "variation",
                  parentId: modal.item!.id,
                  name: modal.item!.name + " · our version",
                })
              }
              plan={() => {
                const r = modal.item!;
                open("meals", {
                  id: "",
                  actor: user.id,
                  version: 0,
                  updatedAt: Date.now(),
                  name: r.name,
                  date: today(),
                  mealType: "dinner",
                  servings: members.length,
                  participants: members.map((m) => m.id),
                  components: [
                    {
                      name: r.name,
                      recipeId: r.id,
                      servings: members.length,
                      participants: members.map((m) => m.id),
                    },
                  ],
                } as Entity);
              }}
            />
          ) : modal.kind === "ai-connect" ? (
            <div className="form-body">
              {signIn ? (
                <>
                  <p>
                    Open the official sign-in page and enter this one-time code.
                  </p>
                  <div className="device-code-row">
                    <input
                      ref={codeInput}
                      className="device-code"
                      aria-label="One-time sign-in code"
                      readOnly
                      value={signIn.user_code}
                      onFocus={(event) => event.target.select()}
                    />
                    <button type="button" onClick={copySignInCode}>
                      Copy code
                    </button>
                  </div>
                  <p className="muted" role="status" aria-live="polite">
                    {copyMessage || "Waiting for you to authorize in ChatGPT…"}
                  </p>
                  <a
                    className="button primary"
                    target="_blank"
                    rel="noreferrer"
                    href={signIn.auth_url}
                  >
                    Continue to ChatGPT
                  </a>
                  <p className="muted">
                    Code expires in a few minutes. You can close this dialog and
                    resume sign-in.
                  </p>
                  <button onClick={() => setModal(null)}>Hide for now</button>
                </>
              ) : (
                <>
                  <p>Sign-in ended. Try again.</p>
                  <button disabled={connecting} onClick={connectAssistant}>
                    {connecting ? "Starting sign-in…" : "Try sign-in again"}
                  </button>
                </>
              )}
            </div>
          ) : modal.kind === "recipes" && !modal.item ? (
            <RecipeCreator
              voiceEnabled={!!ai.transcription}
              saved={async (recipe) => {
                await k.refresh();
                setTab("recipes");
                setRecipeView("saved");
                setModal(
                  recipe ? { kind: "recipe-detail", item: recipe } : null,
                );
                k.setNotice("Recipe saved.");
              }}
              manual={
                <Editor
                  kind="recipes"
                  data={data}
                  save={async (actions) => {
                    await act(actions);
                    setModal(null);
                  }}
                  close={() => setModal(null)}
                  refresh={k.refresh}
                />
              }
            />
          ) : (
            <Editor
              kind={modal.kind}
              item={modal.item}
              date={modal.date}
              data={data}
              save={async (actions) => {
                await act(actions);
                setModal(null);
              }}
              close={() => setModal(null)}
              refresh={k.refresh}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function RecipeDetail({
  recipe: r,
  edit,
  variation,
  plan,
  save,
  dismiss,
}: {
  recipe: Entity;
  save: () => void;
  dismiss: () => void;
  edit: () => void;
  variation: () => void;
  plan: () => void;
  close: () => void;
}) {
  const [servings, setServings] = useState(r.servings);
  return (
    <div className="form-body recipe-detail">
      {(r.totalMinutes > 0 || r.collection === "saved" || r.collection === "suggested") && (
        <div className="recipe-detail-meta">
          {r.totalMinutes > 0 && <span>{r.totalMinutes} min</span>}
          {r.collection === "saved" && <span>Saved from AI</span>}
          {r.collection === "suggested" && <span>AI suggestion</span>}
        </div>
      )}
      {r.prerequisites && (
        <p className="recipe-prerequisites">
          <strong>Before you start</strong>
          {r.prerequisites}
        </p>
      )}
      <div className="section-heading">
        <h3>Ingredients</h3>
        <label>
          Servings{" "}
          <input
            className="qty"
            type="number"
            min="1"
            max="100"
            value={servings}
            onChange={(e) => setServings(Number(e.target.value) || 1)}
          />
        </label>
      </div>
      {r.ingredients.length ? (
        <ul className="recipe-ingredients">
          {r.ingredients.map((i: any, n: number) => (
            <li className="ingredient-detail" key={n}>
              <span>
                {i.name}
                {i.variant ? " · " + i.variant : ""}
              </span>
              <strong>
                {i.quantity === null
                  ? ""
                  : Number(
                      ((i.quantity * servings) / r.servings).toFixed(2),
                    )}{" "}
                {i.unit}
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No ingredient detail saved.</p>
      )}
      {r.steps.length > 0 && (
        <>
          <h3>Method</h3>
          <ol className="recipe-steps">
            {r.steps.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {r.notes && <p>{r.notes}</p>}
      {r.sourceUrl && (
        <a
          href={r.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="source-link"
        >
          Original recipe
        </a>
      )}
      <div className="form-footer">
        <button className="primary" onClick={plan}>
          Plan this
        </button>
        {["suggested", "dismissed"].includes(r.collection) ? <>
          <button onClick={save}>Save recipe</button>
          <button className="text-button" onClick={dismiss}>Not now</button>
        </> : <button onClick={edit}>Edit</button>}
        <button className="text-button" onClick={variation}>
          Save a variation
        </button>
      </div>
    </div>
  );
}
function Editor({
  kind,
  item,
  date,
  data,
  save,
  close,
  refresh,
}: {
  kind: string;
  item?: Entity;
  date?: string;
  data: Snapshot;
  save: (actions: Operation["actions"]) => Promise<void>;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [participants, setParticipants] = useState<string[]>(
      item?.participants ?? data.members.map((m) => m.id),
    ),
    [ingredients, setIngredients] = useState<any[]>(item?.ingredients ?? []),
    [components, setComponents] = useState<any[]>(item?.components ?? []);
  const me = data.members.find((m) => m.id === data.user.id)!;
  const [diet, setDiet] = useState(me.profile.diet);
  const [profile, setProfile] = useState(me.profile);
  const [chain, setChain] = useState(item?.chain ?? "Custom");
  const stores = entries(data.state.entities.stores),
    recipes = entries(data.state.entities.recipes).filter(r => ["ours", "saved"].includes(r.collection) || item?.components?.some((c: any) => c.recipeId === r.id));
  const ids = data.members.map((m) => m.id);
  const input = (
    name: string,
    label: string,
    type = "text",
    def: any = "",
    props: any = {},
  ) => (
    <Field label={label}>
      <input
        type={type}
        name={name}
        defaultValue={item?.[name] ?? def}
        {...props}
      />
    </Field>
  );
  const notes = (
    <Field label="Notes (optional)">
      <textarea
        name="notes"
        rows={3}
        defaultValue={item?.notes ?? ""}
        maxLength={3000}
      />
    </Field>
  );
  const people = (selected: string[], update: (v: string[]) => void) => (
    <div className="people-picker">
      {data.members.map((m) => (
        <label key={m.id}>
          <input
            type="checkbox"
            checked={selected.includes(m.id)}
            onChange={(e) =>
              update(
                e.target.checked
                  ? [...selected, m.id]
                  : selected.filter((p) => p !== m.id),
              )
            }
          />
          {m.name}
        </label>
      ))}
    </div>
  );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
          const d = Object.fromEntries(
            new FormData(event.currentTarget),
          ) as Record<string, any>;
          let record: any;
          if (kind === "profile") {
            await api("/api/profile", {
              name: d.name,
              profile: {
                ...profile,
                onboarded: true,
                diet,
                eggs: d.eggs,
                dairy: d.dairy,
                allergies: d.allergies
                  .split(",")
                  .map((v: string) => v.trim())
                  .filter(Boolean),
                exclusions: d.exclusions
                  .split(",")
                  .map((v: string) => v.trim())
                  .filter(Boolean),
                preferences: d.preferences,
                sharedVegetarian: d.sharedVegetarian === "on",
              },
            });
            await refresh();
            close();
            return;
          }
          if (kind === "password") {
            await api("/api/password", d);
            close();
            return;
          }
          if (kind === "delete-household") {
            await api("/api/household/delete", d);
            await clearLocal();
            location.reload();
            return;
          }
          if (kind === "meals")
            record = {
              ...d,
              participants,
              servings: item?.id ? item.servings : participants.length,
              components,
              cooked: d.cooked === "on",
            };
          if (kind === "items" || kind === "pantry")
            record = {
              ...d,
              quantity: d.quantity ? Number(d.quantity) : null,
              ...(kind === "pantry"
                ? { confirmedAt: d.state === "usual" ? null : Date.now() }
                : {}),
            };
          if (kind === "recipes")
            record = {
              ...d,
              servings: Number(d.servings),
              activeMinutes: Number(d.activeMinutes),
              totalMinutes: Number(d.totalMinutes),
              ingredients,
              steps: d.steps
                .split("\n")
                .map((s: string) => s.trim())
                .filter(Boolean),
              tags: d.tags
                .split(",")
                .map((s: string) => s.trim().toLowerCase())
                .filter(Boolean),
              origin: item?.origin ?? (d.sourceUrl ? "link" : "manual"),
              parentId: item?.parentId ?? "",
            };
          if (kind === "stores")
            record = { ...d, chain, discovery: d.discovery === "on" };
          if (kind === "memories")
            record = {
              ...d,
              kind: "explicit",
              provenance: "Added by " + data.user.name,
              confidence: 1,
            };
          if (item?.id) {
            const changed = Object.fromEntries(
              Object.entries(record).filter(
                ([key, value]) =>
                  JSON.stringify(item[key]) !== JSON.stringify(value),
              ),
            );
            const expected = Object.fromEntries(
              Object.keys(changed).map((key) => [key, item[key]]),
            );
            await save([
              {
                type: "patch",
                kind: kind as Kind,
                id: item.id,
                data: changed,
                expected,
              },
            ]);
          } else
            await save([
              {
                type: "put",
                kind: kind as Kind,
                id: crypto.randomUUID(),
                data: record,
              },
            ]);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-body">
        {["meals", "items", "recipes", "stores", "pantry"].includes(kind) &&
          input(
            "name",
            kind === "meals"
              ? "Meal name"
              : kind === "stores"
                ? "Branch / store name"
                : "Name",
            "text",
            "",
            { required: true, maxLength: 180, autoFocus: true, "data-initial-focus": true },
          )}
        {kind === "meals" && (
          <>
            <div className="form-grid">
              {input("date", "Day", "date", date ?? today(), {
                required: true,
              })}
              <Field label="Meal type">
                <select
                  name="mealType"
                  defaultValue={item?.mealType ?? "dinner"}
                >
                  {["breakfast", "lunch", "dinner", "snack", "custom"].map(
                    (x) => (
                      <option key={x} value={x}>
                        {titleCase(x)}
                      </option>
                    ),
                  )}
                </select>
              </Field>
            </div>
            <fieldset className="people-field">
              <legend>Who’s eating?</legend>
              {people(participants, setParticipants)}
            </fieldset>
            <Field label="What’s the plan?">
              <select name="kind" defaultValue={item?.kind ?? "cooking"}>
                <option value="cooking">Cooking at home</option>
                <option value="leftovers">Leftovers</option>
                <option value="eating-out">Eating out</option>
                <option value="undecided">Undecided</option>
              </select>
            </Field>
            <details className="component-editor" open={components.length > 0}>
              <summary>Dishes & individual additions</summary>
              <p className="fine">
                Assign each component’s portions once, even when shared.
              </p>
              {components.map((c, i) => (
                <div className="component" key={i}>
                  <div className="form-grid">
                    <Field label="Dish">
                      <input
                        value={c.name}
                        onChange={(e) =>
                          setComponents(
                            components.map((x, j) =>
                              i === j ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                        required
                      />
                    </Field>
                    <Field label="Recipe">
                      <select
                        value={c.recipeId}
                        onChange={(e) => {
                          const r = recipes.find(
                            (r) => r.id === e.target.value,
                          );
                          setComponents(
                            components.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    recipeId: r?.id ?? "",
                                    name: r?.name ?? x.name,
                                  }
                                : x,
                            ),
                          );
                        }}
                      >
                        <option value="">No recipe</option>
                        {recipes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {people(c.participants, (v) =>
                    setComponents(
                      components.map((x, j) =>
                        i === j ? { ...x, participants: v } : x,
                      ),
                    ),
                  )}
                  <Field label="Servings for this component">
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={c.servings}
                      onChange={(e) =>
                        setComponents(
                          components.map((x, j) =>
                            i === j
                              ? { ...x, servings: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() =>
                      setComponents(components.filter((_, j) => j !== i))
                    }
                  >
                    Remove dish
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setComponents([
                    ...components,
                    {
                      name: "",
                      recipeId: "",
                      participants: [...participants],
                      servings: participants.length,
                    },
                  ])
                }
              >
                Add a component
              </button>
            </details>
            {notes}
            <div className="form-grid">
              <label className="check-label">
                <input
                  name="cooked"
                  type="checkbox"
                  defaultChecked={item?.cooked}
                />
                We cooked this
              </label>
              <Field label="Optional feedback">
                <select name="feedback" defaultValue={item?.feedback ?? ""}>
                  <option value="">No feedback yet</option>
                  <option value="liked">We liked it</option>
                  <option value="not-for-us">Not for us</option>
                </select>
              </Field>
            </div>
          </>
        )}
        {["items", "pantry"].includes(kind) && (
          <>
            <div className="form-grid">
              {input("quantity", "Quantity", "number", "", {
                min: 0.01,
                step: "any",
              })}
              <Field label="Unit">
                <select name="unit" defaultValue={item?.unit ?? ""}>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u || "Not specified"}
                    </option>
                  ))}
                </select>
              </Field>
              {input("brand", "Brand (optional)")}
              {input("variant", "Variant (optional)")}
            </div>
            <Field label="Store">
              <select name="storeId" defaultValue={item?.storeId ?? "any"}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.locality ? " · " + s.locality : ""}
                  </option>
                ))}
              </select>
            </Field>
            {kind === "pantry" && (
              <Field label="Availability">
                <select name="state" defaultValue={item?.state ?? "usual"}>
                  {["usual", "have", "low", "out"].map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {notes}
          </>
        )}
        {kind === "recipes" && (
          <>
            <div className="form-grid">
              {input("servings", "Base servings", "number", 2, {
                min: 0.5,
                step: 0.5,
                required: true,
              })}
              {input("activeMinutes", "Active minutes", "number", 0, {
                min: 0,
                max: 2880,
              })}
              {input("totalMinutes", "Total minutes", "number", 0, {
                min: 0,
                max: 10080,
              })}
              {input("sourceUrl", "Source link (optional)", "url")}
            </div>
            <Field
              label="Dietary tags"
              hint="Add only verified tags. Separate them with commas."
            >
              <input name="tags" defaultValue={item?.tags?.join(", ") ?? ""} />
            </Field>
            <h3>Ingredients</h3>
            {ingredients.map((ing, i) => (
              <div className="ingredient-editor" key={i}>
                <input
                  aria-label={"Ingredient " + (i + 1)}
                  placeholder="Ingredient"
                  required
                  value={ing.name}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((x, j) =>
                        i === j ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  className="qty"
                  aria-label={"Quantity " + (i + 1)}
                  type="number"
                  step="any"
                  min="0.01"
                  value={ing.quantity ?? ""}
                  placeholder="Qty"
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((x, j) =>
                        i === j
                          ? {
                              ...x,
                              quantity: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : x,
                      ),
                    )
                  }
                />
                <select
                  aria-label={"Unit " + (i + 1)}
                  value={ing.unit}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((x, j) =>
                        i === j ? { ...x, unit: e.target.value } : x,
                      ),
                    )
                  }
                >
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u || "unit"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon"
                  aria-label={"Remove ingredient " + (i + 1)}
                  onClick={() =>
                    setIngredients(ingredients.filter((_, j) => j !== i))
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setIngredients([
                  ...ingredients,
                  {
                    name: "",
                    quantity: null,
                    unit: "",
                    brand: "",
                    variant: "",
                    storeId: "any",
                  },
                ])
              }
            >
              Add ingredient
            </button>
            <Field label="Steps" hint="One step per line.">
              <textarea
                name="steps"
                rows={5}
                defaultValue={item?.steps?.join("\n") ?? ""}
              />
            </Field>
            {input("prerequisites", "Before you start (optional)", "text", "", {
              placeholder: "Soak overnight, marinate for 2 hours…",
            })}
            {notes}
          </>
        )}
        {kind === "stores" && (
          <>
            <Field label="Retailer">
              <select value={chain} onChange={(e) => setChain(e.target.value)}>
                {["Custom", "AH", "ALDI", "Jumbo", "PLUS"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            {input("locality", "Locality / postcode", "text", "", {
              placeholder: "Delft · 2611",
            })}
            {input("website", "Website (optional)", "url")}
            <label className="check-label">
              <input
                type="checkbox"
                name="discovery"
                defaultChecked={item?.discovery ?? chain !== "Custom"}
              />
              Include in automatic offer discovery
            </label>
            <details>
              <summary>Find a branch</summary>
              <p className="fine">
                Use the retailer’s store finder, then enter the branch above.
              </p>
              <div className="store-links">
                {[
                  ["AH", "https://www.ah.nl/winkels"],
                  ["ALDI", "https://www.aldi.nl/winkels.html"],
                  ["Jumbo", "https://www.jumbo.com/winkels"],
                  ["PLUS", "https://www.plus.nl/supermarkten"],
                ].map(([n, url]) => (
                  <a key={n} href={url} target="_blank" rel="noreferrer">
                    {n}
                  </a>
                ))}
              </div>
            </details>
          </>
        )}
        {kind === "memories" && (
          <>
            {input("fact", "Remember this", "text", "", {
              required: true,
              maxLength: 180,
            })}
            <Field label="Applies to">
              <select name="scope" defaultValue={item?.scope ?? "household"}>
                <option value="household">Our household</option>
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="fine">
              Use your dietary profile for allergies and firm exclusions.
            </p>
          </>
        )}
        {kind === "profile" && (
          <>
            <div className="form-grid">
              {input("name", "Display name", "text", data.user.name, {
                required: true,
                maxLength: 80,
              })}
              <Field label="Diet">
                <select
                  value={diet}
                  onChange={(e) => setDiet(e.target.value as any)}
                >
                  {["unspecified", "vegetarian", "nonvegetarian", "vegan"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {titleCase(v)}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Eggs">
                <select name="eggs" defaultValue={profile.eggs}>
                  <option value="ask">Ask me</option>
                  <option value="yes">I eat eggs</option>
                  <option value="no">No eggs</option>
                </select>
              </Field>
              <Field label="Dairy">
                <select name="dairy" defaultValue={profile.dairy}>
                  <option value="ask">Ask me</option>
                  <option value="yes">I eat dairy</option>
                  <option value="no">No dairy</option>
                </select>
              </Field>
            </div>
            <Field
              label="Allergies"
              hint="Separate allergies with commas. They always apply to meal suggestions."
            >
              <input
                name="allergies"
                defaultValue={profile.allergies.join(", ")}
              />
            </Field>
            <Field label="Other exclusions">
              <input
                name="exclusions"
                defaultValue={profile.exclusions.join(", ")}
              />
            </Field>
            <Field label="Likes, dislikes, equipment or time preferences">
              <textarea
                name="preferences"
                defaultValue={profile.preferences}
                rows={3}
              />
            </Field>
            <label className="check-label">
              <input
                name="sharedVegetarian"
                type="checkbox"
                defaultChecked={profile.sharedVegetarian}
              />
              Usually vegetarian when we eat together
            </label>
          </>
        )}
        {kind === "password" && (
          <>
            <Field label="Current password">
              <input
                name="current"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
              />
            </Field>
            <p className="fine">
              Changing your password signs out your other devices.
            </p>
          </>
        )}
        {kind === "delete-household" && (
          <>
            <p>
              This deletes meals, recipes, lists, preferences and all household
              accounts. Export a copy first. This cannot be undone.
            </p>
            <Field label="Type DELETE MY HOUSEHOLD">
              <input name="confirm" required pattern="DELETE MY HOUSEHOLD" />
            </Field>
            <Field label="Your password">
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="form-footer">
        <button
          className={
            kind === "delete-household" ? "primary danger-bg" : "primary"
          }
          disabled={busy}
        >
          {busy
            ? "Saving…"
            : kind === "delete-household"
              ? "Delete household"
              : "Save"}
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
        {item?.id &&
          ["meals", "items", "recipes", "stores", "pantry"].includes(kind) && (
            <button
              type="button"
              className="text-button danger push-right"
              onClick={async () => {
                try {
                  await save([
                    { type: "remove", kind: kind as Kind, id: item.id },
                  ]);
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Remove
            </button>
          )}
      </div>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
