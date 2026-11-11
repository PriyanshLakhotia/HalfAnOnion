import React, { useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "./store";
import { useVoiceInput } from "./use-voice-input";
import {
  MAX_RECIPE_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_RECIPE_PHOTO_BYTES,
  photoBytes,
} from "../domain/recipe-capture";
import type { Entity } from "../domain/model";
type Photo = { id: string; name: string; data: string };
async function preparePhoto(file: File): Promise<Photo> {
  if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024)
    throw new Error("Choose a photo under 25 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This photo format could not be read. Try JPEG, PNG or WebP.",
    );
  }
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Photo processing is unavailable.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/jpeg", 0.86);
    if (photoBytes(data) > MAX_PHOTO_BYTES)
      data = canvas.toDataURL("image/jpeg", 0.65);
    if (photoBytes(data) > MAX_PHOTO_BYTES)
      throw new Error("This photo is too large. Try a smaller image.");
    return { id: crypto.randomUUID(), name: file.name, data };
  } finally {
    bitmap.close();
  }
}
export function RecipeCreator({
  manual,
  voiceEnabled,
  saved,
}: {
  manual: React.ReactNode;
  voiceEnabled: boolean;
  saved: (recipe: Entity | null) => Promise<void>;
}) {
  const [tab, setTab] = useState("capture"),
    [text, setText] = useState(""),
    [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [question, setQuestion] = useState("");
  const input = useRef<HTMLInputElement>(null),
    requestId = useRef<string | null>(null);
  const updateText = (value: string) => {
    setText(value.slice(0, 12000));
    requestId.current = null;
  };
  const voice = useVoiceInput((transcript) => {
    setText((current) =>
      [current, transcript].filter(Boolean).join("\n").slice(0, 12000),
    );
    requestId.current = null;
  }, setError);
  const locked = busy || uploading || voice.recording || voice.transcribing;
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setUploading(true);
    try {
      if (photos.length + files.length > MAX_RECIPE_PHOTOS)
        throw new Error("Add up to six photos.");
      const added: Photo[] = [];
      // Decode one image at a time to keep phone memory bounded.
      for (const file of Array.from(files))
        added.push(await preparePhoto(file));
      if (
        [...photos, ...added].reduce((n, p) => n + photoBytes(p.data), 0) >
        MAX_RECIPE_PHOTO_BYTES
      )
        throw new Error(
          "These photos are too large together. Use fewer photos.",
        );
      setPhotos((current) => [...current, ...added]);
      requestId.current = null;
    } catch (error: any) {
      setError(error.message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (locked) return;
    setBusy(true);
    setError("");
    setQuestion("");
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await api("/api/ai/recipe", {
        id: requestId.current,
        text,
        images: photos.map((photo) => photo.data),
      });
      if (!result.completed) {
        setQuestion(result.message);
        requestId.current = null;
      } else await saved(result.recipe ?? null);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="recipe-creator">
      <div
        className="recipe-tabs"
        role="tablist"
        aria-label="Add recipe method"
      >
        <button
          type="button"
          role="tab"
          id="capture-tab"
          aria-controls="capture-panel"
          aria-selected={tab === "capture"}
          disabled={locked}
          onClick={() => setTab("capture")}
        >
          Photos or text
        </button>
        <button
          type="button"
          role="tab"
          id="manual-tab"
          aria-controls="manual-panel"
          aria-selected={tab === "manual"}
          disabled={locked}
          onClick={() => setTab("manual")}
        >
          Manual
        </button>
      </div>
      <div
        id="capture-panel"
        role="tabpanel"
        aria-labelledby="capture-tab"
        hidden={tab !== "capture"}
      >
        <form onSubmit={create}>
          <div className="form-body recipe-capture">
            <label className="sr-only" htmlFor="recipe-input">
              Recipe text
            </label>
            <textarea
              id="recipe-input"
              autoFocus
              rows={7}
              value={text}
              maxLength={12000}
              disabled={busy}
              onChange={(e) => updateText(e.target.value)}
              placeholder="Recipe name, notes, ingredients, or instructions…"
            />
            <div className="recipe-input-actions">
              <input
                ref={input}
                type="file"
                accept="image/*"
                multiple
                hidden
                aria-label="Recipe photos"
                onChange={(e) => void upload(e.target.files)}
              />
              <button
                type="button"
                disabled={locked || photos.length >= MAX_RECIPE_PHOTOS}
                onClick={() => input.current?.click()}
              >
                {uploading ? "Preparing photos…" : "Add photos"}
              </button>
              <button
                type="button"
                disabled={
                  busy || uploading || voice.transcribing || !voiceEnabled
                }
                title={
                  !voiceEnabled
                    ? "Voice is unavailable. Check Assistant settings."
                    : undefined
                }
                onClick={() => {
                  setError("");
                  void voice.toggle();
                }}
              >
                {voice.recording
                  ? "Stop recording"
                  : voice.transcribing
                    ? "Transcribing…"
                    : "Record"}
              </button>
              {photos.length > 0 && (
                <span className="muted">
                  {photos.length} / {MAX_RECIPE_PHOTOS}
                </span>
              )}
            </div>
            {photos.length > 0 && (
              <div className="recipe-photos">
                {photos.map((photo, i) => (
                  <div key={photo.id}>
                    <img
                      src={photo.data}
                      alt={`Recipe photo ${i + 1}: ${photo.name}`}
                    />
                    <button
                      className="icon"
                      type="button"
                      disabled={locked}
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => {
                        setPhotos(photos.filter((p) => p.id !== photo.id));
                        requestId.current = null;
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {voice.recording && (
              <p className="fine" role="status">
                Recording · 60 seconds max
              </p>
            )}
            {question && (
              <p className="capture-question" role="status">
                {question}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="form-footer">
            <button
              className="primary"
              disabled={locked || (!text.trim() && !photos.length)}
            >
              {busy ? "Creating recipe…" : "Create recipe"}
            </button>
          </div>
        </form>
      </div>
      <div
        id="manual-panel"
        role="tabpanel"
        aria-labelledby="manual-tab"
        hidden={tab !== "manual"}
      >
        {manual}
      </div>
    </div>
  );
}
