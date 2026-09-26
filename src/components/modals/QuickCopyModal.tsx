import React, { useState } from "react";
import { Loader2, Sparkles, Copy, Check, X, FileVideo, FileText, Upload } from "lucide-react";
import { CopyResult } from "../../types";
import { invoke } from "../../apiBridge";

interface QuickCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  llmEngine: string;
  localLlmModel: string;
  anthropicKey: string;
  deepseekKey: string;
  deepseekModel: string;
  geminiKey: string;
  openaiKey: string;
  openrouterKey: string;
  openrouterModel: string;
  groqKey: string;
  enableThinking: boolean;
}

export function QuickCopyModal({
  isOpen,
  onClose,
  llmEngine,
  localLlmModel,
  anthropicKey,
  deepseekKey,
  deepseekModel,
  geminiKey,
  openaiKey,
  openrouterKey,
  openrouterModel,
  groqKey,
  enableThinking,
}: QuickCopyModalProps) {
  const [activeTab, setActiveTab] = useState<"text" | "media">("text");
  const [transcriptText, setTranscriptText] = useState("");
  const [selectedMediaPath, setSelectedMediaPath] = useState<string | null>(null);
  const [extraContext, setExtraContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyText = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2500);
  };

  const handleSelectMedia = async () => {
    try {
      const selected = await invoke<string | null>("open_file_dialog");
      if (selected) {
        setSelectedMediaPath(selected);
      }
    } catch (err) {
      console.error("Error al abrir diálogo de archivo:", err);
    }
  };

  const handleGenerate = async () => {
    if (activeTab === "text" && !transcriptText.trim()) {
      setError("Pega o escribe el texto de tu transcripción.");
      return;
    }
    if (activeTab === "media" && !selectedMediaPath) {
      setError("Selecciona un archivo de video o audio.");
      return;
    }

    setIsGenerating(true);
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

    try {
      const result = await invoke<CopyResult>("generate_quick_copy", {
        transcriptText: activeTab === "text" ? transcriptText.trim() : null,
        mediaPath: activeTab === "media" ? selectedMediaPath : null,
        extraContext: extraContext.trim() || null,
        provider: llmEngine,
        modelName: activeLlmModel,
        apiKey: activeLlmKey || null,
        enableThinking,
      });
      setCopyResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="summary-modal-overlay" onClick={onClose}>
      <div
        className="summary-modal"
        style={{ maxWidth: "820px", width: "95%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="summary-modal-header">
          <div>
            <h3>Generador de Copy Rápido para Redes Sociales</h3>
            <p>
              Pega una transcripción de Premiere, CapCut o selecciona un video para generar ganchos virales, descripción y hashtags con IA.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        </div>

        {/* Source tab selector */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
          <button
            type="button"
            className="secondary-action"
            onClick={() => setActiveTab("text")}
            style={{
              flex: 1,
              padding: "0.6rem 1rem",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: activeTab === "text" ? "var(--bg-surface-hover)" : "var(--bg-surface-raised)",
              borderColor: activeTab === "text" ? "var(--accent-primary)" : "var(--border-default)",
              fontWeight: activeTab === "text" ? 600 : 400,
            }}
          >
            <FileText size={16} />
            <span>Pegar Transcripción (Premiere / Texto)</span>
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => setActiveTab("media")}
            style={{
              flex: 1,
              padding: "0.6rem 1rem",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: activeTab === "media" ? "var(--bg-surface-hover)" : "var(--bg-surface-raised)",
              borderColor: activeTab === "media" ? "var(--accent-primary)" : "var(--border-default)",
              fontWeight: activeTab === "media" ? 600 : 400,
            }}
          >
            <FileVideo size={16} />
            <span>Desde Archivo de Video / Audio</span>
          </button>
        </div>

        {/* Input container */}
        <div style={{ marginBottom: "1rem" }}>
          {activeTab === "text" ? (
            <div>
              <textarea
                className="form-input"
                rows={5}
                placeholder="Pega aquí la transcripción de tu video o clip (ej. texto exportado de Premiere, SRT, o lo que dice el video)..."
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                style={{
                  width: "100%",
                  resize: "vertical",
                  fontSize: "0.85rem",
                  lineHeight: "1.4",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed var(--border-default)",
                borderRadius: "8px",
                padding: "1.5rem",
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              {selectedMediaPath ? (
                <div>
                  <p style={{ margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.88rem" }}>
                    {selectedMediaPath.split(/[\\/]/).pop()}
                  </p>
                  <p style={{ margin: "0 0 1rem", fontSize: "0.76rem", opacity: 0.6 }}>
                    {selectedMediaPath}
                  </p>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={handleSelectMedia}
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
                  >
                    Cambiar archivo
                  </button>
                </div>
              ) : (
                <div>
                  <Upload size={28} style={{ opacity: 0.5, margin: "0 auto 0.5rem" }} />
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Selecciona un video o audio de tu disco para transcribirlo rápidamente y extraer su copy
                  </p>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={handleSelectMedia}
                    style={{ fontSize: "0.82rem", padding: "0.5rem 1rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <FileVideo size={15} />
                    <span>Seleccionar Archivo</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Optional Extra Context & Generate button */}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--border-default)",
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <input
            type="text"
            className="form-input"
            placeholder="Contexto o tono (Opcional): ej. Tono humorístico gamer, llamar a suscribirse, video para TikTok..."
            value={extraContext}
            onChange={(e) => setExtraContext(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isGenerating) {
                void handleGenerate();
              }
            }}
            style={{ flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.84rem", borderRadius: "6px" }}
          />
          <button
            type="button"
            className="primary-action"
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{ padding: "0.5rem 1.2rem", fontSize: "0.84rem", display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}
          >
            {isGenerating ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
            <span>{isGenerating ? "Generando..." : copyResult ? "Regenerar Copy" : "Generar Copy con IA"}</span>
          </button>
        </div>

        {error && (
          <div style={{ padding: "0.6rem 0.8rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: "6px", color: "#f87171", fontSize: "0.82rem", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* Results view */}
        {copyResult && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", maxHeight: "380px", overflowY: "auto", paddingRight: "4px" }}>
            {/* Hooks */}
            <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-default)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent-primary)" }}>
                  Ganchos Virales (Primeros 3 segundos)
                </span>
                <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>Haz clic en un gancho para copiarlo</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {copyResult.hooks?.map((hook, i) => (
                  <div
                    key={i}
                    onClick={() => handleCopyText(`hook-${i}`, hook)}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "6px",
                      background: "rgba(255, 255, 255, 0.03)",
                      fontSize: "0.82rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <span>{hook}</span>
                    {copiedKey === `hook-${i}` ? <Check size={13} color="#22c55e" /> : <Copy size={13} style={{ opacity: 0.4 }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Caption */}
            <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-default)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Descripción / Caption</span>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleCopyText("caption", copyResult.caption || "")}
                  style={{ fontSize: "0.72rem", padding: "2px 8px", height: "24px" }}
                >
                  {copiedKey === "caption" ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                  <span>{copiedKey === "caption" ? "Copiado" : "Copiar"}</span>
                </button>
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: "1.4", opacity: 0.9 }}>
                {copyResult.caption}
              </p>
            </div>

            {/* CTA & Hashtags */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-default)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Llamado a la Acción (CTA)</span>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => handleCopyText("cta", copyResult.cta || "")}
                    style={{ fontSize: "0.72rem", padding: "2px 8px", height: "24px" }}
                  >
                    {copiedKey === "cta" ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.85 }}>{copyResult.cta}</p>
              </div>

              <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-default)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Hashtags</span>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => handleCopyText("hashtags", copyResult.hashtags?.join(" ") || "")}
                    style={{ fontSize: "0.72rem", padding: "2px 8px", height: "24px" }}
                  >
                    {copiedKey === "hashtags" ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--accent-primary)" }}>
                  {copyResult.hashtags?.join(" ")}
                </p>
              </div>
            </div>

            {/* Copy All Button */}
            <button
              type="button"
              className="primary-action"
              onClick={() => handleCopyText("full", copyResult.full_copy || "")}
              style={{
                width: "100%",
                padding: "0.75rem",
                fontSize: "0.86rem",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontWeight: 600,
              }}
            >
              {copiedKey === "full" ? <Check size={16} color="#22c55e" /> : <Copy size={16} />}
              <span>{copiedKey === "full" ? "¡Copiado Todo al Portapapeles!" : "Copiar Paquete Completo (Listo para Pegar)"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
