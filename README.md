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
- **Visibility:** Choose **Public** or **Private** when creating a skin. Saved skins keep that visibility; conversion in either direction is unavailable.
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
Use **Node.js 24+** and **npm 10+**. Keep the shared `entropydrop_space`
repository beside this checkout and run `npm ci` in it first. Space consumes that
repository as a local source dependency; see its [setup guide](../entropydrop_space/README.md).

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
VITE_API_BASE_URL=http://localhost:8000/skin
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_GTAG_ID=abc
```

### Space world backgrounds

`/space/intro` keeps its original heading, description, statistics and layout.
The intro and login pages, including navigation and Google sign-in, use English.
Nature (`nature`) and Copper Metropolis (`copper-metropolis`) provide a full-viewport
background behind the page and navigation. Nature is shown initially; backgrounds
change only when a world thumbnail is clicked or activated with the keyboard.
Reduced-motion preferences disable transition fades. The original Play buttons include the
current world name and preserve its selector through `/space/login` to the
configured `VITE_SPACE_URL`. The Agent Prompt uses the same selected world.

The supplied screenshots are encoded as responsive 960px/1920px WebP assets.
The target backend must support the world: Copper Metropolis is currently enabled
on development/test backends. Unsupported worlds never silently fall back to Nature.

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

Production releases to S3/CloudFront are managed by the backend deployment tools.

### Pixel font subsets

The site uses checked-in WOFF2 subsets: Latin/punctuation, Chinese UI copy, and
remaining Unicode ranges loaded on demand. `src/styles/fonts.css` uses disjoint
`unicode-range` values and preserves every character in the original font.
After updating Chinese translations, regenerate the subsets with
`python3 scripts/subset-fonts.py` (requires `fonttools[woff]`). Ordinary builds
use the generated files directly and do not require Python.

### Discover rendering and skin previews

Discover bakes its static card positions and orientations, shares a plane geometry,
and updates camera motion and material fades in one frame callback. Loaded cards
use unlit materials and stop drawing their placeholder planes after fading in.
Rendering pauses while the page is hidden or a modal covers it; reduced-motion
preferences use demand rendering. The drawing pixel ratio is capped at 1.5.

DOM thumbnails render when approaching the viewport and copy cached Canvas pixels
directly, without PNG/Base64 encoding. Preview sizes and avatars share downloaded,
decoded sources. The LRU caches retain at most 8 MiB of source pixels and 16 MiB
of preview pixels, with 240 entries per cache and a five-minute TTL. Pending work
is deduplicated, failed work is retryable, and account changes clear the caches
and abort pending source requests. Active DOM and GPU copies have separate lifetimes.
Run `npm run test:discovery` to check loading, rendering controls and cache behavior.

### Architecture boundaries

Discover owns its selection, URL parameters, search criteria and single detail modal.
`Layout` owns shared navigation, the neutral background and global errors. Both
Discover views use `pages/discovery/useDiscoverySearch`; `useDiscoverySelection`
uses React Router so deep links and browser back/forward follow the same state.
The renderer handles camera/texture work and does not update browser history.

`utils/httpClient` handles authorization, one shared refresh, retry and global
errors through explicit `request` calls. Importing `fetchInterceptor` only provides
compatibility exports; it never patches native `fetch`. `authClient` restores the
session in the background. Public gallery requests use `auth: 'none'`; personal
profile requests wait for restoration.

`utils/api` provides `apiFetch` for responses, `apiJson<T>` for JSON, and
`apiResponseJson` when callers first inspect HTTP status. JSON decoding checks the
request's account and cancellation signal again. Profile reads share a 15-second
cache; Discover search opts into a 10-second cache. Other reads remain uncached.
The query cache has an LRU limit of 32 completed entries and approximately 2 MiB
of retained response text. Every consumer owns a cancellation lease; cancelling
all consumers aborts the network request. Failures are retryable. Account changes,
profile update events and successful writes invalidate cached queries.

`hooks/useCurrentUser` owns profile loading for navigation, generation, collections,
forum, credits, subscriptions and skin details. Force refresh notifies mounted
consumers. `useLatestRequest` scopes concurrent search/detail work and cancels it
on replacement or unmount. `mcmodal/useSkinDetails` loads ancestry and counts in
parallel after the main detail arrives. Generation, editor saves and public
Collection uploads preview backend license policy through `hooks/useSkinLicensePolicy`.
Generation and editor saves share `components/SkinLicenseNotice`; public Collection
uploads reuse the editor's rights confirmation copy.

The forum separates `useForumData`, `useForumActions` and presentation components.
Its editor, post detail and video form load only when opened. Run
`npm run test:architecture` for request/cache isolation, URL navigation, stale
responses, session restoration and feature-loading regressions.

### Skin permissions and public sharing

Generation, editor saves and public Collection uploads use `GET /api/licenses/preview`.
The backend recomputes the same policy on submission. Account usage rights and
`public_license` are separate snapshots: public sharing uses CC BY-NC 4.0 and
never overwrites the creator's rights. Private saving grants no new public license.

Fresh AI generation follows the plan at creation, subject to source restrictions.
Editor imports and public Collection uploads confirm the right to upload and edit
without asking for a source category or sending `source_rights`. New uploads are recorded as
`source-license`, subject to source permissions, with no EntropyDrop commercial grant.
Public Collection uploads reuse the editor's confirmation copy for upload, editing
and sharing under CC BY-NC 4.0. Private uploads submit directly without a rights
notice, confirmation dialog or license preview request; the backend still validates
upload permissions and quotas. Direct collection links resolve ownership and
visibility before enabling uploads, including folders on later collection pages.
Collection item responses expose the skin's visibility as `data.is_public`, derived
from its source log. Cards, detail previews and move permissions use that value,
independently of the containing folder. The Move to Collection dialog loads every
page of the owner's custom collections: public skins can move to either visibility,
while private skins can only move to private folders. The backend enforces the same
rule without changing skin visibility or licenses. The current folder is excluded,
and failed destination loads can be retried.
Editor imports confirm before loading the skin; public saving confirms sharing separately.
Known parents always take precedence
over a new source declaration. Manual edits inherit the owner's existing grant,
including after Pro expires; other users receive only the source's public license.
Collections link existing records and never recalculate rights or change visibility.

New public generations send `public_license_consent=true`. Manual public saves also
send it after confirmation. Independent uploads send the legacy `license_consent`
submission flag; private Collection uploads need no separate confirmation UI.
For older clients, an omitted public-consent field falls back to that legacy combined
confirmation. An explicit `public_license_consent=false` always blocks public saving.
Existing private edits inherit directly. Visibility conversion remains unavailable.
Historical records are not relabeled. Deploy the matching backend and frontend
changes together; the new permission codes fit the existing string columns and
require no data migration. Run `npm run test:licenses` for the UI flows and stale
preview protections; backend policy and API coverage lives in `tests/test_licenses.py`
and `tests/test_skin_license_policy.py` alongside existing collection/generation tests.

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
