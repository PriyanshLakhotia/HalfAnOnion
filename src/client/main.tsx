import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  ShoppingBasket,
  BookOpen,
  SlidersHorizontal,
  Plus,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Mic,
  Send,
  Undo2,
  Search,
  Leaf,
  Clock,
  Users,
  Package,
  WifiOff,
  LogOut,
  Link as LinkIcon,
  Trash2,
  Download,
  Square,
  ChevronDown,
  ExternalLink,
  Settings2,
} from "lucide-react";
import {
  today,
  plusDays,
  commitment,
  profileSchema,
  activeOffer,
  type Kind,
  type Entity,
  type Operation,
} from "../domain/model";
import { retailerRules } from "../domain/retailers";
import { api, clearLocal, useKitchen, type Snapshot } from "./store";
import "./style.css";
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
function Empty({
  icon: Icon = Leaf,
  title,
  children,
  action,
}: {
  icon?: any;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={28} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
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
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" aria-label="Close" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Login({ done }: { done: () => void }) {
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
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand">
          <Onion />
          <span>half an onion</span>
        </div>
        <div>
          <p className="eyebrow">A SHARED KITCHEN</p>
          <h1>
            Good food.
            <br />
            Less figuring
            <br />
            <em>it all out.</em>
          </h1>
          <p>
            Meals, groceries, and the things
            <br />
            that make a kitchen yours.
          </p>
        </div>
        <span className="story-foot">A little planning goes a long way.</span>
      </div>
      <div className="login-form">
        <div className="mobile-brand brand">
          <Onion />
          <span>half an onion</span>
        </div>
        <p className="eyebrow">
          {invite ? "YOU’RE INVITED" : "OUR EVERYDAY TABLE"}
        </p>
        <h2>{create ? "Make yourself at home." : "Back in the kitchen."}</h2>
        <p className="muted">
          {create
            ? "Choose a username and password. No email needed."
            : "Sign in to your shared household."}
        </p>
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
          <Field label="Username">
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
            hint={
              create
                ? "At least 12 characters. Keep it somewhere safe."
                : undefined
            }
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
            {busy ? "One moment…" : create ? "Create my account" : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>
        {!invite && (
          <p className="login-help">
            {canCreate ? (
              <button
                className="text-button"
                onClick={() => setCreate(!create)}
              >
                {create ? "I already have an account" : "Set up our kitchen"}
              </button>
            ) : (
              <>
                First time here? Use your household invitation.
                <br />
                <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
                  Owner setup with ChatGPT
                </a>
              </>
            )}
          </p>
        )}
        <p className="fine">
          No email service. No advertising. Just your kitchen.
        </p>
      </div>
    </div>
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
    [start, setStart] = useState(today()),
    [person, setPerson] = useState("all"),
    [text, setText] = useState(
      () => sessionStorage.getItem("onion-draft") ?? "",
    ),
    [processing, setProcessing] = useState(false),
    [ai, setAi] = useState<any>({ connected: false, transcription: false }),
    [recording, setRecording] = useState(false),
    [transcribing, setTranscribing] = useState(false),
    [invite, setInvite] = useState(""),
    [invitations, setInvitations] = useState<any[]>([]),
    [settings, setSettings] = useState("household");
  const recorder = useRef<MediaRecorder | null>(null);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (
      data &&
      !data.members.find((m) => m.id === data.user.id)?.profile.onboarded
    )
      setModal({ kind: "profile" });
    if (data)
      api("/api/ai/status")
        .then(setAi)
        .catch(() => {});
  }, [data?.user.id]);
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
    return () => {
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (recordTimer.current) clearTimeout(recordTimer.current);
    };
  }, []);
  useEffect(() => {
    if (data?.user.role === "owner" && tab === "settings")
      api("/api/invites")
        .then(setInvitations)
        .catch(() => {});
  }, [data?.user.id, tab, invite]);
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
      <div className="loading">
        <Onion />
        <p>Opening the kitchen…</p>
      </div>
    );
  if (!data) return <Login done={() => k.refresh()} />;
  const { state, members, user } = data,
    e = state.entities,
    stores = entries(e.stores),
    allMeals = entries(e.meals),
    items = entries(e.items),
    recipes = entries(e.recipes),
    memories = entries(e.memories).filter((m) => !m.forgotten),
    pantry = entries(e.pantry);
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
  const suggestions = entries(e.suggestions).filter(
    (s) => s.status === "proposed" && s.expiresOn >= today(),
  );
  const latest = [...state.activity]
    .reverse()
    .find((a) => a.actor === user.id && !a.undone);
  const open = (kind: string, item?: Entity, date?: string) =>
    setModal({ kind, item, date });
  async function command() {
    if (!text.trim() || processing) return;
    setProcessing(true);
    try {
      const r = await api("/api/ai/command", {
        id: crypto.randomUUID(),
        text,
        context: sessionStorage.getItem("onion-context") ?? "",
      });
      k.setNotice(r.message);
      if (r.context) sessionStorage.setItem("onion-context", r.context);
      if (r.completed) setText("");
      await k.refresh();
    } catch (e: any) {
      k.setError(e.message);
    } finally {
      setProcessing(false);
    }
  }
  async function voice() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    if (!ai.transcription) {
      k.setError(
        "Voice needs a transcription connection. Text and manual controls are ready to use.",
      );
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Recording is unavailable in this browser. Type your instruction instead.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      if (!mime) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(
          "This recording format is unsupported. Type your instruction instead.",
        );
      }
      const r = new MediaRecorder(stream, { mimeType: mime }),
        chunks: BlobPart[] = [];
      recorder.current = r;
      r.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      r.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        k.setError("Recording was interrupted. Your typed input is safe.");
      };
      r.onstop = async () => {
        if (recordTimer.current) clearTimeout(recordTimer.current);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 300) {
          k.setError("No speech recorded. Try again.");
          return;
        }
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append(
            "audio",
            blob,
            mime.includes("mp4") ? "voice.m4a" : "voice.webm",
          );
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(60000),
          });
          const result: any = await res.json();
          if (!res.ok) throw new Error(result.error);
          setText((t) => [t, result.text].filter(Boolean).join(" "));
        } catch (e: any) {
          k.setError(e.message || "Transcription failed. Try again or type.");
        } finally {
          setTranscribing(false);
        }
      };
      r.start();
      setRecording(true);
      recordTimer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    } catch (e: any) {
      k.setError(
        e.name === "NotAllowedError"
          ? "Microphone access was declined. You can still type."
          : e.message,
      );
    }
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Onion />
          <span>half an onion</span>
        </div>
        <p className="eyebrow kitchen-label">{data.household.name}</p>
        <nav>
          {[
            ["plan", "The week", CalendarDays],
            ["shop", "Shopping", ShoppingBasket],
            ["recipes", "Recipe book", BookOpen],
            ["pantry", "Pantry", Package],
          ].map(([id, label, Icon]: any) => (
            <button
              key={id}
              className={tab === id ? "nav active" : "nav"}
              onClick={() => {
                setTab(id);
                setSearch("");
              }}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "shop" && pending > 0 && (
                <span className="count">{pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="member-mark">
            <span>{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{members.length} in this kitchen</small>
            </div>
          </div>
          <button
            className={tab === "settings" ? "nav active" : "nav"}
            onClick={() => setTab("settings")}
          >
            <SlidersHorizontal size={19} />
            Kitchen settings
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="mobile-brand brand">
            <Onion size={28} />
            half an onion
          </span>
          <span className="top-note">
            A little planning. A lot less wondering.
          </span>
          <span className={"sync-state " + (!k.online ? "offline" : "")}>
            <span className="dot" />
            {!k.online
              ? "Offline"
              : k.pending.length
                ? `${k.pending.length} waiting to sync`
                : "Shared & up to date"}
          </span>
        </header>
        <main className="content">
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
              <div className="page-heading">
                <div>
                  <p className="eyebrow">OUR EVERYDAY TABLE</p>
                  <h1>A week, well fed.</h1>
                  <p className="muted">
                    Room for a plan. And a change of plan.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => open("meals", undefined, today())}
                >
                  <Plus size={18} />
                  Add a meal
                </button>
              </div>
              <div className="week-toolbar">
                <div className="date-switch">
                  <button
                    className="icon"
                    aria-label="Previous week"
                    onClick={() => setStart(plusDays(start, -7))}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <strong>
                    {new Date(start + "T12:00:00").toLocaleDateString("en-GB", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    —{" "}
                    {new Date(days[6] + "T12:00:00").toLocaleDateString(
                      "en-GB",
                      { month: "short", day: "numeric" },
                    )}
                  </strong>
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
                    >
                      <header>
                        <span>
                          {new Date(date + "T12:00:00").toLocaleDateString(
                            "en-GB",
                            { weekday: "short" },
                          )}
                        </span>
                        <b>{Number(date.slice(-2))}</b>
                        {date === today() && <i>Today</i>}
                        <button
                          className="icon day-add"
                          aria-label={"Add meal on " + date}
                          onClick={() => open("meals", undefined, date)}
                        >
                          <Plus size={16} />
                        </button>
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
                              <Users size={12} />
                              {m.participants.length === members.length
                                ? "Everyone"
                                : m.participants
                                    .map(
                                      (p: string) =>
                                        members.find((x) => x.id === p)?.name,
                                    )
                                    .join(", ")}
                            </span>
                            {m.cooked && (
                              <span className="cooked">
                                <Check size={12} />
                                Cooked
                              </span>
                            )}
                          </button>
                        ))}
                        {!daily.length && (
                          <button
                            className="open-day"
                            onClick={() => open("meals", undefined, date)}
                          >
                            Leave room
                            <br />
                            for something good.
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
              <div className="plan-foot">
                <span>{meals.length} meals planned</span>
                <button
                  className="text-button"
                  onClick={() =>
                    quietly([
                      { type: "groceries", data: { from: start, to: days[6] } },
                    ])
                  }
                >
                  <ShoppingBasket size={16} />
                  Suggest groceries for this week
                  <ArrowRight size={15} />
                </button>
              </div>
              <section className="ideas">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">A LITTLE INSPIRATION</p>
                    <h2>Something to look forward to.</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setText(
                        "Suggest three meals for the gaps this week, using our recipes and preferences.",
                      );
                      document
                        .querySelector<HTMLTextAreaElement>(".capture textarea")
                        ?.focus();
                    }}
                  >
                    Ask for ideas
                    <ArrowRight size={16} />
                  </button>
                </div>
                {suggestions.length ? (
                  <div className="suggestion-grid">
                    {suggestions.map((s) => (
                      <article key={s.id}>
                        <span className="tag">
                          {commitment(s.totalMinutes)} time commitment
                        </span>
                        <h3>{s.name}</h3>
                        <p>{s.reason}</p>
                        <small>
                          {s.activeMinutes} min active · {s.totalMinutes} min
                          total
                        </small>
                        <div className="actions">
                          <button
                            onClick={() =>
                              quietly([
                                {
                                  type: "accept",
                                  kind: "suggestions",
                                  id: s.id,
                                  data: { date: s.date ?? today() },
                                },
                              ])
                            }
                          >
                            Plan this
                            <Plus size={16} />
                          </button>
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
                ) : (
                  <div className="ideas-empty">
                    <Leaf size={26} />
                    <div>
                      <strong>Let your kitchen inspire the next meal.</strong>
                      <p>
                        {recipes.length
                          ? "Ask the assistant for a few ideas from your recipe book."
                          : "Save a favourite recipe. Good ideas start with what you love."}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setTab("recipes");
                        open("recipes");
                      }}
                    >
                      Add a favourite
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "shop" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">PICK UP WHAT MATTERS</p>
                  <h1>The shopping list.</h1>
                  <p className="muted">
                    {pending
                      ? `${pending} things to bring home.`
                      : "A clear list. A calmer shop."}
                  </p>
                </div>
                <button className="secondary" onClick={() => open("stores")}>
                  <Plus size={17} />
                  Add a store
                </button>
              </div>
              <div className="chips">
                <button
                  className={store === "all" ? "chip selected" : "chip"}
                  onClick={() => setStore("all")}
                >
                  All stores
                </button>
                {stores.map((s) => (
                  <button
                    key={s.id}
                    className={store === s.id ? "chip selected" : "chip"}
                    onClick={() => setStore(s.id)}
                  >
                    {s.name}
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
                <Plus size={20} />
                <input
                  name="name"
                  placeholder="What do we need?"
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
                                  SUGGESTED FOR YOUR MEALS · NOT ON YOUR LIST
                                  YET
                                </p>
                              )}
                              {status === "purchased" && (
                                <p className="purchased-label">
                                  Already in the basket
                                </p>
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
                                        <Plus size={14} />
                                      </button>
                                      <button
                                        className="icon"
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
                                        <X size={17} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      className="icon subtle"
                                      aria-label={"Edit " + i.name}
                                      onClick={() => open("items", i)}
                                    >
                                      <Settings2 size={16} />
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
                  ["confirmed", "proposed", "purchased"].includes(i.status),
              ) && (
                <Empty icon={ShoppingBasket} title="Nothing on the list. Yet.">
                  Add something above, or let your meal plan help.
                </Empty>
              )}
              <div className="quiet-note">
                <WifiOff size={15} />
                Your saved list works offline. Changes sync when you’re back.
              </div>
              <section className="offers-block">
                <div className="section-heading">
                  <h2>Worth a look.</h2>
                  <span className="muted">Offers from your stores</span>
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
                        <ExternalLink size={12} />
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
                        <Plus size={14} />
                      </button>
                    </div>
                  ))}
                {!entries(e.offers).some((o) => activeOffer(o)) && (
                  <p className="muted">
                    No verified offers loaded. Your shopping list is ready
                    regardless.
                  </p>
                )}
                <details>
                  <summary>Offer sources & freshness</summary>
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
              </section>
            </>
          )}
          {tab === "recipes" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">THE ONES WE COME BACK TO</p>
                  <h1>Our recipe book.</h1>
                  <p className="muted">
                    Favourites, little experiments, and your own versions.
                  </p>
                </div>
                <button className="primary" onClick={() => open("recipes")}>
                  <Plus size={18} />
                  Save a recipe
                </button>
              </div>
              <div className="search">
                <Search size={18} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a recipe or ingredient"
                  aria-label="Search recipes"
                />
              </div>
              {recipes.length ? (
                <div className="recipe-grid">
                  {recipes
                    .filter((r) =>
                      (
                        r.name +
                        " " +
                        r.ingredients.map((x: any) => x.name).join(" ")
                      )
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((r, i) => (
                      <button
                        className="recipe-card"
                        key={r.id}
                        onClick={() => open("recipe-detail", r)}
                      >
                        <div className={"recipe-art tone-" + (i % 4)}>
                          <span>{r.name.slice(0, 1)}</span>
                          <Onion size={60} />
                        </div>
                        <div className="recipe-card-body">
                          <p className="eyebrow">
                            {r.origin === "variation"
                              ? "OUR VERSION"
                              : r.sourceUrl
                                ? "SAVED FROM A LINK"
                                : "FROM OUR KITCHEN"}
                          </p>
                          <h3>{r.name}</h3>
                          <div className="recipe-meta">
                            <span>
                              <Clock size={14} />
                              {r.totalMinutes
                                ? r.totalMinutes + " min"
                                : "Time not set"}
                            </span>
                            <span>
                              {r.totalMinutes
                                ? commitment(r.totalMinutes) + " commitment"
                                : ""}
                            </span>
                          </div>
                          {r.tags.length > 0 && (
                            <div className="tags">
                              {r.tags.slice(0, 3).map((t: string) => (
                                <span key={t}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <Empty
                  icon={BookOpen}
                  title="Every kitchen has its favourites."
                  action={
                    <button onClick={() => open("recipes")}>
                      Save the first one
                      <Plus size={16} />
                    </button>
                  }
                >
                  A full recipe, a useful link, or a version you’ve made your
                  own.
                </Empty>
              )}
            </>
          )}
          {tab === "pantry" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">ALREADY AT HOME</p>
                  <h1>A little pantry check.</h1>
                  <p className="muted">
                    Keep a sense of what’s there. No counting every cumin seed.
                  </p>
                </div>
                <button className="primary" onClick={() => open("pantry")}>
                  <Plus size={18} />
                  Add a staple
                </button>
              </div>
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
                    <div className="segmented">
                      {["have", "low", "out", "usual"].map((status) => (
                        <button
                          key={status}
                          className={p.state === status ? "selected" : ""}
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
                <Empty
                  icon={Package}
                  title="Start with the staples."
                  action={
                    <button onClick={() => open("pantry")}>
                      Add a staple
                      <Plus size={16} />
                    </button>
                  }
                >
                  Rice, lentils, the spices you reach for. Add just what’s
                  useful.
                </Empty>
              )}
              <p className="quiet-note">
                “Have” is treated as recently checked for 3 days. “Usual” is a
                habit, not a stock count.
              </p>
            </>
          )}
          {tab === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">MAKE IT YOURS</p>
                  <h1>A kitchen that knows you.</h1>
                </div>
              </div>
              <div className="chips">
                {["household", "preferences", "assistant", "data"].map((s) => (
                  <button
                    className={settings === s ? "chip selected" : "chip"}
                    key={s}
                    onClick={() => setSettings(s)}
                  >
                    {titleCase(s)}
                  </button>
                ))}
              </div>
              {settings === "household" && (
                <>
                  <section className="settings-section">
                    <h2>At our table</h2>
                    {members.map((m) => (
                      <div className="member-row" key={m.id}>
                        <span className="avatar">{m.name.slice(0, 1)}</span>
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
                          <strong>A place for someone else.</strong>
                          <p>Single-use invitation. Expires after 48 hours.</p>
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
                          <LinkIcon size={16} />
                        </button>
                        {invite && (
                          <Field label="Share this invitation">
                            <input
                              readOnly
                              value={invite}
                              onFocus={(e) => e.target.select()}
                            />
                            <button
                              onClick={() =>
                                navigator.clipboard
                                  .writeText(invite)
                                  .then(() => k.setNotice("Invitation copied"))
                              }
                            >
                              Copy link
                            </button>
                          </Field>
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
                  <section className="settings-section">
                    <div className="section-heading">
                      <h2>Our stores</h2>
                      <button onClick={() => open("stores")}>
                        <Plus size={16} />
                        Add store
                      </button>
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
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </section>
                </>
              )}
              {settings === "preferences" && (
                <section className="settings-section">
                  <div className="section-heading">
                    <h2>What we remember</h2>
                    <button onClick={() => open("memories")}>
                      <Plus size={16} />
                      Add preference
                    </button>
                  </div>
                  <p className="muted">
                    Food habits and preferences. Allergies stay in your profile.
                  </p>
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
                    <Empty title="A fresh start.">
                      Tell us what you like as you go.
                    </Empty>
                  )}
                </section>
              )}
              {settings === "assistant" && (
                <section className="settings-section">
                  <h2>One household assistant</h2>
                  <div className="setting-row">
                    <div>
                      <strong>
                        {ai.connected
                          ? "ChatGPT connected"
                          : "ChatGPT not connected"}
                      </strong>
                      <small>
                        {ai.available
                          ? "Subscription connection via Codex"
                          : "Companion hosting needs setup"}
                      </small>
                    </div>
                    {user.role === "owner" && (
                      <button
                        onClick={async () => {
                          try {
                            const r = await api(
                              "/api/ai/" +
                                (ai.connected ? "disconnect" : "connect"),
                              {},
                            );
                            setAi({ ...ai, ...r });
                            if (r.auth_url)
                              open("ai-connect", {
                                ...r,
                                id: "connection",
                                version: 1,
                                actor: user.id,
                                updatedAt: Date.now(),
                              });
                          } catch (e: any) {
                            k.setError(e.message);
                          }
                        }}
                      >
                        {ai.connected ? "Disconnect" : "Connect ChatGPT"}
                      </button>
                    )}
                  </div>
                  <p className="muted">
                    Only the owner connects ChatGPT. The household uses the
                    assistant without receiving the owner’s credentials.
                  </p>
                  <Field label="Model">
                    <select
                      value={state.model}
                      onChange={(event) =>
                        quietly([
                          {
                            type: "settings",
                            data: {
                              model: event.target.value,
                              reasoning: state.reasoning,
                            },
                          },
                        ])
                      }
                    >
                      <option value={state.model}>
                        {state.model}{" "}
                        {ai.connected ? "" : "(requested default)"}
                      </option>
                      {(ai.models ?? [])
                        .filter((m: any) => m.model !== state.model)
                        .map((m: any) => (
                          <option key={m.id} value={m.model}>
                            {m.displayName ?? m.model}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Thinking">
                    <select
                      value={state.reasoning}
                      disabled={!ai.models?.length}
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
                      {(
                        ai.models?.find((m: any) => m.model === state.model)
                          ?.supportedReasoningEfforts ?? [
                          { reasoningEffort: "high" },
                        ]
                      ).map((r: any) => (
                        <option
                          key={r.reasoningEffort}
                          value={r.reasoningEffort}
                        >
                          {titleCase(r.reasoningEffort)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="setting-row">
                    <div>
                      <strong>Voice input</strong>
                      <small>
                        {ai.transcription
                          ? "API transcription available · separately billed"
                          : "Transcription key not configured"}
                      </small>
                    </div>
                    <Mic size={20} />
                  </div>
                  <p className="fine">
                    Recordings are discarded after transcription. No permanent
                    audio archive. Manual groceries, recipes and planning work
                    without AI.
                  </p>
                </section>
              )}
              {settings === "data" && (
                <>
                  <section className="settings-section">
                    <h2>Your kitchen, your data</h2>
                    <div className="setting-row">
                      <div>
                        <strong>Take a copy</strong>
                        <small>
                          Meals, recipes, lists, pantry and preferences.
                        </small>
                      </div>
                      <a className="button" href="/api/export" download>
                        <Download size={16} />
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
                    <h2>Keep it close</h2>
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
            </>
          )}
        </main>
        <div className="capture-wrap">
          {k.notice && (
            <div className="toast" role="status">
              <Check size={14} />
              <span>{k.notice}</span>
              {latest && (
                <button
                  onClick={() => quietly([{ type: "undo", id: latest.id }])}
                >
                  <Undo2 size={14} />
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
          <div className={"capture " + (recording ? "recording" : "")}>
            <button
              className="mic"
              aria-label={
                recording ? "Stop recording" : "Record an instruction"
              }
              onClick={voice}
              disabled={transcribing}
            >
              {recording ? <Square size={18} /> : <Mic size={21} />}
            </button>
            <textarea
              rows={1}
              aria-label="Tell your kitchen"
              placeholder={
                recording
                  ? "Listening… tap to stop"
                  : transcribing
                    ? "Transcribing…"
                    : "Tell your kitchen. “Paneer at Bahar, dinner for both tomorrow…”"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  command();
                }
              }}
            />
            <button
              className="send"
              aria-label="Send instruction"
              disabled={!text.trim() || processing || recording}
              onClick={command}
            >
              {processing ? (
                <span className="processing-dot" />
              ) : (
                <ArrowRight size={20} />
              )}
            </button>
          </div>
          <p className="capture-hint">
            {recording
              ? "Recording · up to 60 seconds"
              : transcribing
                ? "Audio is discarded after transcription"
                : ai.connected
                  ? "Your household assistant · English, Hindi or Hinglish"
                  : "Your household assistant · connect ChatGPT in settings"}
          </p>
        </div>
        <nav className="bottom-nav">
          {[
            ["plan", "Week", CalendarDays],
            ["shop", "Shop", ShoppingBasket],
            ["recipes", "Recipes", BookOpen],
            ["pantry", "Pantry", Package],
            ["settings", "Settings", SlidersHorizontal],
          ].map(([id, label, Icon]: any) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => setTab(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      {modal && (
        <Modal
          title={
            modal.kind === "recipe-detail"
              ? modal.item!.name
              : modal.kind === "profile"
                ? "Your place at the table"
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
              done={() => {
                setModal(null);
                k.refresh();
              }}
            />
          ) : modal.kind === "recipe-detail" ? (
            <RecipeDetail
              recipe={modal.item!}
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
              <p>
                Open the official sign-in page and enter this one-time code.
              </p>
              <strong className="device-code">{modal.item?.user_code}</strong>
              <a
                className="button primary"
                target="_blank"
                rel="noreferrer"
                href={modal.item?.auth_url}
              >
                Continue to ChatGPT
                <ExternalLink size={16} />
              </a>
              <button
                onClick={async () => {
                  const status = await api("/api/ai/status");
                  setAi(status);
                  if (status.connected) setModal(null);
                  else k.setError("Complete sign-in, then check again.");
                }}
              >
                Check connection
              </button>
            </div>
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
}: {
  recipe: Entity;
  edit: () => void;
  variation: () => void;
  plan: () => void;
  close: () => void;
}) {
  const [servings, setServings] = useState(r.servings);
  return (
    <div className="form-body recipe-detail">
      <div className="recipe-detail-meta">
        <span className="tag">
          {r.totalMinutes
            ? commitment(r.totalMinutes) + " time commitment"
            : "Time not set"}
        </span>
        <span>
          {r.activeMinutes} min active · {r.totalMinutes} min total
        </span>
      </div>
      {r.prerequisites && (
        <p className="banner">Before you start: {r.prerequisites}</p>
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
        r.ingredients.map((i: any, n: number) => (
          <div className="ingredient-detail" key={n}>
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
          </div>
        ))
      ) : (
        <p className="muted">No ingredient detail saved.</p>
      )}
      {r.steps.length > 0 && (
        <>
          <h3>Make it</h3>
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
          <ExternalLink size={14} />
        </a>
      )}
      <div className="form-footer">
        <button className="primary" onClick={plan}>
          Plan this
          <Plus size={16} />
        </button>
        <button onClick={edit}>Edit</button>
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
    recipes = entries(data.state.entities.recipes);
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
              servings: Number(d.servings),
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
              ? "What’s on the table?"
              : kind === "stores"
                ? "Branch / store name"
                : "Name",
            "text",
            "",
            { required: true, maxLength: 180, autoFocus: true },
          )}
        {kind === "meals" && (
          <>
            <div className="form-grid">
              {input("date", "Day", "date", date ?? today(), {
                required: true,
              })}
              <Field label="Meal">
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
              {input("time", "Time (optional)", "time")}
              {input(
                "servings",
                "Total servings",
                "number",
                participants.length,
                { required: true, min: 0.5, max: 100, step: 0.5 },
              )}
            </div>
            <Field label="Who’s eating?">
              {people(participants, setParticipants)}
            </Field>
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
                <Plus size={15} />
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
              hint="For example: vegetarian, vegan. Only add tags you can verify."
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
              <Plus size={15} />
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
            <p className="fine">
              Bahar Delft is shopping only. Stores remain useful without a
              website or offers.
            </p>
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
                    <ExternalLink size={12} />
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
            <div className="form-grid">
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
              hint="Separate with commas. These are hard constraints."
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
          <Check size={16} />
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
              <Trash2 size={16} />
              Remove
            </button>
          )}
      </div>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
