import React from "react";
import {
  Clapperboard,
  SlidersHorizontal,
  RefreshCw,
  AudioLines,
  Sparkles,
  Scissors,
  Captions,
  Download,
} from "lucide-react";
import type { ProjectDetail } from "../../types";
import { fileName } from "../../utils/format";
import { PipelineStep } from "../common/PipelineStep";

interface WorkspaceHeaderProps {
  detail: ProjectDetail;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  openSummaryModal: () => void;
  refresh: (projectId: string) => void;
  error: string | null;
  selectedCount: number;
  selectedCutCount: number;
  selectedCaptionsCount: number;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  detail,
  showSettings,
  setShowSettings,
  openSummaryModal,
  refresh,
  error,
  selectedCount,
  selectedCutCount,
  selectedCaptionsCount,
}) => {
  return (
    <>
      <header className="topbar">
        <div className="project-info">
          <div className="eyebrow">{detail.project.status}</div>
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
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#fff",
              border: "none",
              padding: "0.45rem 0.9rem",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: detail.candidates.length === 0 ? "not-allowed" : "pointer",
              opacity: detail.candidates.length === 0 ? 0.5 : 1,
            }}
          >
            <Clapperboard size={16} />
            <span>Autoeditar Resumen</span>
          </button>
          <button
            className={`icon-button settings-toggle ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            title="API Settings"
          >
            <SlidersHorizontal size={16} />
            <span>API Settings</span>
          </button>
          <button className="icon-button" onClick={() => void refresh(detail.project.id)} title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="pipeline-strip">
        <PipelineStep icon={<AudioLines size={16} />} label="Transcript" done={Boolean(detail.transcript)} />
        <PipelineStep icon={<Sparkles size={16} />} label="Moments" done={detail.candidates.length > 0} />
        <PipelineStep
          icon={<Scissors size={16} />}
          label="Cut"
          done={selectedCount > 0 && selectedCutCount === selectedCount}
        />
        <PipelineStep
          icon={<Captions size={16} />}
          label="Captions"
          done={selectedCount > 0 && selectedCaptionsCount === selectedCount}
        />
        <PipelineStep
          icon={<Download size={16} />}
          label="Export"
          done={selectedCount > 0 && selectedCutCount === selectedCount}
        />
      </div>
    </>
  );
};
