import React, { useEffect, useMemo, useState } from "react";
import { invoke, open, listen } from "./apiBridge";
import { Loader2 } from "lucide-react";
import type {
  BusyState,
  Candidate,
  Clip,
  ContentType,
  CopyResult,
  EnvironmentStatus,
  HardwareTelemetry,
  LlmEngine,
  NormalizedTranscript,
  Project,
  ProjectDetail,
  SummaryResult,
  TargetDuration,
  Transcript,
  TranscriptionEngine,
  WhisperModel,
} from "./types";
import { fileName } from "./utils/format";

// Sub-components
import { Sidebar } from "./components/panels/Sidebar";
import { WorkspaceHeader } from "./components/panels/WorkspaceHeader";
import { HomeDashboard } from "./components/panels/HomeDashboard";
import { TranscriptPanel } from "./components/panels/TranscriptPanel";
import { CandidatePanel } from "./components/panels/CandidatePanel";
import { StatusBar } from "./components/common/StatusBar";

// Modals
import { SettingsPanel } from "./components/modals/SettingsPanel";
import { StyleModal } from "./components/modals/StyleModal";
import { SocialCopyModal } from "./components/modals/SocialCopyModal";
import { CandidatePreviewModal } from "./components/modals/CandidatePreviewModal";
import { YouTubeImportModal } from "./components/modals/YouTubeImportModal";
import { SummaryModal } from "./components/modals/SummaryModal";
import { OnboardingModal } from "./components/modals/OnboardingModal";
import { ModelDownloadModal } from "./components/modals/ModelDownloadModal";

