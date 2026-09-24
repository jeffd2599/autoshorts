import React from "react";
import {
  Clapperboard,
  SlidersHorizontal,
  RefreshCw,
  Check,
  CheckCircle2,
  AlertTriangle,
  FolderSearch,
} from "lucide-react";
import type { ProjectDetail } from "../../types";
import { fileName } from "../../utils/format";

interface WorkspaceHeaderProps {
  detail: ProjectDetail;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  openSummaryModal: () => void;
  refresh: (projectId: string) => void;
  toggleProjectCompleted: (projectId: string) => void;
  relinkProjectVideo: (projectId: string) => void;
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
  toggleProjectCompleted,
  relinkProjectVideo,
  error,
}) => {
  const isCompleted = detail.project.status === "completed";
  const isMissing = detail.project.sourceExists === false;

  const statusLabel = isMissing
    ? "Archivo movido o eliminado"
    : detail.candidates.length > 0
    ? `${detail.candidates.length} Momentos detectados`
    : detail.transcript
    ? "Transcrito listo"
    : "Audio pendiente de transcribir";

  return (
    <>
      <header className="topbar">
        <div className="project-info">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {isMissing ? (
              <div
                className="eyebrow"
                style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  borderColor: "rgba(245, 158, 11, 0.35)",
                  color: "#fbbf24",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <AlertTriangle size={11} />
                <span>VIDEO NO ENCONTRADO</span>
              </div>
            ) : isCompleted ? (
              <div
                className="eyebrow"
                style={{
                  background: "rgba(16, 185, 129, 0.12)",
                  borderColor: "rgba(16, 185, 129, 0.35)",
                  color: "#34d399",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <CheckCircle2 size={11} />
                <span>CULMINADO</span>
              </div>
            ) : (
              <div className="eyebrow">{detail.project.status}</div>
            )}
            <span
              style={{
                fontSize: "0.72rem",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "var(--bg-surface-raised)",
                border: "1px solid var(--border-default)",
                color: isMissing ? "#fbbf24" : "var(--text-secondary)",
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
          {isMissing ? (
            <button
              type="button"
              className="missing-video-banner-btn"
              onClick={() => void relinkProjectVideo(detail.project.id)}
              title="Buscar y seleccionar la nueva ubicación de este video"
            >
              <FolderSearch size={14} />
              <span>Localizar video</span>
            </button>
          ) : (
            <button
              type="button"
              className="secondary-action"
              onClick={() => void toggleProjectCompleted(detail.project.id)}
              title={isCompleted ? "Reabrir proyecto como en progreso" : "Marcar proyecto como culminado"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: isCompleted ? "rgba(16, 185, 129, 0.1)" : undefined,
                borderColor: isCompleted ? "rgba(16, 185, 129, 0.35)" : undefined,
                color: isCompleted ? "#34d399" : undefined,
              }}
            >
              {isCompleted ? (
                <>
                  <CheckCircle2 size={14} />
                  <span>Culminado</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Marcar Listo</span>
                </>
              )}
            </button>
          )}

          <button
            className="primary-action compact"
            onClick={openSummaryModal}
            disabled={detail.candidates.length === 0 || isMissing}
            title={
              isMissing
                ? "Localiza el video para habilitar la generación de resúmenes"
                : detail.candidates.length === 0
                ? "Primero busca momentos con la IA para compilar el resumen"
                : "Autoeditar y compilar momentos en un video resumen"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: detail.candidates.length === 0 || isMissing ? "var(--bg-surface-raised)" : "#fafafa",
              color: detail.candidates.length === 0 || isMissing ? "var(--text-muted)" : "#09090b",
              border:
                detail.candidates.length === 0 || isMissing
                  ? "1px solid var(--border-default)"
                  : "1px solid #fafafa",
              padding: "0.45rem 0.9rem",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: detail.candidates.length === 0 || isMissing ? "not-allowed" : "pointer",
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

      {isMissing && (
        <div className="missing-video-banner">
          <div className="missing-video-banner-content">
            <AlertTriangle size={18} style={{ color: "#fbbf24", flexShrink: 0 }} />
            <div>
              <strong>El archivo original de video no se encuentra en:</strong>
              <div style={{ marginTop: "2px" }}>
                <code>{detail.project.sourcePath}</code>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="missing-video-banner-btn"
            onClick={() => void relinkProjectVideo(detail.project.id)}
            title="Seleccionar la nueva ruta del archivo de video"
          >
            <FolderSearch size={14} />
            <span>Localizar video</span>
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
    </>
  );
};
