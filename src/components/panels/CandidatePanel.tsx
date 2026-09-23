import React from "react";
import {
  Scissors,
  Sparkles,
  Loader2,
  SlidersHorizontal,
  Play,
  Check,
  Copy,
} from "lucide-react";
import type {
  Candidate,
  Clip,
  ProjectDetail,
  BusyState,
  LlmEngine,
  TargetDuration,
  EnvironmentStatus,
} from "../../types";
import { formatTime } from "../../utils/format";
import { EmptyState } from "../common/EmptyState";

interface CandidatePanelProps {
  detail: ProjectDetail;
  selectedCount: number;
  llmEngine: LlmEngine;
  localLlmModel: string;
  busy: BusyState;
  environment: EnvironmentStatus | null;
  canUseActiveLlm: boolean;
  targetDuration: TargetDuration;
  setTargetDuration: (dur: TargetDuration) => void;
  enableThinking: boolean;
  setEnableThinking: (val: boolean) => void;
  cutSelected: () => void;
  cancelMoments: () => void;
  moments: (force?: boolean) => void;
  updateClipCount: (count: number) => void;
  clipByCandidate: Map<string, Clip>;
  copiedDescId: string | null;
  copyDescription: (id: string, text: string) => void;
  openCandidatePreview: (candidate: Candidate) => void;
  cutCandidate: (candidateId: string) => void;
  renderingCandidateId: string | null;
  candidateProgress?: { message: string; current: number; total: number } | null;
}

