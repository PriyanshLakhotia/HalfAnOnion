import { useEffect, useRef, useState } from "react";
export function useVoiceInput(
  onText: (text: string) => void,
  onError: (message: string) => void,
) {
  const [recording, setRecording] = useState(false),
    [transcribing, setTranscribing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null),
    mounted = useRef(true),
    starting = useRef(false);
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      request.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);
  async function toggle() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    if (starting.current) return;
    starting.current = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Voice is unavailable in this browser. You can type instead.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("This browser cannot record a supported audio format.");
      }
      const r = new MediaRecorder(stream, { mimeType }),
        chunks: BlobPart[] = [];
      recorder.current = r;
      r.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      r.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (mounted.current) {
          setRecording(false);
          handlers.current.onError("Recording was interrupted. Try again.");
        }
      };
      r.onstop = async () => {
        if (timer.current) clearTimeout(timer.current);
        stream.getTracks().forEach((track) => track.stop());
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 300) {
          handlers.current.onError("No speech recorded. Try again.");
          return;
        }
        setTranscribing(true);
        const controller = new AbortController();
        request.current = controller;
        const deadline = setTimeout(() => controller.abort(), 125000);
        try {
          const form = new FormData();
          form.append(
            "audio",
            blob,
            mimeType.includes("mp4") ? "recipe.m4a" : "recipe.webm",
          );
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
            signal: controller.signal,
          });
          const result: any = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Transcription failed.");
          if (mounted.current) handlers.current.onText(result.text);
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
          if (mounted.current) setTranscribing(false);
        }
      };
      r.start();
      setRecording(true);
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    } catch (error: any) {
      if (mounted.current)
        handlers.current.onError(
          error.name === "NotAllowedError"
            ? "Microphone access was declined. You can type instead."
            : error.message,
        );
    } finally {
      starting.current = false;
    }
  }
  return { recording, transcribing, toggle };
}
