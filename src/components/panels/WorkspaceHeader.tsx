import React from "react";
import {
  Clapperboard,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import type { ProjectDetail } from "../../types";
import { fileName } from "../../utils/format";

interface WorkspaceHeaderProps {
  detail: ProjectDetail;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  openSummaryModal: () => void;
  refresh: (projectId: string) => void;
  error: string | null;
  selectedCount?: number;
  selectedCutCount?: number;
  selectedCaptionsCount?: number;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  detail,
  showSettings,
  setShowSettings,
  openSummaryModal,
  refresh,
  error,
}) => {
  const statusLabel =
    detail.candidates.length > 0
      ? `${detail.candidates.length} Momentos detectados`
      : detail.transcript
      ? "Transcrito listo"
      : "Audio pendiente de transcribir";

  return (
    <>
      <header className="topbar">
        <div className="project-info">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="eyebrow">{detail.project.status}</div>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "var(--bg-surface-raised)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
              }}
            >
              {statusLabel}
            </span>
          </div>
          <h2>{detail.project.name || fileName(detail.project.sourcePath)}</h2>
        </div>
        <div className="topbar-actions">
          <button
            className="primary-action compact"
            onClick={openSummaryModal}
            disabled={detail.candidates.length === 0}
            title={
              detail.candidates.length === 0
                ? "Primero busca momentos con la IA para compilar el resumen"
                : "Autoeditar y compilar momentos en un video resumen"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: detail.candidates.length === 0 ? "var(--bg-surface-raised)" : "#fafafa",
              color: detail.candidates.length === 0 ? "var(--text-muted)" : "#09090b",
              border: detail.candidates.length === 0 ? "1px solid var(--border-default)" : "1px solid #fafafa",
              padding: "0.45rem 0.9rem",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: detail.candidates.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            <Clapperboard size={15} />
            <span>Autoeditar Resumen</span>
          </button>
          <button
            className={`secondary-action settings-toggle ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Configuración de Modelos & APIs"
          >
            <SlidersHorizontal size={15} />
            <span>Configuración & APIs</span>
          </button>
          <button className="secondary-action" onClick={() => void refresh(detail.project.id)} title="Actualizar" style={{ width: "36px", padding: 0 }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
    </>
  );
};
