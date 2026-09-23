import React from "react";
import {
  ChevronRight,
  Clapperboard,
  FileVideo,
  Loader2,
  SlidersHorizontal,
  Youtube,
} from "lucide-react";
import { BusyState, Project } from "../../types";
import { fileName } from "../../utils/format";

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onImportMedia: () => Promise<void>;
  onOpenYoutubeModal: () => void;
  busy: BusyState;
  hasYtdlp: boolean;
  showSettings: boolean;
  onToggleSettings: () => void;
}

export function Sidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onImportMedia,
  onOpenYoutubeModal,
  busy,
  hasYtdlp,
  showSettings,
  onToggleSettings,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div
        className="brand-row"
        onClick={() => onSelectProject(null)}
        style={{ cursor: "pointer" }}
        title="Go to Home Dashboard"
      >
        <div className="brand-mark">
          <Clapperboard size={20} />
        </div>
        <div>
          <h1>AutoShorts</h1>
          <p>Long recording in. Short clips out.</p>
        </div>
      </div>

      <button className="primary-action" onClick={onImportMedia} disabled={busy !== "idle"}>
        {busy === "import" ? <Loader2 className="spin" size={18} /> : <FileVideo size={18} />}
        Import recording
      </button>
      <button
        className="secondary-action"
        onClick={onOpenYoutubeModal}
        disabled={busy !== "idle" || !hasYtdlp}
        title={!hasYtdlp ? "Please install yt-dlp to use this feature" : "Download a video from YouTube"}
        style={{
          width: "100%",
          padding: "0.75rem",
          borderRadius: "10px",
          marginTop: "0.5rem",
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--foreground)",
          cursor: "pointer",
          fontSize: "0.95rem"
        }}
      >
        <Youtube size={18} />
        Import from YouTube
      </button>

      <section className="project-list" aria-label="Projects">
        <button
          className={`project-row ${!activeProjectId ? "active" : ""}`}
          onClick={() => onSelectProject(null)}
        >
          <Clapperboard size={15} />
          <span>All Projects</span>
          <ChevronRight size={14} />
        </button>

        {projects.map((project) => (
          <button
            key={project.id}
            className={`project-row ${activeProjectId === project.id ? "active" : ""}`}
            onClick={() => onSelectProject(project.id)}
          >
            <FileVideo size={15} />
            <span>{project.name || fileName(project.sourcePath)}</span>
            <ChevronRight size={14} />
          </button>
        ))}
      </section>

      <div style={{ marginTop: "auto", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
        <button
          type="button"
          className={`project-row ${showSettings ? "active" : ""}`}
          onClick={onToggleSettings}
          title="Configuración de Modelos e IA"
          style={{
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            background: showSettings ? "rgba(16, 185, 129, 0.15)" : "transparent"
          }}
        >
          <SlidersHorizontal size={16} />
          <span>Configuración & APIs</span>
        </button>
      </div>
    </aside>
  );
}
