# AutoShorts 🎬⚡

**AutoShorts** es una suite de escritorio de código abierto para transformar transmisiones en vivo largas (streams de 1 a 4+ horas de gaming o IRL) y podcasts en:
1. **Clips verticales de alto impacto (9:16 Shorts / TikToks / Reels)** con subtítulos animados y hooks virales.
2. **Videos de Resumen Autoeditados para YouTube (16:9 u 9:16)** de 3, 5, 8, 10 o 15 minutos, estructurados narrativamente por IA con capítulos, miniaturas 1080p y textos clickbait.

Construido sobre una arquitectura moderna y ligera: **React + TypeScript + Vite** en el frontend, y un backend de alto rendimiento en **Python 3 (PyWebView + SQLite + Whisper CUDA + FFmpeg)** diseñado para consumir el mínimo de RAM y **0% de VRAM adicional** tras la inferencia.

---

## ✨ Características Principales

### 🧠 Detección Inteligente para Streams Largos (1h a 4h+)
- **Chunking Adaptativo de 10 minutos con Overlap de 30s:** Divide transmisiones gigantescas en bloques de 10 minutos con solapamiento temporal para no perder jugadas épicas que empiezan al final de un bloque y terminan en el siguiente.
- **Detección de Picos Acústicos en Silencio (Gaming Clutches):** 
  - Analizador acústico RMS en tiempo real en Python puro (`wave`, `struct`, `math`).
  - Procesa 1 hora completa de stream en **< 1.6 segundos**.
  - Si estás en un clutch 1v3 o tiroteo intenso y te concentras sin hablar, el algoritmo detecta la energía sonora (disparos, explosiones) y genera automáticamente candidatos de acción/highlight para que la IA no los descarte.
- **Duración Objetivo Personalizable:** Filtra momentos con duración objetivo de **30 segundos, 1 minuto, 2 minutos, 3 minutos o 5 minutos**.

### 💻 Motor Multi-LLM con Descarga Inmediata de VRAM
- **100% Offline con Ollama:** Soporta cualquier modelo local (`llama3.2`, `qwen2.5`, `qwen3.5`, `mistral`, `gemma2`). Incluye descargador con barra de progreso integrada en la app.
- **Liberación Inmediata de VRAM:** En cuanto Ollama devuelve la planificación de momentos, se ejecuta un *unload* automático (`keep_alive: 0`) para liberar la VRAM de tu GPU y dejarla disponible para jugar, editar o reproducir video.
- **Proveedores Cloud:**
  - **OpenRouter** (Modelos gratuitos y de pago con control de velocidad para no saturar rate-limits).
  - **DeepSeek** (Económico y con alta precisión de razonamiento).
  - **Anthropic Claude** (Calidad premium de copywriting para hooks y títulos).
  - **Google Gemini** (Modelos Flash gratuitos).
  - **OpenAI GPT-4o** y **Groq** (Ultra rápido).

### 🎬 Autoedición y Compilación de Resúmenes para YouTube
- **Auto-Editor Narrativo:** Une los mejores clips cronológicamente en un único archivo de video para subirlo a YouTube o abrirlo en Premiere, DaVinci Resolve o CapCut.
- **3 Estilos / Vibes de Edición:**
  - *Equilibrado:* Historia completa con teaser de gancho, risas, jugadas y desenlace.
  - *Tryhard / Épico:* Prioriza kills, clutches, jugadas maestras y máxima tensión.
  - *Risas y Fails:* Prioriza humor, anécdotas cómicas, bugs, fails y troleos con el chat.
- **Control de Presupuesto Real de Tiempo:** La compilación se ajusta fielmente a la duración seleccionada (3, 5, 8, 10 o 15 min) **sin cortar jamás frases o jugadas por la mitad**.
- **Timestamps y Capítulos para YouTube:** Genera el texto formateado (`00:00 Intro...`, `01:15 Partida...`) con botón de **1 Clic "Copiar Capítulos"** y guarda un archivo `Descripcion_YouTube.txt`.
- **Miniaturas HD (1080p):** Extrae automáticamente un fotograma en alta definición del mejor momento con FFmpeg y sugiere 3 frases clickbait para la miniatura.