export function App() {
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [busy, setBusy] = useState<BusyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [renderingCandidateId, setRenderingCandidateId] = useState<string | null>(null);
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("modern-box");
  const [selectedContentType, setSelectedContentType] = useState<ContentType>("gaming");
  const [targetDuration, setTargetDuration] = useState<TargetDuration>(() => {
    return (localStorage.getItem("autoshorts_target_duration") as TargetDuration) || "60s";
  });
  const [copiedDescId, setCopiedDescId] = useState<string | null>(null);
  const [mediaPathToImport, setMediaPathToImport] = useState<string | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<Candidate | null>(null);
  const [customOutputDir, setCustomOutputDir] = useState<string>(() => localStorage.getItem("autoshorts_output_dir") || "");
  const [autoTranscribeOnImport, setAutoTranscribeOnImport] = useState<boolean>(true);
  const [autoDetectMoments, setAutoDetectMoments] = useState<boolean>(false);
  const [refineTranscriptWithLlm, setRefineTranscriptWithLlm] = useState<boolean>(true);
  const [isRefiningTranscript, setIsRefiningTranscript] = useState<boolean>(false);
  const [enableThinking, setEnableThinking] = useState<boolean>(() => {
    return localStorage.getItem("autoshorts_enable_thinking") === "true";
  });
  const [importModalTab, setImportModalTab] = useState<"subtitles" | "ai">("subtitles");

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryTargetMinutes, setSummaryTargetMinutes] = useState<number>(8);
  const [summaryAspectRatio, setSummaryAspectRatio] = useState<"original" | "9:16">("original");
  const [clipAspectRatio, setClipAspectRatio] = useState<"original" | "9:16">("original");
  const [summaryVibe, setSummaryVibe] = useState<"balanced" | "tryhard" | "funny">("balanced");
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "rendering" | "done">("idle");
  const [summaryProgressMsg, setSummaryProgressMsg] = useState<string>("");
  const [copiedChapters, setCopiedChapters] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);

  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [isSavingTrim, setIsSavingTrim] = useState(false);

  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeStatus, setYoutubeStatus] = useState<"idle" | "checking" | "warning" | "downloading">("idle");
  const [youtubeWarningLicense, setYoutubeWarningLicense] = useState<string | null>(null);

  // Persistence logic from localStorage / config
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [transcriptionEngine, setTranscriptionEngine] = useState<TranscriptionEngine>(() => {
    return (localStorage.getItem("autoshorts_transcription_engine") as TranscriptionEngine) || "local";
  });
  const [llmEngine, setLlmEngine] = useState<LlmEngine>(() => {
    return (localStorage.getItem("autoshorts_llm_engine") as LlmEngine) || "local";
  });
  const [localLlmModel, setLocalLlmModel] = useState(() => {
    return localStorage.getItem("autoshorts_local_llm_model") || "llama3.2";
  });
  const [deepgramKey, setDeepgramKey] = useState(() => {
    return localStorage.getItem("autoshorts_deepgram_key") || "";
  });
  const [anthropicKey, setAnthropicKey] = useState(() => {
    return localStorage.getItem("autoshorts_anthropic_key") || "";
  });
  const [deepseekKey, setDeepseekKey] = useState(() => {
    return localStorage.getItem("autoshorts_deepseek_key") || "";
  });
  const [deepseekModel, setDeepseekModel] = useState(() => {
    return localStorage.getItem("autoshorts_deepseek_model") || "";
  });
  const [geminiKey, setGeminiKey] = useState(() => {
    return localStorage.getItem("autoshorts_gemini_key") || "";
  });
  const [openaiKey, setOpenaiKey] = useState(() => {
    return localStorage.getItem("autoshorts_openai_key") || "";
  });
  const [openrouterKey, setOpenrouterKey] = useState(() => {
    return localStorage.getItem("autoshorts_openrouter_key") || "";
  });
  const [groqKey, setGroqKey] = useState(() => {
    return localStorage.getItem("autoshorts_groq_key") || "";
  });
  const [openrouterModel, setOpenrouterModel] = useState(() => {
    return localStorage.getItem("autoshorts_openrouter_model") || "";
  });

  const [whisperModel, setWhisperModel] = useState<string>(() => {
    return localStorage.getItem("autoshorts_whisper_model") || "large-v3-turbo";
  });
  const [whisperModelsList, setWhisperModelsList] = useState<WhisperModel[]>([]);
  const [customMomentsPrompt, setCustomMomentsPrompt] = useState<string>(() => {
    return localStorage.getItem("autoshorts_custom_moments_prompt") || "";
  });
  const [defaultMomentsPrompt, setDefaultMomentsPrompt] = useState<string>("");

  const [showCopyModal, setShowCopyModal] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyExtraContext, setCopyExtraContext] = useState<string>("");

  const [pullInputModel, setPullInputModel] = useState("");
  const [downloadingModelName, setDownloadingModelName] = useState<string | null>(null);
  const [modelDownloadStatus, setModelDownloadStatus] = useState("");
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0);
  const [candidateProgress, setCandidateProgress] = useState<{ message: string; current: number; total: number } | null>(null);
  const [transcriptionProgress, setTranscriptionProgress] = useState<{ percentage: number; message: string } | null>(null);
  const [telemetry, setTelemetry] = useState<HardwareTelemetry | null>(null);

  const syncConfig = (updates: Record<string, any>) => {
    void invoke("save_app_config", updates);
  };

  const transcript = useMemo(() => {
    if (!detail?.transcript) return null;
    try {
      return JSON.parse(detail.transcript.rawJson) as NormalizedTranscript;
    } catch {
      return null;
    }
  }, [detail?.transcript]);

  const selectedCount = detail?.candidates.filter((candidate) => candidate.selected).length ?? 0;
  const clipByCandidate = useMemo(() => {
    return new Map(detail?.clips.map((clip) => [clip.candidateId, clip]) ?? []);
  }, [detail?.clips]);
  const selectedCandidates = detail?.candidates.filter((candidate) => candidate.selected) ?? [];
  const selectedCutCount = selectedCandidates.filter((candidate) => {
    const clip = clipByCandidate.get(candidate.id);
    return clip?.status === "done" && Boolean(clip.outputPath);
  }).length;
  const selectedCaptionsCount = selectedCandidates.filter((candidate) => {
    const clip = clipByCandidate.get(candidate.id);
    return clip?.status === "done" && Boolean(clip.captionAssPath);
  }).length;

  const canUseCloudKey = Boolean(environment?.hasDeepgramKey || deepgramKey.trim().length > 0);
  const canUseClaude = Boolean(environment?.hasAnthropicKey || anthropicKey.trim().length > 0);
  const canUseDeepseek = Boolean(environment?.hasDeepseekKey || deepseekKey.trim().length > 0);
  const canUseGemini = Boolean(environment?.hasGeminiKey || geminiKey.trim().length > 0);
  const canUseOpenai = Boolean(environment?.hasOpenaiKey || openaiKey.trim().length > 0);
  const canUseOpenrouter = Boolean(environment?.hasOpenrouterKey || openrouterKey.trim().length > 0);
  const canUseGroq = Boolean(environment?.hasGroqKey || groqKey.trim().length > 0);

  const canTranscribe =
    transcriptionEngine === "local"
      ? Boolean(environment?.hasLocalWhisperModel)
      : canUseCloudKey;

  const canUseActiveLlm =
    llmEngine === "local"
      ? Boolean(environment?.hasOllama)
      : llmEngine === "claude"
      ? canUseClaude
      : llmEngine === "deepseek"
      ? canUseDeepseek
      : llmEngine === "gemini"
      ? canUseGemini
      : llmEngine === "openai"
      ? canUseOpenai
      : llmEngine === "openrouter"
      ? canUseOpenrouter
      : llmEngine === "groq"
      ? canUseGroq
      : false;

  useEffect(() => {
    void refresh();

    invoke<WhisperModel[]>("get_whisper_models")
      .then((models) => {
        if (Array.isArray(models) && models.length > 0) {
          setWhisperModelsList(models);
          const saved = localStorage.getItem("autoshorts_whisper_model");
          if (!saved) {
            const rec =
              models.find((m) => m.downloaded && m.id === "large-v3-turbo") ||
              models.find((m) => m.downloaded) ||
              models[0];
            if (rec) setWhisperModel(rec.id);
          }
        }
      })
      .catch(console.error);

    invoke<any>("get_default_moments_prompt")
      .then((prompt) => {
        if (typeof prompt === "string") {
          setDefaultMomentsPrompt(prompt);
        } else if (prompt && typeof prompt === "object" && typeof prompt.defaultPrompt === "string") {
          setDefaultMomentsPrompt(prompt.defaultPrompt);
        }
      })
      .catch(console.error);

    invoke<any>("get_app_config")
      .then((cfg) => {
        const localOnboarded = localStorage.getItem("autoshorts_onboarded");
        if (cfg?.onboarded || localOnboarded === "true") {
          setIsOnboarded(true);
          if (cfg?.transcriptionEngine) setTranscriptionEngine(cfg.transcriptionEngine);
          if (cfg?.whisperModel) setWhisperModel(cfg.whisperModel);
          if (cfg?.customMomentsPrompt !== undefined) setCustomMomentsPrompt(cfg.customMomentsPrompt);
          if (cfg?.llmEngine) setLlmEngine(cfg.llmEngine);
          if (cfg?.localLlmModel) setLocalLlmModel(cfg.localLlmModel);
          if (cfg?.deepseekKey) setDeepseekKey(cfg.deepseekKey);
          if (cfg?.deepseekModel) setDeepseekModel(cfg.deepseekModel);
          if (cfg?.anthropicKey) setAnthropicKey(cfg.anthropicKey);
          if (cfg?.openrouterKey) setOpenrouterKey(cfg.openrouterKey);
          if (cfg?.openrouterModel) setOpenrouterModel(cfg.openrouterModel);
          if (cfg?.deepgramKey) setDeepgramKey(cfg.deepgramKey);
          if (cfg?.openaiKey) setOpenaiKey(cfg.openaiKey);
          if (cfg?.groqKey) setGroqKey(cfg.groqKey);
          if (cfg?.geminiKey) setGeminiKey(cfg.geminiKey);
        } else {
          setIsOnboarded(false);
        }
      })
      .catch(() => {
        const value = localStorage.getItem("autoshorts_onboarded");
        setIsOnboarded(value === "true");
      });

    let unlistenProgress: (() => void) | null = null;
    void listen<{ message: string; current: number; total: number }>("candidate-progress", (event) => {
      setCandidateProgress(event.payload);
    }).then((unsub) => {
      unlistenProgress = unsub;
    });

    let unlistenTranscribe: (() => void) | null = null;
    void listen<{ percentage: number; message: string }>("transcription-progress", (event) => {
      setTranscriptionProgress(event.payload);
    }).then((unsub) => {
      unlistenTranscribe = unsub;
    });

    let unlistenSummary: (() => void) | null = null;
    void listen<{ status: string; message: string; percentage: number }>("summary-progress", (event) => {
      setSummaryProgressMsg(event.payload.message);
    }).then((unsub) => {
      unlistenSummary = unsub;
    });

    const fetchTelemetry = () => {
      invoke<HardwareTelemetry>("get_hardware_telemetry")
        .then((data) => {
          if (data && typeof data === "object") setTelemetry(data);
        })
        .catch(() => {});
    };
    fetchTelemetry();
    const intervalTelemetry = setInterval(fetchTelemetry, 2500);

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenTranscribe) unlistenTranscribe();
      if (unlistenSummary) unlistenSummary();
      clearInterval(intervalTelemetry);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("autoshorts_whisper_model", whisperModel);
    syncConfig({ whisperModel });
  }, [whisperModel]);

  useEffect(() => {
    localStorage.setItem("autoshorts_custom_moments_prompt", customMomentsPrompt);
    syncConfig({ customMomentsPrompt });
  }, [customMomentsPrompt]);

  useEffect(() => {
    localStorage.setItem("autoshorts_transcription_engine", transcriptionEngine);
    syncConfig({ transcriptionEngine });
  }, [transcriptionEngine]);

  useEffect(() => {
    localStorage.setItem("autoshorts_llm_engine", llmEngine);
    syncConfig({ llmEngine });
  }, [llmEngine]);

  useEffect(() => {
    localStorage.setItem("autoshorts_local_llm_model", localLlmModel);
    syncConfig({ localLlmModel });
  }, [localLlmModel]);

  useEffect(() => {
    if (environment?.installedOllamaModels && environment.installedOllamaModels.length > 0) {
      const installed = environment.installedOllamaModels;
      if (!installed.includes(localLlmModel)) {
        const preferred =
          installed.find((m) => m.includes("qwen3.5") || m.includes("qwen2.5") || m.includes("qwen")) ||
          installed[0];
        setLocalLlmModel(preferred);
        syncConfig({ localLlmModel: preferred });
      }
    }
  }, [environment?.installedOllamaModels]);

  useEffect(() => {
    localStorage.setItem("autoshorts_deepgram_key", deepgramKey);
    syncConfig({ deepgramKey });
  }, [deepgramKey]);

  useEffect(() => {
    localStorage.setItem("autoshorts_anthropic_key", anthropicKey);
    syncConfig({ anthropicKey });
  }, [anthropicKey]);

  useEffect(() => {
    localStorage.setItem("autoshorts_deepseek_key", deepseekKey);
    syncConfig({ deepseekKey });
  }, [deepseekKey]);

  useEffect(() => {
    localStorage.setItem("autoshorts_deepseek_model", deepseekModel);
    syncConfig({ deepseekModel });
  }, [deepseekModel]);

  useEffect(() => {
    localStorage.setItem("autoshorts_gemini_key", geminiKey);
    syncConfig({ geminiKey });
  }, [geminiKey]);

  useEffect(() => {
    localStorage.setItem("autoshorts_openai_key", openaiKey);
    syncConfig({ openaiKey });
  }, [openaiKey]);

  useEffect(() => {
    localStorage.setItem("autoshorts_openrouter_key", openrouterKey);
    syncConfig({ openrouterKey });
  }, [openrouterKey]);

  useEffect(() => {
    localStorage.setItem("autoshorts_groq_key", groqKey);
    syncConfig({ groqKey });
  }, [groqKey]);

  useEffect(() => {
    localStorage.setItem("autoshorts_openrouter_model", openrouterModel);
    syncConfig({ openrouterModel });
  }, [openrouterModel]);

  async function generateSocialCopy(extraContextOverride?: string) {
    if (!detail) return;
    setIsGeneratingCopy(true);
    setError(null);
    try {
      const activeLlmKey =
        llmEngine === "claude"
          ? anthropicKey.trim()
          : llmEngine === "deepseek"
          ? deepseekKey.trim()
          : llmEngine === "gemini"
          ? geminiKey.trim()
          : llmEngine === "openai"
          ? openaiKey.trim()
          : llmEngine === "openrouter"
          ? openrouterKey.trim()
          : llmEngine === "groq"
          ? groqKey.trim()
          : "";
      const activeLlmModel =
        llmEngine === "local"
          ? localLlmModel.trim()
          : llmEngine === "deepseek"
          ? deepseekModel.trim() || null
          : llmEngine === "openrouter"
          ? openrouterModel.trim() || null
          : null;

      const res = await invoke<CopyResult>("generate_project_copy", {
        projectId: detail.project.id,
        provider: llmEngine,
        modelName: activeLlmModel,
        apiKey: activeLlmKey || null,
        enableThinking,
        extraContext: (extraContextOverride !== undefined ? extraContextOverride : copyExtraContext).trim() || null,
      });
      setCopyResult(res);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingCopy(false);
    }
  }

  function copyTextToClipboard(key: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => {
      setCopiedField((curr) => (curr === key ? null : curr));
    }, 2000);
  }

  const pullModelDirectly = async (modelName: string) => {
    setDownloadingModelName(modelName);
    setModelDownloadProgress(0);
    setModelDownloadStatus("Connecting to Ollama...");
    try {
      const unlisten = await listen<{
        status: string;
        completed?: number;
        total?: number;
        percentage?: number;
      }>("ollama-pull-progress", (event) => {
        const payload = event.payload;
        setModelDownloadStatus(payload.status);
        if (payload.percentage !== undefined && payload.percentage !== null) {
          setModelDownloadProgress(Math.round(payload.percentage));
        }
      });

      await invoke("pull_ollama_model", { modelName });
      unlisten();
      setModelDownloadStatus("Download complete!");
      setModelDownloadProgress(100);
      setTimeout(() => setDownloadingModelName(null), 500);
    } catch (err) {
      alert("Failed to download model: " + String(err));
      setDownloadingModelName(null);
    }
  };

  async function refresh(nextProjectId?: string) {
    setError(null);
    const [env, projectList] = await Promise.all([
      invoke<EnvironmentStatus>("environment_status"),
      invoke<Project[]>("list_projects"),
    ]);
    setEnvironment(env);
    setProjects(projectList);

    if (nextProjectId) {
      const nextDetail = await invoke<ProjectDetail>("get_project_detail", { projectId: nextProjectId });
      setDetail(nextDetail);
    } else {
      setDetail(null);
    }
  }

  async function run(action: BusyState, task: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("idle");
    }
  }

  async function importMedia() {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Media",
          extensions: ["mp4", "mov", "mp3", "wav", "m4a"],
        },
      ],
    });
    if (typeof selected !== "string") return;
    setMediaPathToImport(selected);
    setImportModalTab("subtitles");
    setShowStyleModal(true);
  }

  async function handleYoutubeImport() {
    if (!youtubeUrl) return;
    setYoutubeStatus("checking");
    setError(null);
    try {
      const result = await invoke<{ isSafe: boolean; license: string | null }>("check_youtube_copyright", {
        url: youtubeUrl,
      });
      if (!result.isSafe) {
        setYoutubeWarningLicense(result.license || "Unknown / Not specified");
        setYoutubeStatus("warning");
        return;
      }
      await executeYoutubeDownload();
    } catch (err: any) {
      setError(err.toString());
      setYoutubeStatus("idle");
    }
  }

  async function executeYoutubeDownload() {
    setYoutubeStatus("downloading");
    setError(null);
    try {
      const downloadedPath = await invoke<string>("download_youtube_video", { url: youtubeUrl });
      setYoutubeModalOpen(false);
      setYoutubeUrl("");
      setYoutubeStatus("idle");
      setMediaPathToImport(downloadedPath);
      setImportModalTab("subtitles");
      setShowStyleModal(true);
    } catch (err: any) {
      setError(err.toString());
      setYoutubeStatus("idle");
    }
  }

  async function confirmImport(
    style: string,
    contentType: ContentType = selectedContentType,
    dur: TargetDuration = targetDuration
  ) {
    if (!mediaPathToImport) return;
    const selected = mediaPathToImport;
    setMediaPathToImport(null);
    setShowStyleModal(false);

    let newProjectId: string | null = null;
    await run("import", async () => {
      const project = await invoke<Project>("create_project_from_path", {
        path: selected,
        transcriptionMode: transcriptionEngine === "local" ? "local" : "cloud",
        captionStyle: style,
      });
      newProjectId = project.id;
      await refresh(project.id);
    });

    if (newProjectId && autoTranscribeOnImport) {
      await runAutoPipeline(newProjectId, contentType, dur);
    }
  }

  async function runAutoPipeline(
    projectId: string,
    contentType: string = selectedContentType,
    durationTarget: TargetDuration = targetDuration
  ) {
    setError(null);
    const env = await invoke<EnvironmentStatus>("environment_status");

    if (transcriptionEngine === "local") {
      if (!env.hasLocalWhisperModel) {
        setError(
          "Import successful. Local Whisper model is missing in your models directory. Please add it to start transcription."
        );
        return;
      }
    } else {
      const hasDG = env.hasDeepgramKey || deepgramKey.trim().length > 0;
      if (!hasDG) {
        setError("Import successful. Deepgram key is missing. Please add it to start transcription.");
        return;
      }
    }

    if (llmEngine === "local") {
      if (!env.hasOllama) {
        setError("Import successful. Local Ollama server is not running at http://localhost:11434. Please start it to find viral moments.");
        return;
      }
    } else {
      const activeKey =
        llmEngine === "claude"
          ? anthropicKey
          : llmEngine === "deepseek"
          ? deepseekKey
          : llmEngine === "gemini"
          ? geminiKey
          : llmEngine === "openai"
          ? openaiKey
          : llmEngine === "openrouter"
          ? openrouterKey
          : llmEngine === "groq"
          ? groqKey
          : "";
      const hasActiveKey =
        llmEngine === "claude"
          ? env.hasAnthropicKey || activeKey.trim().length > 0
          : llmEngine === "deepseek"
          ? env.hasDeepseekKey || activeKey.trim().length > 0
          : llmEngine === "gemini"
          ? env.hasGeminiKey || activeKey.trim().length > 0
          : llmEngine === "openai"
          ? env.hasOpenaiKey || activeKey.trim().length > 0
          : llmEngine === "openrouter"
          ? env.hasOpenrouterKey || activeKey.trim().length > 0
          : llmEngine === "groq"
          ? env.hasGroqKey || activeKey.trim().length > 0
          : false;
      if (!hasActiveKey) {
        const engineName =
          llmEngine === "claude"
            ? "Claude"
            : llmEngine === "deepseek"
            ? "DeepSeek"
            : llmEngine === "gemini"
            ? "Gemini"
            : llmEngine === "openai"
            ? "OpenAI"
            : llmEngine === "openrouter"
            ? "OpenRouter"
            : llmEngine === "groq"
            ? "Groq"
            : "LLM";
        setError(`Transcription complete. ${engineName} API Key is missing. Please add it in settings to analyze viral moments.`);
        return;
      }
    }

    // 1. Transcription
    try {
      setBusy("transcribe");
      const activeLlmKey =
        llmEngine === "claude"
          ? anthropicKey.trim()
          : llmEngine === "deepseek"
          ? deepseekKey.trim()
          : llmEngine === "gemini"
          ? geminiKey.trim()
          : llmEngine === "openai"
          ? openaiKey.trim()
          : llmEngine === "openrouter"
          ? openrouterKey.trim()
          : llmEngine === "groq"
          ? groqKey.trim()
          : "";
      const activeLlmModel =
        llmEngine === "local"
          ? localLlmModel.trim()
          : llmEngine === "deepseek"
          ? deepseekModel.trim() || null
          : llmEngine === "openrouter"
          ? openrouterModel.trim() || null
          : null;

      await invoke<Transcript>("transcribe_project", {
        projectId,
        provider: transcriptionEngine,
        apiKey: transcriptionEngine === "deepgram" ? deepgramKey.trim() || null : null,
        whisperModel,
        refineWithLlm: refineTranscriptWithLlm,
        llmEngine,
        llmModel: activeLlmModel,
        llmApiKey: activeLlmKey || null,
        enableThinking,
      });
      await refresh(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy("idle");
      return;
    }

    // 2. LLM Moments
    if (!autoDetectMoments) {
      setBusy("idle");
      return;
    }

    try {
      setBusy("moments");
      const activeKey =
        llmEngine === "claude"
          ? anthropicKey.trim()
          : llmEngine === "deepseek"
          ? deepseekKey.trim()
          : llmEngine === "gemini"
          ? geminiKey.trim()
          : llmEngine === "openai"
          ? openaiKey.trim()
          : llmEngine === "openrouter"
          ? openrouterKey.trim()
          : llmEngine === "groq"
          ? groqKey.trim()
          : "";
      await invoke<Candidate[]>("generate_candidates", {
        projectId,
        apiKey: activeKey || null,
        provider: llmEngine,
        modelName:
          llmEngine === "local"
            ? localLlmModel.trim()
            : llmEngine === "deepseek"
            ? deepseekModel.trim() || null
            : llmEngine === "openrouter"
            ? openrouterModel.trim() || null
            : null,
        contentType,
        targetDuration: durationTarget,
        allowDemo: false,
        enableThinking,
        customPrompt: customMomentsPrompt.trim() || null,
      });
      await refresh(projectId);
    } catch (err) {
      const errMsg = String(err);
      if (llmEngine === "local" && (errMsg.includes("not found") || errMsg.includes("404"))) {
        if (window.confirm(`Ollama model "${localLlmModel}" is not downloaded. Would you like to download it now?`)) {
          setTimeout(() => {
            void pullModelDirectly(localLlmModel).then(() => {
              void refresh(projectId);
            });
          }, 100);
          return;
        }
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("idle");
    }
  }

  async function renameProject(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const currentName = project.name || fileName(project.sourcePath);
    const newName = window.prompt("Rename Project:", currentName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      await invoke("rename_project", { projectId, name: trimmed });
      await refresh(detail?.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteProject(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const name = project.name || fileName(project.sourcePath);
    if (!window.confirm(`Are you sure you want to delete the project "${name}"?`)) return;

    try {
      await invoke("delete_project", { projectId });
      const nextActiveId = detail?.project.id === projectId ? null : detail?.project.id;
      await refresh(nextActiveId ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleProjectCompleted(projectId: string) {
    try {
      await invoke("toggle_project_completed", { projectId });
      await refresh(detail?.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function selectProject(projectId: string) {
    await run("idle", async () => {
      const nextDetail = await invoke<ProjectDetail>("get_project_detail", { projectId });
      setDetail(nextDetail);
    });
  }

  async function transcribe() {
    if (!detail) return;
    await run("transcribe", async () => {
      const activeLlmKey =
        llmEngine === "claude"
          ? anthropicKey.trim()
          : llmEngine === "deepseek"
          ? deepseekKey.trim()
          : llmEngine === "gemini"
          ? geminiKey.trim()
          : llmEngine === "openai"
          ? openaiKey.trim()
          : llmEngine === "openrouter"
          ? openrouterKey.trim()
          : llmEngine === "groq"
          ? groqKey.trim()
          : "";
      const activeLlmModel =
        llmEngine === "local"
          ? localLlmModel.trim()
          : llmEngine === "deepseek"
          ? deepseekModel.trim() || null
          : llmEngine === "openrouter"
          ? openrouterModel.trim() || null
          : null;

      await invoke<Transcript>("transcribe_project", {
        projectId: detail.project.id,
        provider: transcriptionEngine,
        apiKey: transcriptionEngine === "deepgram" ? deepgramKey.trim() || null : null,
        whisperModel,
        refineWithLlm: refineTranscriptWithLlm,
        llmEngine,
        llmModel: activeLlmModel,
        llmApiKey: activeLlmKey || null,
        enableThinking,
      });
      await refresh(detail.project.id);
    });
  }

  async function refineTranscript() {
    if (!detail?.transcript) return;
    try {
      setIsRefiningTranscript(true);
      setError(null);
      const activeLlmKey =
        llmEngine === "claude"
          ? anthropicKey.trim()
          : llmEngine === "deepseek"
          ? deepseekKey.trim()
          : llmEngine === "gemini"
          ? geminiKey.trim()
          : llmEngine === "openai"
          ? openaiKey.trim()
          : llmEngine === "openrouter"
          ? openrouterKey.trim()
          : llmEngine === "groq"
          ? groqKey.trim()
          : "";
      const activeLlmModel =
        llmEngine === "local"
          ? localLlmModel.trim()
          : llmEngine === "deepseek"
          ? deepseekModel.trim() || null
          : llmEngine === "openrouter"
          ? openrouterModel.trim() || null
          : null;

      await invoke("refine_project_transcript", {
        projectId: detail.project.id,
        provider: llmEngine,
        modelName: activeLlmModel,
        apiKey: activeLlmKey || null,
        enableThinking,
      });
      await refresh(detail.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRefiningTranscript(false);
      setCandidateProgress(null);
    }
  }

  const copyDescription = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedDescId(id);
    setTimeout(() => {
      setCopiedDescId((curr) => (curr === id ? null : curr));
    }, 2500);
  };

  async function cancelTranscription() {
    try {
      await invoke("cancel_transcription");
      setCandidateProgress({ message: "Cancelando transcripción...", current: 0, total: 1 });
      setTimeout(() => {
        setBusy("idle");
        setCandidateProgress(null);
        if (detail) {
          void refresh(detail.project.id);
        }
      }, 400);
    } catch (err) {
      console.error("Error al cancelar transcripción:", err);
      setBusy("idle");
      setCandidateProgress(null);
    }
  }

  async function cancelMoments() {
    try {
      await invoke("cancel_candidate_generation");
      setCandidateProgress({ message: "Cancelando y liberando VRAM...", current: 0, total: 1 });
      setTimeout(() => {
        setBusy("idle");
        setCandidateProgress(null);
        if (detail) {
          void refresh(detail.project.id);
        }
      }, 500);
    } catch (err) {
      console.error("Error al cancelar momentos:", err);
      setBusy("idle");
      setCandidateProgress(null);
    }
  }

  async function moments(allowDemo: boolean = false) {
    if (!detail) return;
    await run("moments", async () => {
      const activeKey =
        llmEngine === "claude"
          ? anthropicKey.trim()
          : llmEngine === "deepseek"
          ? deepseekKey.trim()
          : llmEngine === "gemini"
          ? geminiKey.trim()
          : llmEngine === "openai"
          ? openaiKey.trim()
          : llmEngine === "openrouter"
          ? openrouterKey.trim()
          : llmEngine === "groq"
          ? groqKey.trim()
          : "";
      try {
        await invoke<Candidate[]>("generate_candidates", {
          projectId: detail.project.id,
          apiKey: activeKey || null,
          provider: llmEngine,
          modelName:
            llmEngine === "local"
              ? localLlmModel.trim()
              : llmEngine === "deepseek"
              ? deepseekModel.trim() || null
              : llmEngine === "openrouter"
              ? openrouterModel.trim() || null
              : null,
          contentType: selectedContentType,
          targetDuration,
          allowDemo,
          enableThinking,
          customPrompt: customMomentsPrompt.trim() || null,
        });
        await refresh(detail.project.id);
      } catch (err) {
        const errMsg = String(err);
        if (llmEngine === "local" && (errMsg.includes("not found") || errMsg.includes("404"))) {
          if (window.confirm(`Ollama model "${localLlmModel}" is not downloaded. Would you like to download it now?`)) {
            setTimeout(() => {
              void pullModelDirectly(localLlmModel).then(() => {
                void refresh(detail.project.id);
              });
            }, 100);
            return;
          }
        }
        throw err;
      }
    });
  }

  function openCandidatePreview(candidate: Candidate) {
    setPreviewCandidate(candidate);
    setTrimStart(candidate.startSec);
    setTrimEnd(candidate.endSec);
  }

  async function saveCandidateTrim() {
    if (!previewCandidate || !detail) return;
    try {
      setIsSavingTrim(true);
      const updated = await invoke<Candidate>("update_candidate_trim", {
        candidateId: previewCandidate.id,
        startSec: trimStart,
        endSec: trimEnd,
      });
      setPreviewCandidate(updated);
      await refresh(detail.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingTrim(false);
    }
  }

  async function generateSummary() {
    if (!detail) return;
    try {
      setSummaryStatus("rendering");
      setSummaryProgressMsg("Iniciando análisis de guión con IA...");
      const res = await invoke<SummaryResult>("render_auto_summary", {
        projectId: detail.project.id,
        targetDurationMinutes: summaryTargetMinutes,
        aspectRatio: summaryAspectRatio,
        summaryVibe,
        outputDir: customOutputDir || null,
      });
      setSummaryResult(res);
      setSummaryStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSummaryStatus("idle");
    }
  }

  async function updateClipCount(count: number) {
    if (!detail) return;
    await run("clipCount", async () => {
      const candidates = await invoke<Candidate[]>("set_selected_clip_count", {
        projectId: detail.project.id,
        count,
      });
      setDetail({ ...detail, candidates });
    });
  }

  async function cutCandidate(candidateId: string) {
    if (!detail) return;
    setRenderingCandidateId(candidateId);
    setBusy("cut");
    setError(null);
    try {
      await invoke<string>("render_flat_clip_for_candidate", {
        candidateId,
        outputDir: customOutputDir || null,
        aspectRatio: clipAspectRatio,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenderingCandidateId(null);
      setBusy("idle");
      await refresh(detail.project.id);
    }
  }

  async function cutSelected() {
    if (!detail) return;
    setBusy("cut");
    setError(null);
    try {
      for (const candidate of selectedCandidates) {
        setRenderingCandidateId(candidate.id);
        await invoke<string>("render_flat_clip_for_candidate", {
          candidateId: candidate.id,
          outputDir: customOutputDir || null,
          aspectRatio: clipAspectRatio,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenderingCandidateId(null);
      setBusy("idle");
      await refresh(detail.project.id);
    }
  }

  const handleResetConfig = () => {
    if (window.confirm("¿Seguro que deseas reiniciar la configuración y volver al asistente inicial?")) {
      localStorage.clear();
      void invoke("save_app_config", { onboarded: false });
      setIsOnboarded(false);
      setShowSettings(false);
    }
  };

  if (isOnboarded === null) {
    return (
      <div
        className="onboarding-loading"
        style={{ display: "grid", placeItems: "center", height: "100vh", background: "var(--bg-base)" }}
      >
        <Loader2 className="spin" size={32} color="var(--accent-primary)" />
      </div>
    );
  }

  if (isOnboarded === false) {
    return (
      <OnboardingModal
        environment={environment}
        onComplete={() => {
          localStorage.setItem("autoshorts_onboarded", "true");
          void invoke("save_app_config", { onboarded: true });
          setIsOnboarded(true);
        }}
        setTranscriptionEngine={setTranscriptionEngine}
        setLlmEngine={setLlmEngine}
        setLocalLlmModel={setLocalLlmModel}
        setDeepgramKey={setDeepgramKey}
        setAnthropicKey={setAnthropicKey}
        setDeepseekKey={setDeepseekKey}
        setGroqKey={setGroqKey}
        deepgramKey={deepgramKey}
        anthropicKey={anthropicKey}
        deepseekKey={deepseekKey}
        groqKey={groqKey}
        refreshEnv={() => refresh()}
      />
    );
  }

  const settingsNode = (
    <SettingsPanel
      isOpen={showSettings}
      onClose={() => setShowSettings(false)}
      telemetry={telemetry}
      transcriptionEngine={transcriptionEngine}
      setTranscriptionEngine={setTranscriptionEngine}
      whisperModel={whisperModel}
      setWhisperModel={setWhisperModel}
      whisperModelsList={whisperModelsList}
      llmEngine={llmEngine}
      setLlmEngine={setLlmEngine}
      localLlmModel={localLlmModel}
      setLocalLlmModel={setLocalLlmModel}
      enableThinking={enableThinking}
      setEnableThinking={setEnableThinking}
      environment={environment}
      onRefreshEnv={() => refresh(detail?.project.id)}
      pullInputModel={pullInputModel}
      setPullInputModel={setPullInputModel}
      downloadingModelName={downloadingModelName}
      modelDownloadStatus={modelDownloadStatus}
      modelDownloadProgress={modelDownloadProgress}
      onPullModel={pullModelDirectly}
      openrouterKey={openrouterKey}
      setOpenrouterKey={setOpenrouterKey}
      openrouterModel={openrouterModel}
      setOpenrouterModel={setOpenrouterModel}
      deepseekKey={deepseekKey}
      setDeepseekKey={setDeepseekKey}
      deepseekModel={deepseekModel}
      setDeepseekModel={setDeepseekModel}
      anthropicKey={anthropicKey}
      setAnthropicKey={setAnthropicKey}
      openaiKey={openaiKey}
      setOpenaiKey={setOpenaiKey}
      groqKey={groqKey}
      setGroqKey={setGroqKey}
      geminiKey={geminiKey}
      setGeminiKey={setGeminiKey}
      deepgramKey={deepgramKey}
      setDeepgramKey={setDeepgramKey}
      customMomentsPrompt={customMomentsPrompt}
      setCustomMomentsPrompt={setCustomMomentsPrompt}
      defaultMomentsPrompt={defaultMomentsPrompt}
      syncConfig={syncConfig}
      onResetConfig={handleResetConfig}
    />
  );

  return (
    <div className="app-shell-container">
      <main className="app-shell">
        <Sidebar
          projects={projects}
          activeProjectId={detail?.project.id ?? null}
          busy={busy}
          hasYtdlp={Boolean(environment?.hasYtdlp)}
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings(!showSettings)}
          onSelectProject={(id) => {
            if (id) void selectProject(id);
            else setDetail(null);
          }}
          onImportMedia={importMedia}
          onOpenYoutubeModal={() => setYoutubeModalOpen(true)}
        />

        <section className="workspace">
          {detail ? (
            <>
              <WorkspaceHeader
                detail={detail}
                showSettings={showSettings}
                setShowSettings={setShowSettings}
                openSummaryModal={() => {
                  setShowSummaryModal(true);
                  setSummaryStatus("idle");
                  setSummaryProgressMsg("");
                }}
                refresh={refresh}
                toggleProjectCompleted={toggleProjectCompleted}
                error={error}
                selectedCount={selectedCount}
                selectedCutCount={selectedCutCount}
                selectedCaptionsCount={selectedCaptionsCount}
              />

              {showSettings && settingsNode}

              <div className="work-grid">
                <TranscriptPanel
                  detail={detail}
                  transcript={transcript}
                  busy={busy}
                  transcriptionEngine={transcriptionEngine}
                  canTranscribe={canTranscribe}
                  isGeneratingCopy={isGeneratingCopy}
                  isRefiningTranscript={isRefiningTranscript}
                  transcriptionProgress={transcriptionProgress}
                  onTranscribe={transcribe}
                  onCancelTranscription={cancelTranscription}
                  onRefineTranscript={refineTranscript}
                  onOpenCopyModal={() => {
                    setShowCopyModal(true);
                    if (!copyResult && !isGeneratingCopy) {
                      void generateSocialCopy();
                    }
                  }}
                />

                <CandidatePanel
                  detail={detail}
                  selectedCount={selectedCount}
                  llmEngine={llmEngine}
                  localLlmModel={localLlmModel}
                  busy={busy}
                  environment={environment}
                  canUseActiveLlm={canUseActiveLlm}
                  targetDuration={targetDuration}
                  setTargetDuration={setTargetDuration}
                  enableThinking={enableThinking}
                  setEnableThinking={setEnableThinking}
                  cutSelected={cutSelected}
                  cancelMoments={cancelMoments}
                  moments={moments}
                  updateClipCount={updateClipCount}
                  clipByCandidate={clipByCandidate}
                  copiedDescId={copiedDescId}
                  copyDescription={copyDescription}
                  openCandidatePreview={openCandidatePreview}
                  cutCandidate={cutCandidate}
                  renderingCandidateId={renderingCandidateId}
                  candidateProgress={candidateProgress}
                  aspectRatio={clipAspectRatio}
                  setAspectRatio={setClipAspectRatio}
                />
              </div>
            </>
          ) : (
            <HomeDashboard
              projects={projects}
              busy={busy}
              environment={environment}
              showSettings={showSettings}
              setShowSettings={setShowSettings}
              importMedia={importMedia}
              setYoutubeModalOpen={setYoutubeModalOpen}
              selectProject={selectProject}
              renameProject={renameProject}
              deleteProject={deleteProject}
              toggleProjectCompleted={toggleProjectCompleted}
              settingsNode={settingsNode}
            />
          )}
        </section>
      </main>

      <StatusBar
        environment={environment}
        telemetry={telemetry}
        canUseCloudKey={canUseCloudKey}
        canUseClaude={canUseClaude}
        canUseDeepseek={canUseDeepseek}
      />

      <StyleModal
        isOpen={showStyleModal}
        onClose={() => {
          setShowStyleModal(false);
          setMediaPathToImport(null);
        }}
        telemetry={telemetry}
        selectedStyle={selectedStyle}
        setSelectedStyle={setSelectedStyle}
        selectedContentType={selectedContentType}
        setSelectedContentType={setSelectedContentType}
        targetDuration={targetDuration}
        setTargetDuration={setTargetDuration}
        importModalTab={importModalTab}
        setImportModalTab={setImportModalTab}
        llmEngine={llmEngine}
        setLlmEngine={setLlmEngine}
        localLlmModel={localLlmModel}
        setLocalLlmModel={setLocalLlmModel}
        deepseekModel={deepseekModel}
        setDeepseekModel={setDeepseekModel}
        openrouterModel={openrouterModel}
        setOpenrouterModel={setOpenrouterModel}
        canUseDeepseek={canUseDeepseek}
        canUseClaude={canUseClaude}
        canUseOpenai={canUseOpenai}
        canUseGroq={canUseGroq}
        canUseGemini={canUseGemini}
        canUseOpenrouter={canUseOpenrouter}
        transcriptionEngine={transcriptionEngine}
        whisperModel={whisperModel}
        setWhisperModel={setWhisperModel}
        whisperModelsList={whisperModelsList}
        autoTranscribeOnImport={autoTranscribeOnImport}
        setAutoTranscribeOnImport={setAutoTranscribeOnImport}
        refineTranscriptWithLlm={refineTranscriptWithLlm}
        setRefineTranscriptWithLlm={setRefineTranscriptWithLlm}
        autoDetectMoments={autoDetectMoments}
        setAutoDetectMoments={setAutoDetectMoments}
        enableThinking={enableThinking}
        setEnableThinking={setEnableThinking}
        environment={environment}
        onOpenSettings={() => {
          setShowStyleModal(false);
          setShowSettings(true);
        }}
        onConfirm={() => confirmImport(selectedStyle, selectedContentType, targetDuration)}
      />

      <SocialCopyModal
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        isGeneratingCopy={isGeneratingCopy}
        copyResult={copyResult}
        llmEngine={llmEngine}
        localLlmModel={localLlmModel}
        copyExtraContext={copyExtraContext}
        setCopyExtraContext={setCopyExtraContext}
        onGenerateCopy={(override) => generateSocialCopy(override)}
        copiedField={copiedField}
        onCopyText={copyTextToClipboard}
      />

      <CandidatePreviewModal
        candidate={previewCandidate}
        detail={detail}
        onClose={() => setPreviewCandidate(null)}
        trimStart={trimStart}
        setTrimStart={setTrimStart}
        trimEnd={trimEnd}
        setTrimEnd={setTrimEnd}
        isSavingTrim={isSavingTrim}
        onSaveTrim={saveCandidateTrim}
        onCutCandidate={(candidateId) => cutCandidate(candidateId)}
        clipByCandidate={clipByCandidate}
        busy={busy}
      />

      <ModelDownloadModal
        downloadingModelName={downloadingModelName}
        modelDownloadProgress={modelDownloadProgress}
        modelDownloadStatus={modelDownloadStatus}
      />

      <YouTubeImportModal
        isOpen={youtubeModalOpen}
        onClose={() => {
          setYoutubeModalOpen(false);
          setYoutubeUrl("");
          setYoutubeStatus("idle");
        }}
        youtubeUrl={youtubeUrl}
        setYoutubeUrl={setYoutubeUrl}
        youtubeStatus={youtubeStatus}
        youtubeWarningLicense={youtubeWarningLicense}
        onCheckAndDownload={handleYoutubeImport}
        onConfirmDownloadRisk={executeYoutubeDownload}
      />

      {showSummaryModal && detail && (
        <SummaryModal
          isOpen={showSummaryModal}
          onClose={() => {
            if (summaryStatus !== "rendering") {
              setShowSummaryModal(false);
              setSummaryStatus("idle");
            }
          }}
          detail={detail}
          summaryTargetMinutes={summaryTargetMinutes}
          setSummaryTargetMinutes={setSummaryTargetMinutes}
          summaryAspectRatio={summaryAspectRatio}
          setSummaryAspectRatio={setSummaryAspectRatio}
          summaryVibe={summaryVibe}
          setSummaryVibe={setSummaryVibe}
          summaryStatus={summaryStatus}
          setSummaryStatus={setSummaryStatus}
          summaryProgressMsg={summaryProgressMsg}
          summaryResult={summaryResult}
          setSummaryResult={setSummaryResult}
          customOutputDir={customOutputDir}
          onGenerateSummary={generateSummary}
          copiedChapters={copiedChapters}
          setCopiedChapters={setCopiedChapters}
        />
      )}
    </div>
  );
}
export default App;
