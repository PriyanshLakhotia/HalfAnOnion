import { useEffect, useRef, useState } from "react";

export function useVoiceInput(
  onText: (text: string) => void,
  onError: (message: string) => void,
) {
  const [phase, setPhase] = useState<
    "idle" | "starting" | "recording" | "transcribing"
  >("idle");
  const active = useRef(false);
  const mounted = useRef(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      request.current?.abort();
      const r = recorder.current;
      if (r) {
        r.onstop = null;
        if (r.state === "recording") r.stop();
        r.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  async function toggle() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    if (active.current) return;
    active.current = true;
    setPhase("starting");
    let stream: MediaStream | undefined;
    function finish() {
      clearTimeout(timer.current);
      stream?.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      active.current = false;
      if (mounted.current) setPhase("idle");
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Voice is unavailable in this browser. You can type instead.",
        );
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType)
        throw new Error("This browser cannot record a supported audio format.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        finish();
        return;
      }

      const r = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.current = r;
      r.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      r.onerror = () => {
        r.onstop = null;
        finish();
        if (mounted.current)
          handlers.current.onError("Recording was interrupted. Try again.");
      };
      r.onstop = async () => {
        clearTimeout(timer.current);
        stream?.getTracks().forEach((track) => track.stop());
        if (!mounted.current) return;
        setPhase("transcribing");
        const controller = new AbortController();
        request.current = controller;
        const deadline = setTimeout(() => controller.abort(), 125000);
        try {
          const audio = new Blob(chunks, { type: mimeType });
          if (audio.size < 300)
            throw new Error("No speech recorded. Try again.");
          const form = new FormData();
          form.append(
            "audio",
            audio,
            mimeType.includes("mp4") ? "voice.m4a" : "voice.webm",
          );
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
            signal: controller.signal,
          });
          const result = (await response.json()) as {
            text?: string;
            error?: string;
          };
          if (!response.ok)
            throw new Error(result.error || "Transcription failed.");
          if (typeof result.text !== "string" || !result.text.trim())
            throw new Error("No speech found. Try again.");
          if (mounted.current) handlers.current.onText(result.text.trim());
        } catch (error: any) {
          if (mounted.current)
            handlers.current.onError(
              error.name === "AbortError"
                ? "Transcription timed out. Try again."
                : error.message,
            );
        } finally {
          clearTimeout(deadline);
          request.current = null;
          finish();
        }
      };
      r.start();
      setPhase("recording");
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    } catch (error: any) {
      finish();
      if (mounted.current)
        handlers.current.onError(
          error.name === "NotAllowedError"
            ? "Microphone access was declined. You can type instead."
            : error.message,
        );
    }
  }
  return {
    phase,
    recording: phase === "recording",
    transcribing: phase === "transcribing",
    toggle,
  };
}
