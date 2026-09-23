export type WhisperModel = {
  id: string;
  name: string;
  vram: string;
  speed: string;
  accuracy: string;
  downloaded: boolean;
  recommended: boolean;
  description: string;
};

export type CopyResult = {
  hooks: string[];
  caption: string;
  cta: string;
  hashtags: string[];
  full_copy: string;
};

export type EnvironmentStatus = {
  dataDir: string;
  hasFfmpeg: boolean;
  hasFfprobe: boolean;
  hasDeepgramKey: boolean;
  hasAnthropicKey: boolean;
  hasDeepseekKey: boolean;
  hasGeminiKey: boolean;
  hasOpenaiKey: boolean;
  hasOpenrouterKey: boolean;
  hasGroqKey: boolean;
  llmProvider: string;
  hasLocalWhisperModel: boolean;
  hasOllama: boolean;
  hasYtdlp: boolean;
  installedOllamaModels?: string[];
  whisperModels?: WhisperModel[];
};

export type Project = {
  id: string;
  name: string | null;
  sourcePath: string;
  sourceDuration: number | null;
  status: string;
  transcriptionMode: string;
  captionStyle?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Transcript = {
  id: string;
  projectId: string;
  engine: string;
  rawJson: string;
  language: string | null;
  createdAt: string;
};

export type Candidate = {
  id: string;
  projectId: string;
  startSec: number;
  endSec: number;
  score: number;
  hook: string;
  rationale: string;
  description?: string;
  rank: number;
  selected: boolean;
};

export type Clip = {
  id: string;
  candidateId: string;
  status: string;
  outputPath: string | null;
  faceTrackJson: string | null;
  captionAssPath: string | null;
  renderLog: string | null;
};

export type ProjectDetail = {
  project: Project;
  transcript: Transcript | null;
  candidates: Candidate[];
  clips: Clip[];
};

export type NormalizedTranscript = {
  language: string;
  duration: number;
  speakers: string[];
  segments: Array<{
    start: number;
    end: number;
    speaker: string | null;
    text: string;
  }>;
};

export type BusyState =
  | "idle"
  | "import"
  | "transcribe"
  | "demoTranscript"
  | "moments"
  | "clipCount"
  | "cut";

export type TargetDuration = "30s" | "60s" | "2m" | "3m" | "5m";

export type ContentType = "gaming" | "tutorial" | "podcast" | "general";

export type TranscriptionEngine = "deepgram" | "local";

export type LlmEngine = "claude" | "deepseek" | "local" | "gemini" | "openai" | "openrouter" | "groq";

export type SummaryResult = {
  outputPath: string;
  clipCount: number;
  duration: number;
  filename: string;
  aspectRatio: string;
  narrativeTitle?: string;
  storyline?: string;
  youtubeChapters?: string;
  thumbnailPath?: string;
  thumbnailIdeas?: string[];
  descriptionPath?: string;
};

export type HardwareTelemetry = {
  hasGpu: boolean;
  gpuName: string;
  gpuUsagePercent: number;
  gpuTempC: number;
  vramTotalMb: number;
  vramUsedMb: number;
  vramFreeMb: number;
  vramUsagePercent: number;
  cpuUsagePercent: number;
};

