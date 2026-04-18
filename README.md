# 🔥 FORGE LAB

<div align="center">

![FORGE LAB](https://img.shields.io/badge/FORGE-LAB-00BFFF?style=for-the-badge&logo=electron&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-brightgreen?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20macOS%20|%20Linux-blue?style=for-the-badge)

**🎬 AI-Powered Viral Clip Creator**

*Transform long-form content into viral clips with AI analysis and one-click export.*

</div>

---

## ✨ Features

### 🧠 AI-Powered Analysis
- **Automatic Segmentation** - AI identifies the most viral moments
- **Virality Scoring** - Each segment gets a 0-100 virality score
- **Hook Detection** - Finds natural hooks and cold opens

### 🎨 World-Class Subtitles
- **Karaoke-Style Animation** - Word-by-word highlight sync
- **Multiple Presets** - Viral Pro, MrBeast, Clean, Minimal
- **Full Customization** - Font, colors, size, animations, position

### 🎬 Professional Editing
- **9:16 Vertical Clips** - Perfect for TikTok, Reels, Shorts
- **Cold Open Intro** - Automatic hook sequence with animations
- **Batch Export** - Export multiple clips simultaneously

### 🖥️ Beautiful UI
- **Westworld Theme** - Immersive dark mode with cyan accents
- **Floating Widget** - Track active jobs from anywhere
- **Ambient Audio** - Optional background soundscapes

---

## 🚀 Quick Start

### Prerequisites

- **Windows 10/11** (64-bit)
- **NVIDIA GPU** with CUDA support (recommended)
- **8GB+ RAM**
- **FFmpeg** (included in installer)

### Installation

1. Download the latest release from [Releases](https://github.com/MaestroMed/ForgeLab/releases)
2. Run `FORGE LAB Setup.exe`
3. Follow the installation wizard
4. Launch FORGE LAB from desktop shortcut

### First Run

1. **Import a video** - Paste a YouTube URL or drag a local file
2. **Analyze** - AI will find the best moments
3. **Review segments** - Browse and select clips
4. **Customize** - Adjust subtitles and intro
5. **Export** - One-click export to vertical format

---

## 🛠️ Development

### Project Structure

```
ForgeLab/
├── apps/
│   ├── desktop/          # Electron + React frontend
│   │   ├── src/          # React components & pages
│   │   ├── electron/     # Main process
│   │   └── e2e/          # Playwright tests
│   └── forge-engine/     # Python FastAPI backend
│       ├── src/          # API & services
│       └── tests/        # Pytest tests
├── packages/
│   └── shared/           # Shared types & schemas
└── docs/                 # Documentation
```

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Desktop | Electron 28 |
| Backend | Python 3.11 + FastAPI |
| AI | OpenAI Whisper (transcription) |
| Video | FFmpeg + NVENC (GPU encoding) |
| Database | SQLite |
| State | Zustand |
| Animations | Framer Motion |

### Development Setup

```bash
# Install dependencies
pnpm install

# Start development (frontend + backend)
cd apps/desktop
npm run dev:electron

# Or run separately:
# Terminal 1 - Backend
cd apps/forge-engine
python -m uvicorn forge_engine.main:app --reload --port 8420

# Terminal 2 - Frontend
cd apps/desktop
npm run dev
```

### Build for Production

```bash
cd apps/desktop

# Windows installer
npm run build:win

# macOS DMG
npm run build:mac

# Linux AppImage
npm run build:linux
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause |
| `←` / `→` | Seek ±5 seconds |
| `↑` / `↓` | Volume |
| `F` | Toggle fullscreen video |
| `F11` | Toggle fullscreen app |
| `D` | Cycle themes |
| `M` | Mute |
| `E` | Export current segment |
| `Esc` | Close modal / Exit fullscreen |

---

## 🎨 Themes

FORGE LAB includes three beautiful themes:

1. **Light** - Clean and bright
2. **Dark** - Easy on the eyes
3. **Westworld** - Immersive cyberpunk aesthetic with grid overlays and scan lines

Press `D` to cycle through themes or configure in Settings.

---

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/MaestroMed/ForgeLab/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MaestroMed/ForgeLab/discussions)---<div align="center">**Made with ❤️ by FORGE LAB Team***Transform content. Go viral.*</div>