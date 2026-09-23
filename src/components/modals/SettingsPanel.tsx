import React from "react";
import { Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import {
  EnvironmentStatus,
  LlmEngine,
  TranscriptionEngine,
  WhisperModel,
} from "../../types";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  transcriptionEngine: TranscriptionEngine;
  setTranscriptionEngine: (engine: TranscriptionEngine) => void;
  whisperModel: string;
  setWhisperModel: (model: string) => void;
  whisperModelsList: WhisperModel[];
  llmEngine: LlmEngine;
  setLlmEngine: (engine: LlmEngine) => void;
  localLlmModel: string;
  setLocalLlmModel: (model: string) => void;
  enableThinking: boolean;
  setEnableThinking: (val: boolean) => void;
  environment: EnvironmentStatus | null;
  onRefreshEnv: () => Promise<void>;
  pullInputModel: string;
  setPullInputModel: (val: string) => void;
  downloadingModelName: string | null;
  modelDownloadStatus: string;
  modelDownloadProgress: number;
  onPullModel: (model: string) => Promise<void>;
  openrouterKey: string;
  setOpenrouterKey: (key: string) => void;
  openrouterModel: string;
  setOpenrouterModel: (model: string) => void;
  deepseekKey: string;
  setDeepseekKey: (key: string) => void;
  deepseekModel: string;
  setDeepseekModel: (model: string) => void;
  anthropicKey: string;
  setAnthropicKey: (key: string) => void;
  openaiKey: string;
  setOpenaiKey: (key: string) => void;
  groqKey: string;
  setGroqKey: (key: string) => void;
  geminiKey: string;
  setGeminiKey: (key: string) => void;
  deepgramKey: string;
  setDeepgramKey: (key: string) => void;
  customMomentsPrompt: string;
  setCustomMomentsPrompt: (prompt: string) => void;
  defaultMomentsPrompt: string;
  syncConfig: (updates: Record<string, any>) => void;
  onResetConfig: () => void;
}