### ✂️ Ajuste Fino de Recorte (Trim Controls)
- Previsualizador interactivo con botones rápidos: `[-5s]`, `[-1s]`, `[+1s]`, `[+5s]`.
- Reproducción dinámica en tiempo real según los límites ajustados.
- Persistencia directa en SQLite y reseteo del clip para re-renderizar con precisión de fotograma.

---

## 🛠️ Requisitos Previos

1. **Python 3.10 o superior** (Recomendado Python 3.11).
2. **Node.js 18+** y gestor de paquetes (`pnpm` o `npm`).
3. **FFmpeg y FFprobe:** Debe estar en el `PATH` del sistema.
   - **Windows:** `winget install Gyan.FFmpeg` o descargar de [gyan.dev](https://www.gyan.dev/ffmpeg/builds/).
   - **macOS:** `brew install ffmpeg`
   - **Linux:** `sudo apt install ffmpeg`
4. **Ollama (Opcional para modo 100% Offline):** [ollama.com](https://ollama.com) con modelos como `llama3.2` o `qwen2.5`.
5. **NVIDIA GPU con CUDA (Opcional):** Para acelerar la transcripción local con Whisper.

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar el Repositorio
```bash
git clone https://github.com/jeffd2599/autoshorts.git
cd autoshorts
```

### 2. Instalar Dependencias de Python
```bash
pip install -r requirements.txt
```
*(Opcional: Si vas a usar Whisper local con GPU NVIDIA, asegúrate de tener instalado PyTorch con soporte CUDA).*

### 3. Instalar Dependencias del Frontend
```bash
pnpm install
# o con npm:
npm install
```

### 4. Compilar la Interfaz Web
```bash
pnpm run build
# o con npm:
npm run build
```

### 5. Iniciar AutoShorts
Ejecuta el script principal de inicio:
```bash
python run.py
```
Esto iniciará:
1. El servidor multimedia local de streaming en el puerto `1422`.
2. La ventana de escritorio nativa (PyWebView / WebView2) lista para importar videos o audios.

---

## 💻 Desarrollo en Vivo (Hot Reload)

Si deseas modificar la interfaz en tiempo real:

1. Inicia el servidor de desarrollo de Vite:
   ```bash
   pnpm run dev
   ```
2. En otra terminal, ejecuta la aplicación:
   ```bash
   python run.py
   ```

---

## 📁 Estructura del Proyecto

```text
autoshorts/
├── python_backend/          # Backend central en Python
│   ├── api.py               # API RPC expuesta a la interfaz PyWebView
│   ├── db.py                # Capa SQLite (proyectos, transcripciones, clips, trims)
│   ├── llm.py               # Lógica de chunking, prompts, Ollama, OpenRouter, Claude, GPT, etc.
│   ├── media.py             # Integración FFmpeg, picos acústicos RMS, miniaturas 1080p, concatenación
│   └── transcription.py     # Transcripción local (Whisper) y Cloud (Deepgram)
├── src/                     # Frontend en React 19 + TypeScript
│   ├── main.tsx             # Interfaz principal, modal de autoedición, reproductor y recorte
│   ├── index.css            # Estilos modernos dark mode y glassmorphism
│   └── components/          # Componentes visuales y panel de onboarding
├── run.py                   # Punto de entrada de la aplicación de escritorio
├── requirements.txt         # Dependencias de Python
└── package.json             # Scripts y dependencias frontend
```

---

## 🤝 Créditos y Fork

Este proyecto es un fork extendido y optimizado de [JayWebtech/autoshorts](https://github.com/JayWebtech/autoshorts), rediseñado para proporcionar:
- Backend desacoplado en Python para máxima compatibilidad y facilidad de extensión.
- Análisis de audio y picos acústicos para streams de gaming.
- Gestión segura de VRAM y memoria RAM baja (< 120 MB en renderizado).
- Suite de autoedición completa para YouTube.

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
