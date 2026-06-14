# EntropyDrop Frontend

![EntropyDrop Logo](./public/favicon.png)

This is the frontend codebase for [entropydrop.com](https://entropydrop.com).


[![GitHub](https://img.shields.io/badge/GitHub-EntropyDrop-181717?logo=github&style=flat-square)](https://github.com/EntropyDrop)
[![Hugging Face](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Sking-FFD21E?style=flat-square)](https://huggingface.co/EntropyDrop/Sking)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&style=flat-square)](https://discord.gg/ByX7TwqDcw)
![React 19](https://img.shields.io/badge/React-v19-61DAFB?logo=react&style=flat-square)
![Tailwind 4](https://img.shields.io/badge/Tailwind-v4-38B2AC?logo=tailwind-css&style=flat-square)

---

## 📖 Introduction

This repository contains the web frontend for **EntropyDrop**. Built using a modern tech stack centered on **React 19**, **Vite**, **TypeScript**, **Tailwind CSS v4**, and **Three.js (React Three Fiber)**, it is styled with a premium retro-pixel aesthetic utilizing custom *Fusion Pixel* typography. 

In line with our philosophy of **Root-Trust Governance** and **Open Production**, this frontend operates as a completely transparent interface: exposing our active software roadmaps, publishing detailed technical research blogs, providing a real-time synchronized cloud and payment billing ledger, and offering powerful interactive 3D tools.

---

## ✨ Core Features

### 1. 🤖 AI Minecraft Skin Generator (`/skin/generate`)
An advanced generation interface connected to our fine-tuned **Flux2 Klein Base 4B** model. It translates high-level concepts into game-ready 64x64 Minecraft skin structures.
- **Image Mode:** Upload any reference character portrait to generate a matching Minecraft skin.
- **Text Mode:** Input a text description (e.g., *"A futuristic knight in neon blue armor"*) to synthesize a skin.
- **Image Edit Mode:** Modify reference images with specific text prompts (e.g., *"Change the clothes to red"*).
- **Advanced Control:** Full adjustments for inference steps, guidance scale, seed, and model version.
- **Real-Time Task Queue:** Track active and pending tasks, with priority queues handling generations.

### 2. 🎨 3D Interactive Skin Editor (`/skin/edit`)
A high-performance, in-browser editor allowing developers and creators to refine skin texture files pixel-by-pixel.
- **Dual-Layer Support:** Toggle editing between the base character body layer and the outer decorative (Overlay) layer.
- **Paint Toolkit:** Pencil, Eraser, Color Picker, and HSV adjustment panel (Hue, Saturation, Brightness).
- **History Control:** Smooth Undo and Redo capabilities.
- **Geometry Selection:** Switch between Steve (**Strong** / 4-pixel arms) and Alex (**Slim** / 3-pixel arms) geometry models.
- **Save & Export:** Directly download the 64x64 PNG or save it directly into your creations.

### 3. 🗂️ Personal & Public Collections (`/skin/collection`)
A central workspace for managing, sorting, and sharing skins.
- **Organization:** Categorize items into creations, custom collections, and liked shortcuts.
- **Privacy Controls:** Toggle assets between **Public** (shared with the community and model training loops) and **Private** (restricted visibility).
- **Direct Redirection:** Easily reload saved skins into the generator or editor for quick iterations.

### 4. 🔓 Public Startup & Real-time Ledger (`/public`)
Exposing actual system operations and financials directly to the community to maintain complete transparency.
- **Real-Time Ledger (`/public/ledger`):** A live, anonymized billing ledger displaying daily-synchronized PayPal income transactions and AWS cloud infrastructure costs.
- **Open Roadmap:** Tracks software evolution milestones, data synthesis improvements, and protocol releases.
- **Technical Articles:** Built-in Markdown reader serving our latest research (e.g., Flux2 Klein LoRA fine-tuning methodologies, deep dives into skin UV spatial parameters, and backend scaling boundaries).

---

## 🛠️ Technology Stack

| Category | Technology / Library | Description |
| :--- | :--- | :--- |
| **Core Framework** | React 19 + TypeScript | UI component model, types, and logic |
| **Build Tool** | Vite | Hyper-fast module bundler and dev server |
| **Styling** | Tailwind CSS v4 + Vanilla CSS | Modern utility framework with custom CSS rules |
| **3D Rendering** | Three.js + React Three Fiber (R3F) + Drei | Immersive interactive 3D skin views and previews |
| **Skin Handling** | `@daidr/minecraft-skin-renderer` | High-quality Minecraft skin canvas decoding and rendering |
| **Animations** | Framer Motion | Smooth page transitions and subtle micro-animations |
| **Content Render** | `react-markdown` + `remark-gfm` | Parses multi-language documentation and technical blogs |
| **Auth** | Google OAuth | Secure Single Sign-On (SSO) gateway |

---

## 🐍 Utility Scripts (`/scripts`)

The repository includes specialized preprocessing and structural analysis python scripts:

1. **`scripts/draw_uv.py`**
   - **Purpose:** Generates a visually clean, pixel-annotated 64x64 skin UV mapping chart.
   - **Functionality:** Uses `Pillow` to map and label every single base and overlay skin coordinate (Front, Back, Left, Right, Top, Bottom) for all body components, serving as a guideline for datasets and rendering development.

2. **`scripts/draw_3d_dimensions.py`**
   - **Purpose:** Visualizes Minecraft skin dimensions.
   - **Functionality:** Uses `matplotlib` to output 3D projection plots that outline the precise pixel sizes and offsets for the Head, Torso, and Limb segments of both inner and outer layers.

3. **`scripts/generate_favicon.py`**
   - **Purpose:** Generates retro pixel-art favicon assets.

---

## 🚀 Getting Started

### Prerequisites
Make sure you have **Node.js** (v18.0+ recommended) and **npm** or **pnpm** installed.

### 1. Clone & Install
```bash
# Clone the repository
git clone https://github.com/EntropyDrop/entropydrop_frontend.git
cd entropydrop_frontend

# Install dependencies
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and add the backend API endpoint and Google OAuth client ID:
```env
VITE_API_URL=https://api.entropydrop.com
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_GTAG_ID=abc
```

### 3. Run Development Server
Start the local server with hot-reload:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:5173/skin/` to view the application.

### 4. Build & Preview
Compile highly optimized production assets:
```bash
# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

### 5. Linting & Formatting
Enforce code quality with ESLint:
```bash
npm run lint
```

---

## 👥 Ecosystem and Links

- **Main Website & Online Generator:** [entropydrop.com](https://entropydrop.com)
- **Hugging Face Model:** [EntropyDrop/Sking](https://huggingface.co/EntropyDrop/Sking) — Access model weights, dataset descriptions, and fine-tuning details.
- **Financial Ledger & Datasets:** [github.com/EntropyDrop/financial](https://github.com/EntropyDrop/financial)
- **Discord Community:** [Join EntropyDrop Discord](https://discord.gg/ByX7TwqDcw)

---

## 📄 License

This project is licensed under the terms of the [LICENSE](./LICENSE) file included in this repository.
