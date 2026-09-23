import React from "react";
import { Scissors } from "lucide-react";
import { Candidate, Clip, ProjectDetail } from "../../types";
import { formatTime } from "../../utils/format";

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
  onCutCandidate: (candidateId: string) => Promise<void>;
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

  return (
    <div className="style-modal-overlay" onClick={onClose}>
      <div className="style-modal" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
        <div className="style-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3>Previsualizar Clip #{candidate.rank}</h3>
            <p style={{ margin: 0 }}>
              {formatTime(candidate.startSec)} - {formatTime(candidate.endSec)} ({Math.round(candidate.endSec - candidate.startSec)}s)
            </p>
          </div>
          <button className="btn-cancel" onClick={onClose} style={{ padding: "0.4rem 0.8rem" }}>
            Cerrar
          </button>
        </div>

        <div style={{ padding: "1rem" }}>
          <h4 style={{ color: "var(--accent-primary)", marginBottom: "0.75rem", fontSize: "1.05rem" }}>
            "{candidate.hook}"
          </h4>

          <div style={{ background: "#000", borderRadius: "8px", overflow: "hidden", maxHeight: "400px", display: "flex", justifyContent: "center" }}>
            <video
              key={`${candidate.id}-${trimStart}-${trimEnd}`}
              src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(
                clipByCandidate.get(candidate.id)?.outputPath || detail.project.sourcePath
              )}#t=${clipByCandidate.get(candidate.id)?.outputPath ? 0 : trimStart},${clipByCandidate.get(candidate.id)?.outputPath ? '' : trimEnd}`}
              controls
              autoPlay
              style={{ maxHeight: "400px", maxWidth: "100%", borderRadius: "8px" }}
            />
          </div>

          {/* Ajuste Fino de Recorte (Trim Controls) */}
          <div style={{ marginTop: "1rem", padding: "0.85rem", borderRadius: "8px", background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.82rem", letterSpacing: "0.02em", color: "var(--text-secondary)" }}>
                AJUSTE FINO DE RECORTE (TRIM)
              </span>
              <span style={{ fontSize: "0.78rem", color: "#fafafa", fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                Duración: {Math.max(0, trimEnd - trimStart).toFixed(1)}s
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
              {/* Inicio */}
              <div style={{ background: "var(--bg-base)", padding: "0.5rem 0.65rem", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>Inicio: <strong style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{formatTime(trimStart)}</strong></span>
                  <span style={{ fontSize: "0.72rem", opacity: 0.6, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{trimStart.toFixed(1)}s</span>
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flex: 1, padding: "0.25rem 0", fontSize: "0.72rem", minHeight: "26px" }}
                    onClick={() => setTrimStart((curr) => Math.max(0, Number((curr - 5).toFixed(1))))}
                    title="Retroceder 5 segundos"
                  >
                    -5s
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flex: 1, padding: "0.25rem 0", fontSize: "0.72rem", minHeight: "26px" }}
                    onClick={() => setTrimStart((curr) => Math.max(0, Number((curr - 1).toFixed(1))))}
                    title="Retroceder 1 segundo"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flex: 1, padding: "0.25rem 0", fontSize: "0.72rem", minHeight: "26px" }}
                    onClick={() => setTrimStart((curr) => Math.min(trimEnd - 1, Number((curr + 1).toFixed(1))))}
                    title="Avanzar 1 segundo"
                  >
                    +1s
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flex: 1, padding: "0.25rem 0", fontSize: "0.72rem", minHeight: "26px" }}
                    onClick={() => setTrimStart((curr) => Math.min(trimEnd - 1, Number((curr + 5).toFixed(1))))}
                    title="Avanzar 5 segundos"
                  >
                    +5s
                  </button>
                </div>
              </div>

              {/* Fin */}
              <div style={{ background: "rgba(0,0,0,0.2)", padding: "0.5rem 0.65rem", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>Fin: <strong>{formatTime(trimEnd)}</strong></span>
                  <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>{trimEnd.toFixed(1)}s</span>
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flex: 1, padding: "0.25rem 0", fontSize: "0.72rem", minHeight: "26px" }}
                    onClick={() => setTrimEnd((curr) => Math.max(trimStart + 1, Number((curr - 5).toFixed(1))))}
                    title="Acortar 5 segundos"
                  >
                    -5s
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flex: 1, padding: "0.25rem 0", fontSize: "0.72rem", minHeight: "26px" }}
                    onClick={() => setTrimEnd((curr) => Math.max(trimStart + 1, Number((curr - 1).toFixed(1))))}
                    title="Acortar 1 segundo"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flex: 1, padding: "0.25rem 0", fontSize: "0.72rem", minHeight: "26px" }}
                    onClick={() => setTrimEnd((curr) => Number((curr + 1).toFixed(1)))}
                    title="Extender 1 segundo"
                  >
                    +1s
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flex: 1, padding: "0.25rem 0", fontSize: "0.72rem", minHeight: "26px" }}
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
                  Modificado (Original: {formatTime(candidate.startSec)} - {formatTime(candidate.endSec)})
                </span>
              )}
              <button
                type="button"
                className="icon-button"
                style={{ fontSize: "0.76rem", padding: "0.3rem 0.6rem" }}
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
                className="primary-action"
                style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", minHeight: "28px" }}
                onClick={onSaveTrim}
                disabled={isSavingTrim || trimStart >= trimEnd}
              >
                {isSavingTrim ? "Guardando..." : "Guardar Ajuste"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8, flex: 1 }}>
              {candidate.rationale}
            </p>
            <button
              className="btn-confirm"
              onClick={() => {
                const id = candidate.id;
                onClose();
                void onCutCandidate(id);
              }}
              disabled={busy !== "idle"}
              style={{ whiteSpace: "nowrap" }}
            >
              <Scissors size={15} /> Cortar este Clip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
