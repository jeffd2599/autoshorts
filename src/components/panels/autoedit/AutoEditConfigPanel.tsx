import React from "react";
import {
  Zap,
  Video,
  Clock,
  Scissors,
  Sparkles,
  Check,
  X,
  Loader2
} from "lucide-react";

interface AutoEditConfigPanelProps {
  formatMode: "youtube" | "shorts";
  setFormatMode: (mode: "youtube" | "shorts") => void;
  targetDurationMinutes: number;
  setTargetDurationMinutes: (m: number) => void;
  includeTeaser: boolean;
  setIncludeTeaser: (val: boolean) => void;
  trimSilences: boolean;
  setTrimSilences: (val: boolean) => void;
  isRendering: boolean;
  renderingPercentage: number;
  renderingMessage: string;
  onAssemble: () => void;
  onCancel: () => void;
}

const YOUTUBE_DURATIONS = [8, 12, 15, 20];
const SHORTS_DURATIONS = [1, 2, 3];

export const AutoEditConfigPanel: React.FC<AutoEditConfigPanelProps> = ({
  formatMode,
  setFormatMode,
  targetDurationMinutes,
  setTargetDurationMinutes,
  includeTeaser,
  setIncludeTeaser,
  trimSilences,
  setTrimSilences,
  isRendering,
  renderingPercentage,
  renderingMessage,
  onAssemble,
  onCancel
}) => {
  const currentDurations = formatMode === "youtube" ? YOUTUBE_DURATIONS : SHORTS_DURATIONS;

  return (
    <aside className="autoedit-config-panel">
      <div className="panel-header-clean">
        <div className="title-row">
          <Zap className="icon-accent" size={18} />
          <h3>Nuevo Montaje con IA</h3>
        </div>
        <p className="subtitle">
          Configura y ensambla automáticamente un rough cut listo para editar o publicar.
        </p>
      </div>

      <div className="config-scroll-body">
        {/* Format Selector */}
        <div className="config-section">
          <label className="section-label">
            <Video size={14} /> Formato de Video
          </label>
          <div className="format-cards-grid">
            <button
              type="button"
              className={`format-card ${formatMode === "youtube" ? "active" : ""}`}
              onClick={() => {
                setFormatMode("youtube");
                if (!YOUTUBE_DURATIONS.includes(targetDurationMinutes)) {
                  setTargetDurationMinutes(12);
                }
              }}
              disabled={isRendering}
            >
              <div className="format-card-header">
                <Video size={18} />
                <span className="aspect-badge">16:9</span>
              </div>
              <div className="format-title">YouTube Video</div>
              <div className="format-desc">Horizontal clásico, ritmo narrativo por capítulos.</div>
            </button>

            <button
              type="button"
              className={`format-card ${formatMode === "shorts" ? "active" : ""}`}
              onClick={() => {
                setFormatMode("shorts");
                if (!SHORTS_DURATIONS.includes(targetDurationMinutes)) {
                  setTargetDurationMinutes(2);
                }
              }}
              disabled={isRendering}
            >
              <div className="format-card-header">
                <Zap size={18} />
                <span className="aspect-badge">9:16</span>
              </div>
              <div className="format-title">Shorts / TikTok</div>
              <div className="format-desc">Vertical dinámico, ritmo ágil y ganchos rápidos.</div>
            </button>
          </div>
        </div>

        {/* Target Duration Chips */}
        <div className="config-section">
          <label className="section-label">
            <Clock size={14} /> Duración Objetivo
          </label>
          <div className="duration-chips-row">
            {currentDurations.map((dur) => (
              <button
                key={dur}
                type="button"
                className={`duration-chip ${targetDurationMinutes === dur ? "active" : ""}`}
                onClick={() => setTargetDurationMinutes(dur)}
                disabled={isRendering}
              >
                {dur} {dur === 1 ? "minuto" : "minutos"}
              </button>
            ))}
          </div>
          <p className="field-hint">
            El ensamblador seleccionará los mejores momentos y recortará la ventana activa para respetar este tiempo exacto.
          </p>
        </div>

        {/* Editorial Options */}
        <div className="config-section">
          <label className="section-label">
            <Sparkles size={14} /> Opciones Editoriales
          </label>
          <div className="toggles-column">
            <label className="checkbox-toggle">
              <input
                type="checkbox"
                checked={includeTeaser}
                onChange={(e) => setIncludeTeaser(e.target.checked)}
                disabled={isRendering}
              />
              <div className="toggle-info">
                <span className="toggle-title">Teaser Hook al inicio</span>
                <span className="toggle-desc">
                  Agrega un fragmento de 3-5s de la jugada o remate más impactante antes de empezar.
                </span>
              </div>
            </label>

            <label className="checkbox-toggle">
              <input
                type="checkbox"
                checked={trimSilences}
                onChange={(e) => setTrimSilences(e.target.checked)}
                disabled={isRendering}
              />
              <div className="toggle-info">
                <span className="toggle-title">Recortar silencios (Jump Cuts)</span>
                <span className="toggle-desc">
                  Elimina micro-pausas sin habla para mantener el ritmo acelerado.
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Footer / Assembly Action & Progress */}
      <div className="config-footer">
        {isRendering ? (
          <div className="rendering-status-box">
            <div className="status-top">
              <Loader2 className="spinner" size={16} />
              <span className="status-msg">{renderingMessage || "Procesando montaje..."}</span>
              <span className="status-pct">{renderingPercentage}%</span>
            </div>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.max(5, renderingPercentage)}%` }}
              />
            </div>
            <button
              type="button"
              className="cancel-btn-clean"
              onClick={onCancel}
            >
              <X size={14} /> Cancelar Proceso
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="assemble-submit-btn"
            onClick={onAssemble}
          >
            <Zap size={16} /> Ensamblar Video con IA
          </button>
        )}
      </div>
    </aside>
  );
};
