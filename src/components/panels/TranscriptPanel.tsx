import React from "react";
import { AudioLines, Loader2, Sparkles } from "lucide-react";
import { BusyState, NormalizedTranscript, ProjectDetail } from "../../types";
import { formatTime } from "../../utils/format";
import { EmptyState } from "../common/EmptyState";
import { invoke } from "../../apiBridge";

interface TranscriptPanelProps {
  detail: ProjectDetail;
  transcript: NormalizedTranscript | null;
  busy: BusyState;
  canTranscribe: boolean;
  transcriptionEngine: string;
  isGeneratingCopy: boolean;
  isRefiningTranscript: boolean;
  transcriptionProgress?: { percentage: number; message: string } | null;
  onOpenCopyModal: () => void;
  onRefineTranscript: () => Promise<void>;
  onCancelTranscription: () => Promise<void>;
  onTranscribe: () => Promise<void>;
}

export function TranscriptPanel({
  detail,
  transcript,
  busy,
  canTranscribe,
  transcriptionEngine,
  isGeneratingCopy,
  isRefiningTranscript,
  transcriptionProgress,
  onOpenCopyModal,
  onRefineTranscript,
  onCancelTranscription,
  onTranscribe,
}: TranscriptPanelProps) {
  return (
    <section className="panel transcript-panel">
      <div className="panel-heading">
        <div>
          <h3>Transcript</h3>
          <p>{transcript ? `${transcript.segments.length} segments (haz clic para editar texto)` : "No transcript"}</p>
        </div>
        <div className="button-pair">
          {detail?.transcript && (
            <>
              <button
                type="button"
                className="icon-button"
                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                onClick={onOpenCopyModal}
                disabled={isGeneratingCopy || busy !== "idle"}
                title="Generar copy persuasivo, hooks, CTA y hashtags para redes sociales"
              >
                <Sparkles size={13} color="var(--accent-primary)" />
                <span>Generar Copy con IA</span>
              </button>
              <button
                type="button"
                className="icon-button"
                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                onClick={onRefineTranscript}
                disabled={isRefiningTranscript || busy !== "idle"}
                title="Corregir ortografía, tildes y jerga gamer preservando los timestamps"
              >
                {isRefiningTranscript ? <Loader2 className="spin" size={13} /> : <Sparkles size={13} />}
                <span>{isRefiningTranscript ? "Puliendo..." : "Pulir con IA"}</span>
              </button>
            </>
          )}
          {busy === "transcribe" ? (
            <button
              className="btn-cancel"
              onClick={onCancelTranscription}
              style={{
                background: "#ef4444",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.4rem 0.8rem",
                borderRadius: "6px"
              }}
              title="Detener transcripción y liberar recursos"
            >
              <Loader2 className="spin" size={14} />
              Cancelar Transcripción
            </button>
          ) : (
            <button onClick={onTranscribe} disabled={busy !== "idle" || !canTranscribe}>
              <AudioLines size={16} />
              Transcribe
            </button>
          )}
        </div>
      </div>

      {(busy === "transcribe" || isRefiningTranscript) && (
        <div style={{ padding: "0.6rem 1rem", background: "rgba(99, 102, 241, 0.06)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", fontSize: "0.78rem" }}>
            <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
              {transcriptionProgress?.message || (isRefiningTranscript ? "Puliendo transcripción con IA..." : "Transcribiendo con Whisper...")}
            </span>
            <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>
              {transcriptionProgress?.percentage ?? 0}%
            </span>
          </div>
          <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, transcriptionProgress?.percentage ?? 0))}%`,
                height: "100%",
                background: "linear-gradient(90deg, #6366f1 0%, #10b981 100%)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {!canTranscribe && (
        <div className="api-warning">
          {transcriptionEngine === "local"
            ? `Local Whisper (Python package 'openai-whisper') no está instalado o faltan modelos. Ejecuta 'pip3 install openai-whisper'.`
            : "Falta la API Key de Deepgram. La transcripción no funcionará hasta configurarla en Ajustes."}
        </div>
      )}

      <div className="transcript-list">
        {transcript?.segments.map((segment, index) => (
          <article key={`${segment.start}-${index}`} className="segment-row">
            <span>{formatTime(segment.start)}</span>
            <p
              contentEditable
              suppressContentEditableWarning
              title="Haz clic para editar este texto"
              style={{ cursor: "text", outline: "none", borderRadius: "4px", padding: "2px 4px" }}
              onBlur={(e) => {
                const newText = e.currentTarget.textContent || "";
                if (newText !== segment.text) {
                  void invoke("update_transcript_segment", {
                    projectId: detail.project.id,
                    index,
                    text: newText
                  });
                }
              }}
            >
              {segment.text}
            </p>
          </article>
        )) ?? <EmptyState icon={<AudioLines size={28} />} label="Transcript pending" />}
      </div>
    </section>
  );
}