export const CandidatePanel: React.FC<CandidatePanelProps> = ({
  detail,
  selectedCount,
  llmEngine,
  localLlmModel,
  busy,
  environment,
  canUseActiveLlm,
  targetDuration,
  setTargetDuration,
  enableThinking,
  setEnableThinking,
  cutSelected,
  cancelMoments,
  moments,
  updateClipCount,
  clipByCandidate,
  copiedDescId,
  copyDescription,
  openCandidatePreview,
  cutCandidate,
  renderingCandidateId,
  candidateProgress,
}) => {
  return (
    <section className="panel candidate-panel">
      <div className="panel-heading">
        <div>
          <h3>Clip Candidates</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "2px" }}>
            <span style={{ fontSize: "0.8rem", opacity: 0.75 }}>
              {detail.candidates.length ? `${selectedCount} seleccionados` : "Sin candidatos"}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "1px 6px",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                color: "var(--accent-primary)",
              }}
            >
              IA: {llmEngine === "local" ? localLlmModel || "Ollama" : llmEngine.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="button-pair">
          <button onClick={cutSelected} disabled={busy !== "idle" || selectedCount === 0 || !environment?.hasFfmpeg}>
            {busy === "cut" ? <Loader2 className="spin" size={16} /> : <Scissors size={16} />}
            Cortar ({selectedCount})
          </button>
          {busy === "moments" ? (
            <button
              type="button"
              className="btn-cancel"
              onClick={cancelMoments}
              title="Detener la búsqueda y liberar VRAM"
              style={{
                padding: "0.4rem 0.8rem",
                fontSize: "0.82rem",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid #ef4444",
                color: "#f87171",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Loader2 className="spin" size={14} />
              Cancelar Búsqueda
            </button>
          ) : (
            <button onClick={() => void moments(false)} disabled={busy !== "idle" || !detail.transcript || !canUseActiveLlm}>
              <Sparkles size={16} />
              Buscar Momentos
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.4rem 1rem",
          background: "rgba(255,255,255,0.02)",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.78rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ opacity: 0.8 }}>Duración Objetivo:</span>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {(["30s", "60s", "2m", "3m", "5m"] as const).map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => {
                  setTargetDuration(dur);
                  localStorage.setItem("autoshorts_target_duration", dur);
                }}
                disabled={busy !== "idle"}
                style={{
                  padding: "0.2rem 0.55rem",
                  borderRadius: "4px",
                  border: targetDuration === dur ? "1px solid var(--accent-primary)" : "1px solid var(--border)",
                  background: targetDuration === dur ? "rgba(99, 102, 241, 0.2)" : "transparent",
                  color: targetDuration === dur ? "var(--accent-primary)" : "var(--foreground)",
                  cursor: "pointer",
                  fontSize: "0.74rem",
                  fontWeight: targetDuration === dur ? 600 : 400,
                }}
              >
                {dur === "30s" ? "30 seg" : dur === "60s" ? "1 min" : dur === "2m" ? "2 min" : dur === "3m" ? "3 min" : "5 min"}
              </button>
            ))}
          </div>
        </div>

        <label
          style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.74rem" }}
          title="Desactívalo para análisis ultrarrápido (Recomendado para RTX 2060)"
        >
          <input
            type="checkbox"
            checked={enableThinking}
            onChange={(e) => {
              setEnableThinking(e.target.checked);
              localStorage.setItem("autoshorts_enable_thinking", String(e.target.checked));
            }}
            style={{ cursor: "pointer", width: "13px", height: "13px" }}
          />
          <span style={{ color: enableThinking ? "#f59e0b" : "var(--text-secondary)", fontWeight: enableThinking ? 600 : 400 }}>
            {enableThinking ? "Thinking CoT (Lento)" : "Modo Rápido"}
          </span>
        </label>
      </div>

      {busy === "moments" && (
        <div style={{ padding: "0.6rem 1rem", background: "rgba(99, 102, 241, 0.06)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", fontSize: "0.78rem" }}>
            <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
              {candidateProgress?.message || "Buscando momentos clave con IA..."}
            </span>
            <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>
              {candidateProgress && candidateProgress.total > 0
                ? Math.round((candidateProgress.current / candidateProgress.total) * 100)
                : 0}
              %
            </span>
          </div>
          <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
            <div
              style={{
                width: `${
                  candidateProgress && candidateProgress.total > 0
                    ? Math.min(100, Math.round((candidateProgress.current / candidateProgress.total) * 100))
                    : 0
                }%`,
                height: "100%",
                background: "linear-gradient(90deg, #6366f1 0%, #f59e0b 100%)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {!canUseActiveLlm && (
        <div className="api-warning">
          {llmEngine === "local"
            ? "Ollama local server is not running at http://localhost:11434. Moment detection will not work."
            : `${
                llmEngine === "claude"
                  ? "Claude"
                  : llmEngine === "deepseek"
                  ? "DeepSeek"
                  : llmEngine === "gemini"
                  ? "Gemini"
                  : llmEngine === "openai"
                  ? "OpenAI"
                  : llmEngine === "openrouter"
                  ? "OpenRouter"
                  : llmEngine === "groq"
                  ? "Groq"
                  : "LLM"
              } API Key is missing. Viral moment identification will not work. Please add your key in API Settings.`}
        </div>
      )}

      {detail.candidates.length > 0 && (
        <div className="clip-control" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.8rem" }}>
          <SlidersHorizontal size={17} />
          <input
            type="range"
            min="0"
            max={detail.candidates.length}
            value={selectedCount}
            onChange={(event) => void updateClipCount(Number(event.target.value))}
            style={{ flex: 1 }}
          />
          <strong style={{ minWidth: "45px" }}>
            {selectedCount} / {detail.candidates.length}
          </strong>
          <button
            className="icon-button"
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", whiteSpace: "nowrap" }}
            onClick={() => void updateClipCount(selectedCount === detail.candidates.length ? 0 : detail.candidates.length)}
          >
            {selectedCount === detail.candidates.length ? "Deseleccionar" : "Seleccionar Todos"}
          </button>
        </div>
      )}

      <div className="candidate-list">
        {detail.candidates.map((candidate) => {
          const clip = clipByCandidate.get(candidate.id);
          const isCut = clip?.status === "done" && Boolean(clip.outputPath);
          return (
            <article key={candidate.id} className={`candidate-card ${candidate.selected ? "selected" : ""}`}>
              <div
                className="portrait-preview-container"
                onClick={() => openCandidatePreview(candidate)}
                style={{ cursor: "pointer" }}
                title="Haz clic para previsualizar este fragmento"
              >
                <div className="portrait-preview-mock">
                  <div className="mock-video-active" style={{ opacity: isCut ? 1 : 0.85 }}>
                    <Play size={20} className="play-icon-mock" />
                  </div>
                </div>
                <div className="candidate-rank">
                  <span>#{candidate.rank}</span>
                  {candidate.selected && <Check size={14} />}
                </div>
              </div>

              <div className="candidate-body">
                <div className="candidate-meta">
                  <span>
                    {formatTime(candidate.startSec)} - {formatTime(candidate.endSec)}
                  </span>
                  <span className="candidate-score">{Math.round(candidate.score * 100)}% Match</span>
                </div>
                <h4>{candidate.hook}</h4>
                <p className="candidate-rationale">{candidate.rationale}</p>

                {candidate.description && (
                  <div className="candidate-description-box">
                    <div className="desc-header">
                      <span className="desc-label">Descripción para Redes</span>
                      <button
                        type="button"
                        className="desc-copy-btn"
                        onClick={() => copyDescription(candidate.id, candidate.description!)}
                        title="Copiar texto para redes sociales"
                      >
                        <Copy size={11} />
                        <span>{copiedDescId === candidate.id ? "Copiado" : "Copiar"}</span>
                      </button>
                    </div>
                    <p className="desc-text">{candidate.description}</p>
                  </div>
                )}

                <div className="candidate-actions">
                  <span className={`clip-status ${isCut ? "ready" : clip?.status === "error" ? "error" : ""}`}>
                    {isCut ? "Cut ready" : clip?.status === "error" ? "Cut failed" : clip?.status ?? "Pending"}
                  </span>
                  <button
                    className="icon-button"
                    style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    onClick={() => openCandidatePreview(candidate)}
                    title="Previsualizar fragmento en reproductor"
                  >
                    <Play size={13} />
                    <span>Ver</span>
                  </button>
                  <button
                    className="cut-button"
                    onClick={() => void cutCandidate(candidate.id)}
                    disabled={busy !== "idle" || !environment?.hasFfmpeg}
                  >
                    {renderingCandidateId === candidate.id ? <Loader2 className="spin" size={14} /> : <Scissors size={14} />}
                    {renderingCandidateId === candidate.id ? "Cutting..." : isCut ? "Re-cut" : "Cut"}
                  </button>
                </div>
                {clip?.outputPath && <div className="output-path">{clip.outputPath}</div>}
                {clip?.captionAssPath && (
                  <div
                    className="output-path"
                    style={{
                      background: "rgba(142, 230, 199, 0.05)",
                      borderColor: "var(--accent-primary)",
                      color: "var(--accent-primary)",
                      marginTop: "4px",
                    }}
                  >
                    Subtitles: {clip.captionAssPath}
                  </div>
                )}
                {clip?.renderLog && <div className="render-log">{clip.renderLog}</div>}
              </div>
            </article>
          );
        })}
        {detail.candidates.length === 0 && <EmptyState icon={<Sparkles size={28} />} label="Moments pending" />}
      </div>
    </section>
  );
};
