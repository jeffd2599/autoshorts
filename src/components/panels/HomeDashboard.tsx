import React from "react";
import {
  FileVideo,
  Youtube,
  SlidersHorizontal,
  Clapperboard,
  Loader2,
} from "lucide-react";
import type { Project, BusyState, EnvironmentStatus } from "../../types";
import { fileName, formatTime } from "../../utils/format";

interface HomeDashboardProps {
  projects: Project[];
  busy: BusyState;
  environment: EnvironmentStatus | null;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  importMedia: () => void;
  setYoutubeModalOpen: (val: boolean) => void;
  selectProject: (id: string) => void;
  renameProject: (id: string) => void;
  deleteProject: (id: string) => void;
  settingsNode?: React.ReactNode;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  projects,
  busy,
  environment,
  showSettings,
  setShowSettings,
  importMedia,
  setYoutubeModalOpen,
  selectProject,
  renameProject,
  deleteProject,
  settingsNode,
}) => {
  return (
    <div className="home-dashboard">
      <header className="home-header">
        <div>
          <h2>All Projects</h2>
          <p>Select a project below or import a new media file to get started.</p>
        </div>
        <button className="primary-action compact" onClick={importMedia} disabled={busy !== "idle"}>
          {busy === "import" ? <Loader2 className="spin" size={18} /> : <FileVideo size={18} />}
          Import recording
        </button>
        <button
          className="secondary-action compact"
          onClick={() => setYoutubeModalOpen(true)}
          disabled={busy !== "idle" || !environment?.hasYtdlp}
          title={!environment?.hasYtdlp ? "Please install yt-dlp to use this feature" : "Download a video from YouTube"}
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
            fontSize: "0.95rem",
            marginLeft: "1rem",
          }}
        >
          <Youtube size={18} />
          Import from YouTube
        </button>
        <button
          className={`secondary-action compact ${showSettings ? "active" : ""}`}
          onClick={() => setShowSettings(!showSettings)}
          title="Configuración de Modelos e Inteligencia Artificial"
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: showSettings ? "rgba(16, 185, 129, 0.15)" : "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
            fontSize: "0.95rem",
            marginLeft: "0.75rem",
          }}
        >
          <SlidersHorizontal size={18} />
          Configuración & APIs
        </button>
      </header>

      {showSettings && settingsNode}

      {projects.length > 0 ? (
        <div className="projects-grid">
          {projects.map((project) => {
            const name = project.name || fileName(project.sourcePath);
            return (
              <article key={project.id} className="project-card">
                <div className="project-card-header">
                  <FileVideo size={24} className="project-card-icon" />
                  <span className="project-card-status">{project.status}</span>
                </div>
                <h3 className="project-card-title">{name}</h3>
                <div className="project-card-meta">
                  <span>Duration: {project.sourceDuration ? formatTime(project.sourceDuration) : "Probing..."}</span>
                  <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="project-card-actions">
                  <button className="action-btn open-btn" onClick={() => void selectProject(project.id)}>
                    Open
                  </button>
                  <button className="action-btn rename-btn" onClick={() => void renameProject(project.id)}>
                    Rename
                  </button>
                  <button className="action-btn delete-btn" onClick={() => void deleteProject(project.id)}>
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-dashboard-state">
          <Clapperboard size={48} className="empty-state-icon" />
          <h3>No projects found</h3>
          <p>Import your first recording to begin creating shorts.</p>
        </div>
      )}
    </div>
  );
};
