import React from "react";
import {
  Scissors,
  Sparkles,
  Loader2,
  SlidersHorizontal,
  Play,
  Check,
  Copy,
  Ratio,
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
  aspectRatio: "original" | "9:16";
  setAspectRatio: (val: "original" | "9:16") => void;
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
  aspectRatio,
  setAspectRatio,
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
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
              {detail.candidates.length ? `${selectedCount} seleccionados` : "Sin candidatos"}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "1px 6px",
                borderRadius: "4px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              IA: {llmEngine === "local" ? localLlmModel || "Ollama" : llmEngine.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="button-pair">
          <button
            onClick={cutSelected}
            disabled={busy !== "idle" || selectedCount === 0 || !environment?.hasFfmpeg}
            style={{
              background: busy !== "idle" || selectedCount === 0 ? "var(--bg-surface-raised)" : "#fafafa",
              color: busy !== "idle" || selectedCount === 0 ? "var(--text-muted)" : "#09090b",
              border: busy !== "idle" || selectedCount === 0 ? "1px solid var(--border-default)" : "1px solid #fafafa",
              fontWeight: 600,
            }}
          >
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
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid #ef4444",
                color: "#f87171",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "6px",
                fontWeight: 600,
              }}
            >
              <Loader2 className="spin" size={14} />
              Cancelar Búsqueda
            </button>
          ) : (
            <button
              onClick={() => void moments(false)}
              disabled={busy !== "idle" || !detail.transcript || !canUseActiveLlm}
              style={{
                background: "var(--bg-surface-raised)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
              }}
            >
              <Sparkles size={16} />
              Buscar Momentos
            </button>
          )}
        </div>
      </div>

      {/* Control bar: Duration, Aspect Ratio, Thinking Mode */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.6rem",
          padding: "0.5rem 1rem",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-default)",
          fontSize: "0.78rem",
        }}
      >
        {/* Duración */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Duración:</span>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {(["30s", "60s", "2m", "3m", "5m"] as const).map((dur) => {
              const active = targetDuration === dur;
              return (
                <button
                  key={dur}
                  type="button"
                  onClick={() => {
                    setTargetDuration(dur);
                    localStorage.setItem("autoshorts_target_duration", dur);
                  }}
                  disabled={busy !== "idle"}
                  style={{
                    padding: "0.2rem 0.5rem",
                    borderRadius: "4px",
                    border: active ? "1px solid #fafafa" : "1px solid var(--border-default)",
                    background: active ? "#fafafa" : "var(--bg-surface-raised)",
                    color: active ? "#09090b" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "0.72rem",
                    fontWeight: active ? 600 : 400,
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {dur === "30s" ? "30s" : dur === "60s" ? "1m" : dur === "2m" ? "2m" : dur === "3m" ? "3m" : "5m"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Formato de Relación de Aspecto */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "3px" }}>
            <Ratio size={12} />
            <span>Formato:</span>
          </span>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button
              type="button"
              onClick={() => setAspectRatio("original")}
              disabled={busy !== "idle"}
              title="Conserva la relación de aspecto nativa del video (panorámico 16:9, etc.)"
              style={{
                padding: "0.2rem 0.55rem",
                borderRadius: "4px",
                border: aspectRatio === "original" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                background: aspectRatio === "original" ? "#fafafa" : "var(--bg-surface-raised)",
                color: aspectRatio === "original" ? "#09090b" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "0.72rem",
                fontWeight: aspectRatio === "original" ? 600 : 400,
              }}
            >
              Original (Nativo)
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio("9:16")}
              disabled={busy !== "idle"}
              title="Recorte centrado 9:16 vertical para TikTok, Reels o YouTube Shorts"
              style={{
                padding: "0.2rem 0.55rem",
                borderRadius: "4px",
                border: aspectRatio === "9:16" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                background: aspectRatio === "9:16" ? "#fafafa" : "var(--bg-surface-raised)",
                color: aspectRatio === "9:16" ? "#09090b" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "0.72rem",
                fontWeight: aspectRatio === "9:16" ? 600 : 400,
              }}
            >
              9:16 Vertical
            </button>
          </div>
        </div>

        {/* Modo Thinking */}
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
            style={{ cursor: "pointer", width: "13px", height: "13px", accentColor: "#fafafa" }}
          />
          <span style={{ color: enableThinking ? "#f59e0b" : "var(--text-secondary)", fontWeight: enableThinking ? 600 : 400 }}>
            {enableThinking ? "Thinking CoT (Lento)" : "Modo Rápido"}
          </span>
        </label>
      </div>

      {busy === "moments" && (
        <div style={{ padding: "0.6rem 1rem", background: "var(--bg-surface-raised)", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", fontSize: "0.78rem" }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {candidateProgress?.message || "Buscando momentos clave con IA..."}
            </span>
            <span style={{ color: "#fafafa", fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
              {candidateProgress && candidateProgress.total > 0
                ? Math.round((candidateProgress.current / candidateProgress.total) * 100)
                : 0}
              %
            </span>
          </div>
          <div style={{ width: "100%", height: "4px", background: "var(--bg-base)", borderRadius: "2px", overflow: "hidden" }}>
            <div
              style={{
                width: `${
                  candidateProgress && candidateProgress.total > 0
                    ? Math.min(100, Math.round((candidateProgress.current / candidateProgress.total) * 100))
                    : 0
                }%`,
                height: "100%",
                background: "#fafafa",
                transition: "width 0.25s ease",
              }}
            />
          </div>
        </div>
      )}

      {!canUseActiveLlm && (
        <div className="api-warning">
          {llmEngine === "local"
            ? "El servidor local de Ollama no está respondiendo en http://localhost:11434. La detección de momentos requiere iniciar Ollama."
            : `Falta la clave API de ${llmEngine.toUpperCase()}. Configúrala en Ajustes para habilitar la identificación de momentos.`}
        </div>
      )}

      {detail.candidates.length > 0 && (
        <div className="clip-control" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 1rem", borderBottom: "1px solid var(--border-default)" }}>
          <SlidersHorizontal size={16} color="var(--text-secondary)" />
          <input
            type="range"
            min="0"
            max={detail.candidates.length}
            value={selectedCount}
            onChange={(event) => void updateClipCount(Number(event.target.value))}
            style={{ flex: 1, accentColor: "#fafafa" }}
          />
          <strong style={{ minWidth: "50px", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "0.82rem" }}>
            {selectedCount} / {detail.candidates.length}
          </strong>
          <button
            className="icon-button"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", whiteSpace: "nowrap" }}
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
                className="media-preview-container"
                onClick={() => openCandidatePreview(candidate)}
                style={{ cursor: "pointer" }}
                title="Haz clic para previsualizar este fragmento"
              >
                <div className="media-preview-thumb">
                  <div className="mock-video-active" style={{ opacity: isCut ? 1 : 0.85 }}>
                    <Play size={16} className="play-icon-mock" />
                  </div>
                  <span className="media-preview-dur">
                    {Math.round(candidate.endSec - candidate.startSec)}s
                  </span>
                </div>
                <div className="candidate-rank">
                  <span>#{candidate.rank}</span>
                  {candidate.selected && <Check size={12} color="#fafafa" />}
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
                    {isCut ? "Corte listo" : clip?.status === "error" ? "Error en corte" : clip?.status ?? "Pendiente"}
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      className="icon-button"
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      onClick={() => openCandidatePreview(candidate)}
                      title="Previsualizar fragmento en reproductor"
                    >
                      <Play size={12} />
                      <span>Ver</span>
                    </button>
                    <button
                      className="cut-button"
                      onClick={() => void cutCandidate(candidate.id)}
                      disabled={busy !== "idle" || !environment?.hasFfmpeg}
                    >
                      {renderingCandidateId === candidate.id ? <Loader2 className="spin" size={13} /> : <Scissors size={13} />}
                      {renderingCandidateId === candidate.id ? "Cortando..." : isCut ? "Recortar" : "Cortar"}
                    </button>
                  </div>
                </div>
                {clip?.outputPath && <div className="output-path">{clip.outputPath}</div>}
                {clip?.captionAssPath && (
                  <div
                    className="output-path"
                    style={{
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-default)",
                      color: "var(--text-secondary)",
                      marginTop: "4px",
                    }}
                  >
                    Subtítulos: {clip.captionAssPath}
                  </div>
                )}
                {clip?.renderLog && <div className="render-log">{clip.renderLog}</div>}
              </div>
            </article>
          );
        })}

        {detail.candidates.length === 0 && (
          <div className="empty-state">
            <Sparkles size={28} style={{ opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              No se han identificado momentos virales todavía.
            </p>
            <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--text-muted)" }}>
              Usa el botón "Buscar Momentos" para analizar la transcripción con IA.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
