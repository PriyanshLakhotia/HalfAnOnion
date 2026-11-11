import { useEffect, useState } from "react";
import {
  applyOperation,
  type Operation,
  type State,
  type Member,
} from "../domain/model";
export type Snapshot = {
  user: { id: string; name: string; username: string; role: string };
  household: { id: string; name: string; version: number; timezone: string };
  members: Member[];
  state: State;
};
export type Pending = {
  id: string;
  createdAt: number;
  actor: string;
  household: string;
  op: Operation;
  error?: string;
};
let db: Promise<IDBDatabase> | undefined;
function database() {
  return (db ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("half-an-onion", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("cache");
      r.result.createObjectStore("queue", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function idb<T = any>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
) {
  const d = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode),
      r = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = () => reject(tx.error);
  });
}
export async function api<T = any>(path: string, data?: any): Promise<T> {
  const response = await fetch(path, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout((path === "/api/ai/command" || path === "/api/ai/recipe") ? 195000 : 30000),
  });
  const result: any = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error ?? "Please try again."), {
      status: response.status,
    });
  return result;
}
export async function clearLocal() {
  await idb("cache", "readwrite", (s) => s.clear());
  await idb("queue", "readwrite", (s) => s.clear());
  localStorage.removeItem("onion-last-user");
  sessionStorage.removeItem("onion-context");
  sessionStorage.removeItem("onion-draft");
}
export function useKitchen() {
  const [data, setData] = useState<Snapshot | null>(null),
    [loaded, setLoaded] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [pending, setPending] = useState<Pending[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [needsLogin, setNeedsLogin] = useState(false);
  async function queues() {
    return (await idb<Pending[]>("queue", "readonly", (s) => s.getAll())).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }
  async function project(snap: Snapshot) {
    const q = (await queues()).filter(
      (x) => x.actor === snap.user.id && x.household === snap.household.id,
    );
    let state = snap.state;
    for (const p of q) {
      if (p.error) continue;
      try {
        state = applyOperation(state, p.op, snap.user.id, snap.members).state;
      } catch {}
    }
    setData({ ...snap, state });
    setPending(q);
  }
  async function refresh() {
    try {
      const snap: Snapshot = await api("/api/state");
      const previous = localStorage.getItem("onion-last-user");
      if (previous && previous !== snap.user.id) {
        await clearLocal();
      }
      localStorage.setItem("onion-last-user", snap.user.id);
      await idb("cache", "readwrite", (s) => s.put(snap, snap.user.id));
      await project(snap);
      setOnline(true);
      setNeedsLogin(false);
    } catch (e: any) {
      if (e.status === 401) {
        setNeedsLogin(true);
        if (!data) setData(null);
      } else if (!e.status) {
        setOnline(false);
        const last = localStorage.getItem("onion-last-user");
        if (last) {
          const snap = await idb<Snapshot>("cache", "readonly", (s) =>
            s.get(last),
          );
          if (snap) await project(snap);
        }
      } else setError(e.message);
    } finally {
      setLoaded(true);
    }
  }
  async function sync() {
    if (!navigator.onLine) return;
    const perform = async () => {
      const q = await queues();
      if (!q.length) {
        await refresh();
        return;
      }
      let current: Snapshot;
      try {
        current = await api("/api/state");
      } catch (e: any) {
        if (e.status === 401) setNeedsLogin(true);
        return;
      }
      for (const p of q) {
        if (
          p.actor !== current.user.id ||
          p.household !== current.household.id ||
          p.error
        )
          continue;
        try {
          await api("/api/operations", p.op);
          await idb("queue", "readwrite", (s) => s.delete(p.id));
        } catch (e: any) {
          if (
            e.status &&
            e.status !== 401 &&
            e.status !== 429 &&
            e.status < 500
          ) {
            await idb("queue", "readwrite", (s) =>
              s.put({ ...p, error: e.message }),
            );
            setError(e.message);
          } else break;
        }
      }
      await refresh();
    };
    if (navigator.locks)
      await navigator.locks.request(
        "onion-sync",
        { ifAvailable: true },
        (lock) => (lock ? perform() : Promise.resolve()),
      );
    else await perform();
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") sync();
    }, 5000);
    const on = () => {
        setOnline(true);
        sync();
      },
      off = () => setOnline(false),
      visible = () => {
        if (document.visibilityState === "visible") sync();
      };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  async function act(actions: Operation["actions"]) {
    if (!data) throw new Error("Sign in first.");
    const op = { id: crypto.randomUUID(), actions };
    applyOperation(data.state, op, data.user.id, data.members);
    const p = {
      id: op.id,
      createdAt: Date.now(),
      actor: data.user.id,
      household: data.household.id,
      op,
    };
    await idb("queue", "readwrite", (s) => s.put(p));
    setData({
      ...data,
      state: applyOperation(data.state, op, data.user.id, data.members).state,
    });
    setPending([...pending, p]);
    setNotice(
      navigator.onLine ? "Saving…" : "Saved on this device · waiting to sync",
    );
    await sync();
    const remaining = (await queues()).find((p) => p.id === op.id);
    if (remaining?.error) throw new Error(remaining.error);
    setNotice(
      remaining ? "Saved on this device · waiting to sync" : "Kitchen updated",
    );
    return op.id;
  }
  async function discard(id: string) {
    await idb("queue", "readwrite", (s) => s.delete(id));
    await refresh();
  }
  return {
    data,
    loaded,
    online,
    pending,
    error,
    setError,
    notice,
    setNotice,
    needsLogin,
    refresh,
    sync,
    act,
    discard,
  };
}
