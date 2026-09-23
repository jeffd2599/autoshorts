import React from "react";
import type { EnvironmentStatus } from "../../types";

interface StatusBarProps {
  environment: EnvironmentStatus | null;
  canUseCloudKey: boolean;
  canUseClaude: boolean;
  canUseDeepseek: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  environment,
  canUseCloudKey,
  canUseClaude,
  canUseDeepseek,
}) => {
  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <span className="app-status-indicator">System Ready</span>
      </div>
      <div className="status-bar-right">
        <div className="status-indicators">
          <span className={`indicator ${environment?.hasFfmpeg ? "active" : ""}`} title="FFmpeg status">
            ffmpeg
          </span>
          <span className={`indicator ${environment?.hasFfprobe ? "active" : ""}`} title="FFprobe status">
            ffprobe
          </span>
          <span className={`indicator ${environment?.hasYtdlp ? "active" : ""}`} title="yt-dlp status">
            yt-dlp
          </span>
          <span className={`indicator ${environment?.hasLocalWhisperModel ? "active" : ""}`} title="Whisper Model status">
            Whisper Model
          </span>
          <span className={`indicator ${environment?.hasOllama ? "active" : ""}`} title="Ollama status">
            Ollama
          </span>
          <span className={`indicator ${canUseCloudKey ? "active" : ""}`} title="Deepgram Key status">
            Deepgram
          </span>
          <span className={`indicator ${canUseClaude ? "active" : ""}`} title="Claude Key status">
            Claude
          </span>
          <span className={`indicator ${canUseDeepseek ? "active" : ""}`} title="DeepSeek Key status">
            DeepSeek
          </span>
        </div>
      </div>
    </footer>
  );
};
