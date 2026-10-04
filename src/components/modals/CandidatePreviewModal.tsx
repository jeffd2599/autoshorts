import React, { useState, useEffect } from "react";
import {
  Scissors,
  X,
  Type,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
} from "lucide-react";
import { Candidate, Clip, ProjectDetail } from "../../types";
import { formatTime } from "../../utils/format";

// Strips any emojis that the LLM may output
function cleanHook(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
}

interface CandidatePreviewModalProps {
  candidate: Candidate | null;
  detail: ProjectDetail | null;
  onClose: () => void;
  trimStart: number;
  setTrimStart: (val: number | ((prev: number) => number)) => void;
  trimEnd: number;
  setTrimEnd: (val: number | ((prev: number) => number)) => void;
  isSavingTrim: boolean;
  onSaveTrim: () => Promise<void>;
  onCutCandidate: (candidateId: string, options?: any) => Promise<void>;
  clipByCandidate: Map<string, Clip>;
  busy: string;
}

export function CandidatePreviewModal({
  candidate,
  detail,
  onClose,
  trimStart,
  setTrimStart,
  trimEnd,
  setTrimEnd,
  isSavingTrim,
  onSaveTrim,
  onCutCandidate,
  clipByCandidate,
  busy,
}: CandidatePreviewModalProps) {
  if (!candidate || !detail) return null;

  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(() => {
    const saved = localStorage.getItem("autoshorts_burn_subtitles");
    return saved !== null ? saved === "true" : true;
  });

  const [captionStyle, setCaptionStyle] = useState<string>(() => {
    return localStorage.getItem("autoshorts_caption_style") || "tiktok-karaoke";
  });

  const [captionPosition, setCaptionPosition] = useState<"bottom" | "center" | "top">(() => {
    return (localStorage.getItem("autoshorts_caption_position") as "bottom" | "center" | "top") || "bottom";
  });

  useEffect(() => {
    localStorage.setItem("autoshorts_burn_subtitles", String(burnSubtitles));
  }, [burnSubtitles]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_style", captionStyle);
  }, [captionStyle]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_position", captionPosition);
  }, [captionPosition]);

  const currentDuration = Math.max(0, trimEnd - trimStart);
  const originalDuration = Math.max(0, candidate.endSec - candidate.startSec);
  const delta = currentDuration - originalDuration;
  const isOver60s = currentDuration > 60.0;
  const overSeconds = isOver60s ? currentDuration - 60.0 : 0;

  const handleSnapTo59 = () => {
    setTrimEnd(Number((trimStart + 59.0).toFixed(1)));
  };

  return (
    <div className="style-modal-overlay" onClick={onClose}>
      <div className="style-modal" style={{ maxWidth: "700px", maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="style-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.2rem 1.5rem", borderBottom: "1px solid var(--border-default)" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>Previsualizar Clip #{candidate.rank}</h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
              {formatTime(candidate.startSec)} - {formatTime(candidate.endSec)} ({originalDuration.toFixed(1)}s inicial)
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Cerrar modal"
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: "1.2rem 1.5rem", overflowY: "auto", flex: 1 }}>
          <h4 style={{ color: "#fafafa", marginBottom: "0.75rem", fontSize: "1.02rem", fontWeight: 600 }}>
            "{cleanHook(candidate.hook)}"
          </h4>

          <div style={{ background: "#000", borderRadius: "8px", overflow: "hidden", maxHeight: "360px", display: "flex", justifyContent: "center" }}>
            <video
              key={`${candidate.id}-${trimStart}-${trimEnd}`}
              src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(
                clipByCandidate.get(candidate.id)?.outputPath || detail.project.sourcePath
              )}#t=${clipByCandidate.get(candidate.id)?.outputPath ? 0 : trimStart},${clipByCandidate.get(candidate.id)?.outputPath ? '' : trimEnd}`}
              controls
              autoPlay
              style={{ maxHeight: "360px", maxWidth: "100%", borderRadius: "8px" }}
            />
          </div>

          {/* Ajuste Fino de Recorte (Trim Controls) con Línea de Duración y Calculadora */}
          <div style={{ marginTop: "1rem", padding: "0.85rem", borderRadius: "8px", background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Clock size={14} color="var(--text-secondary)" />
                <span style={{ fontWeight: 600, fontSize: "0.8rem", letterSpacing: "0.02em", color: "var(--text-secondary)" }}>
                  AJUSTE FINO DE RECORTE (TRIM)
                </span>
              </div>

              {/* Métricas y calculadora en vivo */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.76rem", color: Math.abs(delta) < 0.1 ? "var(--text-muted)" : delta > 0 ? "#60a5fa" : "#f59e0b", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  Δ vs IA: {delta > 0.05 ? `+${delta.toFixed(1)}s` : delta < -0.05 ? `${delta.toFixed(1)}s` : "0.0s"}
                </span>

                <span
                  style={{
                    fontSize: "0.78rem",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    background: isOver60s ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                    color: isOver60s ? "#f87171" : "#4ade80",
                    border: isOver60s ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(34, 197, 94, 0.3)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {isOver60s ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                  {currentDuration.toFixed(1)}s {isOver60s ? `(+${overSeconds.toFixed(1)}s sobre límite 60s)` : "(Apto Shorts)"}
                </span>

                {isOver60s && (
                  <button
                    type="button"
                    onClick={handleSnapTo59}
                    title="Ajustar automáticamente el final para que dure exactamente 59 segundos y no exceda Shorts/TikTok"
                    style={{
                      padding: "2px 8px",
                      fontSize: "0.72rem",
                      borderRadius: "4px",
                      background: "#fafafa",
                      color: "#09090b",
                      border: "none",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                  >
                    <Zap size={11} />
                    Ajustar a 59s
                  </button>
                )}
              </div>
            </div>

            {/* Barra visual de duración relativa a 60s */}
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ height: "6px", width: "100%", background: "var(--bg-base)", borderRadius: "3px", overflow: "hidden", position: "relative" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, (currentDuration / 60.0) * 100)}%`,
                    background: isOver60s ? "#ef4444" : "#10b981",
                    transition: "width 0.15s ease, background 0.15s ease",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px", fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                <span>0s</span>
                <span style={{ color: currentDuration >= 60 ? "#ef4444" : "var(--text-muted)" }}>Límite 60s (Shorts/TikTok)</span>
                <span>{Math.max(60, Math.ceil(currentDuration))}s</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
              {/* Inicio */}
              <div style={{ background: "var(--bg-surface-raised)", padding: "0.6rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Inicio: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums" }}>{formatTime(trimStart)}</strong></span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums" }}>{trimStart.toFixed(1)}s</span>
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ flex: 1, padding: 0, height: "26px", minHeight: "26px", fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)" }}
                    onClick={() => setTrimStart((curr) => Math.max(0, Number((curr - 5).toFixed(1))))}
                    title="Retroceder 5 segundos"
                  >
                    -5s
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ flex: 1, padding: 0, height: "26px", minHeight: "26px", fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)" }}
                    onClick={() => setTrimStart((curr) => Math.max(0, Number((curr - 1).toFixed(1))))}
                    title="Retroceder 1 segundo"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ flex: 1, padding: 0, height: "26px", minHeight: "26px", fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)" }}
                    onClick={() => setTrimStart((curr) => Math.min(trimEnd - 1, Number((curr + 1).toFixed(1))))}
                    title="Avanzar 1 segundo"
                  >
                    +1s
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ flex: 1, padding: 0, height: "26px", minHeight: "26px", fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)" }}
                    onClick={() => setTrimStart((curr) => Math.min(trimEnd - 1, Number((curr + 5).toFixed(1))))}
                    title="Avanzar 5 segundos"
                  >
                    +5s
                  </button>
                </div>
              </div>

              {/* Fin */}
              <div style={{ background: "var(--bg-surface-raised)", padding: "0.6rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Fin: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums" }}>{formatTime(trimEnd)}</strong></span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums" }}>{trimEnd.toFixed(1)}s</span>
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ flex: 1, padding: 0, height: "26px", minHeight: "26px", fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)" }}
                    onClick={() => setTrimEnd((curr) => Math.max(trimStart + 1, Number((curr - 5).toFixed(1))))}
                    title="Acortar 5 segundos"
                  >
                    -5s
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ flex: 1, padding: 0, height: "26px", minHeight: "26px", fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)" }}
                    onClick={() => setTrimEnd((curr) => Math.max(trimStart + 1, Number((curr - 1).toFixed(1))))}
                    title="Acortar 1 segundo"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ flex: 1, padding: 0, height: "26px", minHeight: "26px", fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)" }}
                    onClick={() => setTrimEnd((curr) => Number((curr + 1).toFixed(1)))}
                    title="Extender 1 segundo"
                  >
                    +1s
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ flex: 1, padding: 0, height: "26px", minHeight: "26px", fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)" }}
                    onClick={() => setTrimEnd((curr) => Number((curr + 5).toFixed(1)))}
                    title="Extender 5 segundos"
                  >
                    +5s
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem" }}>
              {(trimStart !== candidate.startSec || trimEnd !== candidate.endSec) && (
                <span style={{ fontSize: "0.74rem", opacity: 0.7, marginRight: "auto" }}>
                  Ajustado (Original: {formatTime(candidate.startSec)} - {formatTime(candidate.endSec)})
                </span>
              )}
              <button
                type="button"
                className="btn-cancel"
                style={{ minHeight: "30px", fontSize: "0.76rem", padding: "0 10px" }}
                onClick={() => {
                  setTrimStart(candidate.startSec);
                  setTrimEnd(candidate.endSec);
                }}
                disabled={trimStart === candidate.startSec && trimEnd === candidate.endSec}
              >
                Restablecer
              </button>
              <button
                type="button"
                className="btn-confirm"
                style={{ minHeight: "30px", fontSize: "0.76rem", padding: "0 14px" }}
                onClick={onSaveTrim}
                disabled={isSavingTrim || trimStart >= trimEnd}
              >
                {isSavingTrim ? "Guardando..." : "Guardar Ajuste"}
              </button>
            </div>
          </div>

          {/* Opciones de Subtítulos y Posicionamiento para Exportación */}
          <div style={{ marginTop: "1rem", padding: "0.85rem", borderRadius: "8px", background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Type size={14} color="var(--text-secondary)" />
                <span style={{ fontWeight: 600, fontSize: "0.8rem", letterSpacing: "0.02em", color: "var(--text-secondary)" }}>
                  SUBTÍTULOS PARA EL CLIP
                </span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.76rem" }}>
                <input
                  type="checkbox"
                  checked={burnSubtitles}
                  onChange={(e) => setBurnSubtitles(e.target.checked)}
                  style={{ accentColor: "#fafafa", cursor: "pointer" }}
                />
                <span style={{ color: burnSubtitles ? "#fafafa" : "var(--text-secondary)", fontWeight: burnSubtitles ? 600 : 400 }}>
                  Incrustar en el video
                </span>
              </label>
            </div>

            <p style={{ margin: "0 0 0.75rem", fontSize: "0.74rem", color: "var(--text-muted)" }}>
              {burnSubtitles
                ? "Los subtítulos se renderizarán directamente sobre el video. También se exportará el archivo .srt editable en tu carpeta."
                : "El video se exportará limpio (sin subtítulos incrustados) y se creará un archivo .srt sincronizado por separado."}
            </p>

            {burnSubtitles && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", paddingTop: "0.25rem", borderTop: "1px dashed var(--border-default)" }}>
                {/* Estilo de Subtítulo */}
                <div>
                  <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                    Estilo de animación:
                  </label>
                  <select
                    value={captionStyle}
                    onChange={(e) => setCaptionStyle(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.35rem 0.5rem",
                      borderRadius: "6px",
                      background: "var(--bg-surface-raised)",
                      border: "1px solid var(--border-default)",
                      color: "#fafafa",
                      fontSize: "0.76rem",
                      cursor: "pointer",
                    }}
                  >
                    <option value="tiktok-karaoke">✨ TikTok Karaoke (Palabra Activa Resaltada)</option>
                    <option value="modern-box">⬛ Caja Moderna (Fondo Oscuro Suave)</option>
                    <option value="classic-outline">🟨 Clásico Contorno (Amarillo con Borde)</option>
                    <option value="minimal-shadow">⬜ Minimalista (Blanco Limpio con Sombra)</option>
                  </select>
                </div>

                {/* Posición en Pantalla (Evitar estorbar cámaras / HUD) */}
                <div>
                  <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                    Posición en pantalla:
                  </label>
                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    <button
                      type="button"
                      onClick={() => setCaptionPosition("bottom")}
                      title="Abajo (Estándar para reels/shorts)"
                      style={{
                        flex: 1,
                        padding: "0.35rem 0.2rem",
                        borderRadius: "5px",
                        border: captionPosition === "bottom" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                        background: captionPosition === "bottom" ? "#fafafa" : "var(--bg-surface-raised)",
                        color: captionPosition === "bottom" ? "#09090b" : "var(--text-secondary)",
                        fontSize: "0.72rem",
                        fontWeight: captionPosition === "bottom" ? 600 : 400,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <AlignVerticalJustifyEnd size={12} />
                      Abajo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptionPosition("center")}
                      title="Centro (No tapa la interfaz del juego ni subtítulos inferiores)"
                      style={{
                        flex: 1,
                        padding: "0.35rem 0.2rem",
                        borderRadius: "5px",
                        border: captionPosition === "center" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                        background: captionPosition === "center" ? "#fafafa" : "var(--bg-surface-raised)",
                        color: captionPosition === "center" ? "#09090b" : "var(--text-secondary)",
                        fontSize: "0.72rem",
                        fontWeight: captionPosition === "center" ? 600 : 400,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <AlignVerticalJustifyCenter size={12} />
                      Centro
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptionPosition("top")}
                      title="Arriba (No estorba la cámara del streamer ni HUD inferior)"
                      style={{
                        flex: 1,
                        padding: "0.35rem 0.2rem",
                        borderRadius: "5px",
                        border: captionPosition === "top" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                        background: captionPosition === "top" ? "#fafafa" : "var(--bg-surface-raised)",
                        color: captionPosition === "top" ? "#09090b" : "var(--text-secondary)",
                        fontSize: "0.72rem",
                        fontWeight: captionPosition === "top" ? 600 : 400,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <AlignVerticalJustifyStart size={12} />
                      Arriba
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", flex: 1 }}>
              {candidate.rationale}
            </p>
            <button
              type="button"
              className="btn-confirm"
              onClick={() => {
                const id = candidate.id;
                onClose();
                void onCutCandidate(id, {
                  burnSubtitles,
                  captionStyle,
                  captionPosition,
                  aspectRatio: detail.project.aspectRatio || "9:16",
                });
              }}
              disabled={busy !== "idle"}
              style={{ whiteSpace: "nowrap", padding: "0.5rem 1rem", fontSize: "0.85rem" }}
            >
              <Scissors size={14} />
              <span>Cortar y Exportar Clip</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
