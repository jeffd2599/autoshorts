import React from "react";
import { AutoEditConfigPanel } from "./AutoEditConfigPanel";
import { AutoEditGalleryPanel } from "./AutoEditGalleryPanel";
import { AutoEditRecord } from "../../../types";

interface AutoEditWorkspaceProps {
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
  autoedits: AutoEditRecord[];
  isLoadingAutoedits: boolean;
  onPlay: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onDelete: (id: string) => void;
  onGenerateCopy: (id: string) => void;
  isGeneratingCopyId: string | null;
}

export const AutoEditWorkspace: React.FC<AutoEditWorkspaceProps> = ({
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
  onCancel,
  autoedits,
  isLoadingAutoedits,
  onPlay,
  onOpenFolder,
  onDelete,
  onGenerateCopy,
  isGeneratingCopyId
}) => {
  return (
    <div className="autoedit-workspace-grid">
      <AutoEditConfigPanel
        formatMode={formatMode}
        setFormatMode={setFormatMode}
        targetDurationMinutes={targetDurationMinutes}
        setTargetDurationMinutes={setTargetDurationMinutes}
        includeTeaser={includeTeaser}
        setIncludeTeaser={setIncludeTeaser}
        trimSilences={trimSilences}
        setTrimSilences={setTrimSilences}
        isRendering={isRendering}
        renderingPercentage={renderingPercentage}
        renderingMessage={renderingMessage}
        onAssemble={onAssemble}
        onCancel={onCancel}
      />

      <AutoEditGalleryPanel
        autoedits={autoedits}
        isLoading={isLoadingAutoedits}
        onPlay={onPlay}
        onOpenFolder={onOpenFolder}
        onDelete={onDelete}
        onGenerateCopy={onGenerateCopy}
        isGeneratingCopyId={isGeneratingCopyId}
      />
    </div>
  );
};
