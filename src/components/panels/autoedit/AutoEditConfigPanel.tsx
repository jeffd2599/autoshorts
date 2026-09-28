import React from "react";
import {
  Zap,
  Video,
  Clock,
  Scissors,
  Sparkles,
  Shuffle,
  Crosshair,
  Flame,
  Layers,
  Check,
  X,
  Loader2,
  Wand2
} from "lucide-react";
import { AutoEditAssemblyStyle } from "../../../types";

interface AutoEditConfigPanelProps {
  formatMode: "youtube" | "shorts";
  setFormatMode: (mode: "youtube" | "shorts") => void;
  targetDurationMinutes: number;
  setTargetDurationMinutes: (m: number) => void;
  assemblyStyle: AutoEditAssemblyStyle;
  setAssemblyStyle: (style: AutoEditAssemblyStyle) => void;
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
const SHORTS_DURATIONS = [1, 2, 3, 4, 5];

const ASSEMBLY_STYLES: {
  id: AutoEditAssemblyStyle;
  name: string;
  badge: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  {
    id: "balanced",
    name: "Mezcla Épica",
    badge: "Equilibrado",
    desc: "Gancho estelar, progresión de tensión y remate clímax.",
    icon: Sparkles
  },
  {
    id: "smart_shuffle",
    name: "Mezcla Dinámica",
    badge: "Variación IA",
    desc: "Orquestación aleatoria con IA: combina diferentes mejores momentos.",
    icon: Shuffle
  },
  {
    id: "alternative",
    name: "Nueva Variación",
    badge: "Sin Repetir",
    desc: "Excluye momentos usados en tus autoedits previos de este stream.",
    icon: Layers
  },
  {
    id: "action",
    name: "Clutches & Acción",
    badge: "Combate",
    desc: "Prioriza bajas, disparos detectados y jugadas intensas.",
    icon: Crosshair
  },
  {
    id: "humor",
    name: "Risas & Comedia",
    badge: "Diversión",
    desc: "Prioriza risas del streamer, carcajadas y momentos cómicos.",
    icon: Flame
  },
  {
    id: "chronological",
    name: "Flujo Cronológico",
    badge: "Historia",
    desc: "Ensambla los mejores momentos en el orden temporal del stream.",
    icon: Clock
  }
];

export const AutoEditConfigPanel: React.FC<AutoEditConfigPanelProps> = ({
  formatMode,
  setFormatMode,
  targetDurationMinutes,
  setTargetDurationMinutes,
  assemblyStyle,
  setAssemblyStyle,
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
          Configura y orquesta un video ensamblado con los mejores momentos de tu stream.
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
            El motor de ensamblado compensará silencios y expandirá contexto para alcanzar exactamente {targetDurationMinutes} min.
          </p>
        </div>

        {/* AI Assembly Orchestration Style */}
        <div className="config-section">
          <label className="section-label">
            <Wand2 size={14} /> Orquestación de la IA
          </label>
          <div className="assembly-styles-grid">
            {ASSEMBLY_STYLES.map((style) => {
              const IconComp = style.icon;
              const isSelected = assemblyStyle === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  className={`style-option-card ${isSelected ? "active" : ""}`}
                  onClick={() => setAssemblyStyle(style.id)}
                  disabled={isRendering}
                >
                  <div className="style-option-header">
                    <div className="style-option-title-row">
                      <IconComp size={15} className="style-icon" />
                      <span className="style-name">{style.name}</span>
                    </div>
                    <span className="style-badge">{style.badge}</span>
                  </div>
                  <div className="style-desc">{style.desc}</div>
                </button>
              );
            })}
          </div>
          <p className="field-hint">
            Puedes generar múltiples versiones (por ejemplo con Mezcla Dinámica o Nueva Variación) y conservarlas todas en tu galería.
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
                  Elimina pausas muertas manteniendo la duración objetivo mediante compensación inteligente.
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