export function SettingsPanel({
  isOpen,
  onClose,
  transcriptionEngine,
  setTranscriptionEngine,
  whisperModel,
  setWhisperModel,
  whisperModelsList,
  llmEngine,
  setLlmEngine,
  localLlmModel,
  setLocalLlmModel,
  enableThinking,
  setEnableThinking,
  environment,
  onRefreshEnv,
  pullInputModel,
  setPullInputModel,
  downloadingModelName,
  modelDownloadStatus,
  modelDownloadProgress,
  onPullModel,
  openrouterKey,
  setOpenrouterKey,
  openrouterModel,
  setOpenrouterModel,
  deepseekKey,
  setDeepseekKey,
  deepseekModel,
  setDeepseekModel,
  anthropicKey,
  setAnthropicKey,
  openaiKey,
  setOpenaiKey,
  groqKey,
  setGroqKey,
  geminiKey,
  setGeminiKey,
  deepgramKey,
  setDeepgramKey,
  customMomentsPrompt,
  setCustomMomentsPrompt,
  defaultMomentsPrompt,
  syncConfig,
  onResetConfig,
}: SettingsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="settings-panel" style={{ margin: "1rem 0", padding: "1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <SlidersHorizontal size={18} color="var(--accent-primary)" />
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Configuración del Estudio (Modelos & APIs)</h3>
        </div>
        <button
          type="button"
          className="icon-button"
          style={{ minHeight: "28px", height: "28px", padding: "2px 10px", fontSize: "0.8rem" }}
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>

      <div className="key-stack-horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
        {/* Transcription Engine */}
        <label>
          <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.4rem" }}>MOTOR DE TRANSCRIPCIÓN</span>
          <select
            className="form-select"
            value={transcriptionEngine}
            onChange={(event) => {
              const eng = event.target.value as "deepgram" | "local";
              setTranscriptionEngine(eng);
              syncConfig({ transcriptionEngine: eng });
            }}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
          >
            <option value="local">Local Whisper (Offline - GPU CUDA)</option>
            <option value="deepgram">Deepgram API (Cloud)</option>
          </select>
        </label>

        {/* Whisper Model Selector (if local) */}
        {transcriptionEngine === "local" && (
          <label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>MODELO WHISPER (LOCAL)</span>
              <span style={{ fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                {whisperModelsList.find((m) => m.id === whisperModel)?.vram || ""} VRAM
              </span>
            </div>
            <select
              className="form-select"
              value={whisperModel}
              onChange={(event) => {
                setWhisperModel(event.target.value);
                syncConfig({ whisperModel: event.target.value });
              }}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
            >
              {whisperModelsList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.vram} VRAM) {m.downloaded ? "[Descargado]" : "[Descargar al usar]"}
                </option>
              ))}
            </select>
            <span style={{ fontSize: "0.72rem", opacity: 0.7, marginTop: "4px", display: "block" }}>
              {whisperModelsList.find((m) => m.id === whisperModel)?.description || "Modelos de alta precisión para GPU NVIDIA."}
            </span>
          </label>
        )}

        {/* LLM Engine */}
        <label>
          <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.4rem" }}>MOTOR DE IA (DETECCIÓN DE MOMENTOS)</span>
          <select
            className="form-select"
            value={llmEngine}
            onChange={(event) => {
              const eng = event.target.value as any;
              setLlmEngine(eng);
              syncConfig({ llmEngine: eng });
            }}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
          >
            <option value="local">Ollama (Offline Local en tu PC)</option>
            <option value="openrouter">OpenRouter (Cloud - Modelos Libres / Pagos)</option>
            <option value="deepseek">DeepSeek API (Cloud)</option>
            <option value="claude">Claude Anthropic (Cloud)</option>
            <option value="openai">OpenAI GPT-4o (Cloud)</option>
            <option value="groq">Groq (Cloud - Ultra Rápido)</option>
            <option value="gemini">Google Gemini (Cloud)</option>
          </select>
        </label>

        {/* Conditional Fields based on LLM Engine */}
        {llmEngine === "local" && (
          <div style={{ gridColumn: "1 / -1", padding: "1rem", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                Modelos Instalados en tu Ollama Local:
              </span>
              <button
                type="button"
                className="icon-button"
                style={{ minHeight: "26px", height: "26px", padding: "2px 8px", fontSize: "0.75rem" }}
                onClick={() => void onRefreshEnv()}
                title="Actualizar lista de modelos desde Ollama"
              >
                <RefreshCw size={12} /> Refrescar Lista
              </button>
            </div>

            {environment?.installedOllamaModels && environment.installedOllamaModels.length > 0 ? (
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "0.8rem" }}>
                <select
                  className="form-select"
                  value={localLlmModel}
                  onChange={(event) => {
                    setLocalLlmModel(event.target.value);
                    syncConfig({ localLlmModel: event.target.value });
                  }}
                  style={{ flex: 1, padding: "0.55rem", fontSize: "0.88rem", borderRadius: "6px" }}
                >
                  {environment.installedOllamaModels.map((m) => (
                    <option key={m} value={m}>
                      {m} {m.includes("qwen") ? "(Recomendado para AutoShorts)" : ""}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "0.78rem", color: "#10b981", fontWeight: 600, whiteSpace: "nowrap" }}>
                  ● {environment.installedOllamaModels.length} modelo(s) listo(s) en PC
                </span>
              </div>
            ) : (
              <div style={{ fontSize: "0.8rem", color: "#f59e0b", padding: "0.4rem 0", marginBottom: "0.6rem" }}>
                No se detectaron modelos activos en Ollama (http://127.0.0.1:11434). Asegúrate de tener la app de Ollama abierta.
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0.6rem 0", padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid var(--border)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.82rem" }}>
                <input
                  type="checkbox"
                  checked={enableThinking}
                  onChange={(e) => {
                    setEnableThinking(e.target.checked);
                    localStorage.setItem("autoshorts_enable_thinking", String(e.target.checked));
                  }}
                  style={{ cursor: "pointer", width: "15px", height: "15px" }}
                />
                <span>Activar modo razonamiento (Thinking / CoT en Ollama)</span>
              </label>
              <span style={{ fontSize: "0.72rem", color: enableThinking ? "#f59e0b" : "#10b981", fontWeight: 600 }}>
                {enableThinking ? "Más lento (análisis profundo)" : "Modo rápido (Recomendado para RTX 2060)"}
              </span>
            </div>

            {/* Optional Pull another model */}
            <div style={{ paddingTop: "0.6rem", borderTop: "1px dashed var(--border)" }}>
              <span style={{ fontSize: "0.75rem", opacity: 0.8, display: "block", marginBottom: "0.3rem" }}>
                ¿Quieres descargar otro modelo desde la biblioteca de Ollama?
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: llama3.2, mistral, deepseek-r1:8b"
                  value={pullInputModel}
                  onChange={(e) => setPullInputModel(e.target.value)}
                  style={{ flex: 1, padding: "0.45rem 0.6rem", fontSize: "0.85rem", borderRadius: "6px" }}
                />
                <button
                  type="button"
                  className="icon-button"
                  style={{ minHeight: "34px", height: "34px", whiteSpace: "nowrap" }}
                  disabled={!pullInputModel.trim() || Boolean(downloadingModelName)}
                  onClick={() => {
                    if (pullInputModel.trim()) {
                      void onPullModel(pullInputModel.trim()).then(() => {
                        setLocalLlmModel(pullInputModel.trim());
                        syncConfig({ localLlmModel: pullInputModel.trim() });
                        setPullInputModel("");
                      });
                    }
                  }}
                >
                  <Download size={14} /> Descargar (Pull)
                </button>
              </div>
              {downloadingModelName && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--accent-primary)" }}>
                  {modelDownloadStatus} ({modelDownloadProgress}%)
                </div>
              )}
            </div>
          </div>
        )}

        {/* OpenRouter */}
        {llmEngine === "openrouter" && (
          <div style={{ gridColumn: "1 / -1", padding: "1rem", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <label>
                <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>OPENROUTER API KEY</span>
                <input
                  type="password"
                  value={openrouterKey}
                  onChange={(event) => {
                    setOpenrouterKey(event.target.value);
                    syncConfig({ openrouterKey: event.target.value });
                  }}
                  placeholder={environment?.hasOpenrouterKey ? "Cargado desde variables de entorno" : "sk-or-v1-..."}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
                />
              </label>
              <label>
                <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>MODELO DE OPENROUTER</span>
                <input
                  type="text"
                  value={openrouterModel}
                  onChange={(event) => {
                    setOpenrouterModel(event.target.value);
                    syncConfig({ openrouterModel: event.target.value });
                  }}
                  placeholder="meta-llama/llama-3.3-70b-instruct:free"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
                />
              </label>
            </div>

            <div style={{ padding: "0.6rem 0.8rem", borderRadius: "6px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", fontSize: "0.78rem", color: "var(--foreground)" }}>
              <strong>Protección Anti-Saturación:</strong> AutoShorts incorpora pausas de 2.5s entre bloques y reintentos automáticos con espera exponencial ante códigos 429 (Rate Limit), para que los modelos gratuitos de OpenRouter no saturen la cuota ni congelen la aplicación.
            </div>
          </div>
        )}

        {/* DeepSeek */}
        {llmEngine === "deepseek" && (
          <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label>
              <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>DEEPSEEK API KEY</span>
              <input
                type="password"
                value={deepseekKey}
                onChange={(event) => {
                  setDeepseekKey(event.target.value);
                  syncConfig({ deepseekKey: event.target.value });
                }}
                placeholder={environment?.hasDeepseekKey ? "Cargado desde variables de entorno" : "sk-..."}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
              />
            </label>
            <label>
              <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>MODELO DE DEEPSEEK</span>
              <input
                type="text"
                value={deepseekModel}
                onChange={(event) => {
                  setDeepseekModel(event.target.value);
                  syncConfig({ deepseekModel: event.target.value });
                }}
                placeholder="deepseek-chat (opcional)"
                style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
              />
            </label>
          </div>
        )}

        {/* Claude */}
        {llmEngine === "claude" && (
          <label style={{ gridColumn: "1 / -1" }}>
            <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>CLAUDE (ANTHROPIC) API KEY</span>
            <input
              type="password"
              value={anthropicKey}
              onChange={(event) => {
                setAnthropicKey(event.target.value);
                syncConfig({ anthropicKey: event.target.value });
              }}
              placeholder={environment?.hasAnthropicKey ? "Cargado desde variables de entorno" : "sk-ant-..."}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
            />
          </label>
        )}

        {/* OpenAI */}
        {llmEngine === "openai" && (
          <label style={{ gridColumn: "1 / -1" }}>
            <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>OPENAI API KEY</span>
            <input
              type="password"
              value={openaiKey}
              onChange={(event) => {
                setOpenaiKey(event.target.value);
                syncConfig({ openaiKey: event.target.value });
              }}
              placeholder={environment?.hasOpenaiKey ? "Cargado desde variables de entorno" : "sk-..."}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
            />
          </label>
        )}

        {/* Groq */}
        {llmEngine === "groq" && (
          <label style={{ gridColumn: "1 / -1" }}>
            <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>GROQ API KEY</span>
            <input
              type="password"
              value={groqKey}
              onChange={(event) => {
                setGroqKey(event.target.value);
                syncConfig({ groqKey: event.target.value });
              }}
              placeholder={environment?.hasGroqKey ? "Cargado desde variables de entorno" : "gsk_..."}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
            />
          </label>
        )}

        {/* Gemini */}
        {llmEngine === "gemini" && (
          <label style={{ gridColumn: "1 / -1" }}>
            <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>GEMINI API KEY</span>
            <input
              type="password"
              value={geminiKey}
              onChange={(event) => {
                setGeminiKey(event.target.value);
                syncConfig({ geminiKey: event.target.value });
              }}
              placeholder={environment?.hasGeminiKey ? "Cargado desde variables de entorno" : "AIzaSy..."}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
            />
          </label>
        )}

        {/* Deepgram Key if selected */}
        {transcriptionEngine === "deepgram" && (
          <label style={{ gridColumn: "1 / -1" }}>
            <span style={{ fontWeight: 600, fontSize: "0.82rem", display: "block", marginBottom: "0.3rem" }}>DEEPGRAM API KEY</span>
            <input
              type="password"
              value={deepgramKey}
              onChange={(event) => {
                setDeepgramKey(event.target.value);
                syncConfig({ deepgramKey: event.target.value });
              }}
              placeholder={environment?.hasDeepgramKey ? "Cargado desde env" : "Token Deepgram..."}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px" }}
            />
          </label>
        )}
      </div>

      {/* Custom Prompt for Moments */}
      <div style={{ marginTop: "1.25rem", padding: "1rem", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", display: "block" }}>
              Prompt del Sistema para Detección de Momentos
            </span>
            <span style={{ fontSize: "0.74rem", opacity: 0.7 }}>
              Instrucciones que guían a la IA para evaluar ganchos, interés y selección de candidatos.
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            style={{ fontSize: "0.75rem", padding: "4px 10px", height: "auto" }}
            onClick={() => {
              setCustomMomentsPrompt("");
              syncConfig({ customMomentsPrompt: "" });
            }}
            title="Restablecer al prompt original por defecto"
          >
            Restablecer por Defecto
          </button>
        </div>
        <textarea
          className="form-input"
          rows={6}
          value={customMomentsPrompt || defaultMomentsPrompt}
          onChange={(e) => {
            setCustomMomentsPrompt(e.target.value);
            syncConfig({ customMomentsPrompt: e.target.value });
          }}
          placeholder="Escribe o personaliza las instrucciones del sistema..."
          style={{ width: "100%", fontSize: "0.78rem", fontFamily: "var(--font-mono, monospace)", lineHeight: "1.4", resize: "vertical" }}
        />
        {customMomentsPrompt && (
          <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "var(--accent-primary)" }}>
            Prompt personalizado activo. Haz clic en "Restablecer por Defecto" para volver a la configuración estándar.
          </div>
        )}
      </div>

      <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          className="icon-button btn-danger"
          style={{ background: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.2)", color: "#f87171", padding: "6px 14px" }}
          onClick={() => {
            if (window.confirm("¿Seguro que deseas reiniciar la configuración y volver al asistente inicial?")) {
              onResetConfig();
            }
          }}
        >
          Reset App Configuration & Onboarding
        </button>

        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
          Las configuraciones se guardan automáticamente en tu sistema.
        </span>
      </div>
    </div>
  );
}
