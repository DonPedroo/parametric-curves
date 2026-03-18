# Parametric Curves & Procedural Textures

This project started with a simple problem: I needed to generate design elements based on parametric curves and structured patterns from client brand systems. The math is straightforward, but building and iterating on these visuals in traditional motion tools like After Effects quickly becomes slow and complicated.

So instead of forcing it through legacy tools, I built a small system in code where curves, spacing, deformation, and motion are controlled directly through parameters.

Parametric Curves & Procedural Textures is that tool — a lightweight engine for generating curve-based graphics and organic procedural patterns in real time.

## 🚀 Core Features

### 🌈 Arches Effect
The Arches effect generates a series of mathematically perfect curves using a quadratic Bezier distance field approach.

-   **Newton-Raphson Solver**: Unlike simple approximations, Arches uses a 5-step unrolled iterative Newton-Raphson solver to find the closest point on a curve. This ensures rock-solid stability even for "flat" curves that typically cause division-by-zero errors in standard solvers.
-   **Modes**:
    -   **Linear**: Traditional parallel arch groups.
    -   **Circular**: Polar coordinate mapping that wraps arches around a center point, creating radial patterns.
-   **Interaction**: Features a "magnetic" mouse displacement system. As you move the mouse, the arches are pushed or pulled with adjustable momentum and falloff shapes.
-   **Animation**: Includes `Radiate` (progression scaling), `Wobble` (sine-wave deformation), and `Rotation` speeds.

### 🌲 Bark / Topography Effect
A procedural texture engine designed to simulate organic patterns like wood grain, tree rings, or topographic maps.

-   **Domain Warping**: Uses Fractal Brownian Motion (FBM) to warp the underlying coordinate space, creating "fluid" organic contours rather than rigid geometric shapes.
-   **Isosurface Lines**: Generates sharp, anti-aliased lines based on high-frequency noise fields.
-   **Customization**: Control ring density, spacing exponent (to concentrate rings in the center or perimeter), line width, and warping frequency.
-   **Recursive Noise**: Implements a 3-octave FBM for rich, natural variation.

### 🔄 Perfect Loop Export System
The project is built specifically for creators who need seamless loops for social media or digital displays.

-   **Speed Quantization**: The system automatically adjusts all animation speeds (`Time Speed`, `Wobble Speed`, `Rotation Speed`) to the nearest "perfect cycle" based on your chosen export duration.
-   **Consistency**: Whether you are previewing at 60 FPS or exporting a sequence at 30 FPS, the mathematical state of every shader uniform is identical for every frame.
-   **Workflow**: 
    1. Set your `Export Duration` (e.g., 4 seconds).
    2. Toggle `Perfect Loop`.
    3. Export a sequence of numbered PNGs that bridge perfectly from the last frame back to the first.

## 🛠 Technology Stack

-   **Three.js (WebGPU)**: Next-generation rendering using the WebGPU API.
-   **TSL (Three Shading Language)**: Direct shader programming within JavaScript, allowing for modular and highly optimized effect chains.
-   **Vite**: Lightning-fast development server and build tool.
-   **lil-gui**: Real-time parameter control and preset management.

## 📖 Getting Started

### Installation
```bash
npm install
```

### Development
Start the local dev server:
```bash
npm run dev
```

### Building for Production
```bash
npm run build
```

## 🎨 Controls & Presets
The sidebar GUI allows you to:
-   **Manage Themes**: Save and load visual presets.
-   **Drag & Drop**: Drop an exported PNG back into the window to restore the exact settings used to generate it (via embedded metadata).
-   **Post-Processing**: Fine-tune color correction, dither, and noise overlays.
