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
          <h2>Todos los Proyectos</h2>
          <p>Selecciona un proyecto o importa un nuevo video para comenzar.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
          <button className="primary-action compact" onClick={importMedia} disabled={busy !== "idle"}>
            {busy === "import" ? <Loader2 className="spin" size={16} /> : <FileVideo size={16} />}
            <span>Importar Grabación</span>
          </button>
          <button
            className="secondary-action compact"
            onClick={() => setYoutubeModalOpen(true)}
            disabled={busy !== "idle" || !environment?.hasYtdlp}
            title={!environment?.hasYtdlp ? "Instala yt-dlp para habilitar esta función" : "Descargar video desde YouTube"}
          >
            <Youtube size={16} />
            <span>Importar de YouTube</span>
          </button>
          <button
            className={`secondary-action compact ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Configuración de Modelos e Inteligencia Artificial"
            style={{
              background: showSettings ? "var(--bg-surface-hover)" : "var(--bg-surface-raised)",
              borderColor: showSettings ? "var(--border-hover)" : "var(--border-default)",
            }}
          >
            <SlidersHorizontal size={16} />
            <span>Configuración & APIs</span>
          </button>
        </div>
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
                    Abrir
                  </button>
                  <button className="action-btn rename-btn" onClick={() => void renameProject(project.id)}>
                    Renombrar
                  </button>
                  <button className="action-btn delete-btn" onClick={() => void deleteProject(project.id)}>
                    Eliminar
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
