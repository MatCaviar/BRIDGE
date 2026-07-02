---
version: "alpha"
name: "Aether Dynamics"
description: "Aether Dynamics Hero Section is designed for introducing a product with clear above-the-fold messaging. Key features include headline hierarchy, supporting copy, and a primary call-to-action. It is suitable for homepage hero areas and campaign landing pages."
colors:
  primary: "#4B4BA0"
  secondary: "#09090B"
  tertiary: "#8F47AE"
  neutral: "#09090B"
  background: "#09090B"
  surface: "#A1A1AA"
  text-primary: "#52525B"
  text-secondary: "#A1A1AA"
  border: "#3F3F46"
  accent: "#4B4BA0"
typography:
  display-lg:
    fontFamily: "System Font"
    fontSize: "72px"
    fontWeight: 600
    lineHeight: "72px"
    letterSpacing: "-0.025em"
  body-md:
    fontFamily: "SFMono-Regular"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22.75px"
  label-md:
    fontFamily: "System Font"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
rounded:
  full: "9999px"
spacing:
  base: "4px"
  sm: "1px"
  md: "4px"
  lg: "8px"
  xl: "12px"
  gap: "4px"
components:
  button-link:
    textColor: "#F4F4F5"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "1px"
---

## Overview

- **Composition cues:**
  - Layout: Flex
  - Content Width: Bounded
  - Framing: Glassy
  - Grid: Minimal

## Colors

The color system uses dark mode with #4B4BA0 as the main accent and #09090B as the neutral foundation.

- **Primary (#4B4BA0):** Main accent and emphasis color.
- **Secondary (#09090B):** Supporting accent for secondary emphasis.
- **Tertiary (#8F47AE):** Reserved accent for supporting contrast moments.
- **Neutral (#09090B):** Neutral foundation for backgrounds, surfaces, and supporting chrome.

- **Usage:** Background: #09090B; Surface: #A1A1AA; Text Primary: #52525B; Text Secondary: #A1A1AA; Border: #3F3F46; Accent: #4B4BA0

- **Gradients:** bg-gradient-to-r from-transparent to-transparent via-zinc-300/40, bg-gradient-to-r from-zinc-200 to-zinc-400 via-zinc-500

## Typography

Typography pairs System Font for display hierarchy with SFMono-Regular for supporting content and interface copy.

- **Display (`display-lg`):** System Font, 72px, weight 600, line-height 72px, letter-spacing -0.025em.
- **Body (`body-md`):** SFMono-Regular, 14px, weight 400, line-height 22.75px.
- **Labels (`label-md`):** System Font, 16px, weight 400, line-height 24px.

## Layout

Layout follows a flex composition with reusable spacing tokens. Preserve the flex, bounded structural frame before changing ornament or component styling. Use 4px as the base rhythm and let larger gaps step up from that cadence instead of introducing unrelated spacing values.

Treat the page as a flex / bounded composition, and keep that framing stable when adding or remixing sections.

- **Layout type:** Flex
- **Content width:** Bounded
- **Base unit:** 4px
- **Scale:** 1px, 4px, 8px, 12px, 24px, 32px, 40px
- **Gaps:** 4px, 6px, 8px, 12px

## Elevation & Depth

Depth is communicated through glass, border contrast, and reusable shadow or blur treatments. Keep those recipes consistent across hero panels, cards, and controls so the page reads as one material system.

Surfaces should read as glass first, with borders, shadows, and blur only reinforcing that material choice.

- **Surface style:** Glass
- **Borders:** 0.8px #3F3F46; 0.8px #27272A
- **Shadows:** rgba(255, 255, 255, 0.03) 0px 0px 12px 0px inset; rgba(255, 255, 255, 0.02) 0px 2px 4px 0px inset
- **Blur:** 12px

### Techniques
- **Gradient border shell:** Use a thin gradient border shell around the main card. Wrap the surface in an outer shell with 1px padding and a 0px radius. Drive the shell with none so the edge reads like premium depth instead of a flat stroke. Keep the actual stroke understated so the gradient shell remains the hero edge treatment. Inset the real content surface inside the wrapper with a slightly smaller radius so the gradient only appears as a hairline frame.

## Shapes

Shapes rely on a tight radius system anchored by 9999px and scaled across cards, buttons, and supporting surfaces. Icon geometry should stay compatible with that soft-to-controlled silhouette.

Use the radius family intentionally: larger surfaces can open up, but controls and badges should stay within the same rounded DNA instead of inventing sharper or pill-only exceptions.

- **Corner radii:** 9999px
- **Icon treatment:** Linear
- **Icon sets:** Solar

## Components

Anchor interactions to the detected button styles.

### Buttons
- **Links:** text #F4F4F5, radius 9999px, padding 1px, border 0px solid rgb(229, 231, 235).

### Iconography
- **Treatment:** Linear.
- **Sets:** Solar.

## Do's and Don'ts

Use these constraints to keep future generations aligned with the current system instead of drifting into adjacent styles.

### Do
- Do use the primary palette as the main accent for emphasis and action states.
- Do keep spacing aligned to the detected 4px rhythm.
- Do reuse the Glass surface treatment consistently across cards and controls.
- Do keep corner radii within the detected 9999px family.

### Don't
- Don't introduce extra accent colors outside the core palette roles unless the page needs a new semantic state.
- Don't mix unrelated shadow or blur recipes that break the current depth system.
- Don't exceed the detected minimal motion intensity without a deliberate reason.

## Motion

Motion stays restrained and interface-led across text, layout, and scroll transitions. Timing clusters around 150ms and 300ms. Easing favors ease and cubic-bezier(0.4.

**Motion Level:** minimal

**Durations:** 150ms, 300ms

**Easings:** ease, cubic-bezier(0.4, 0, 0.2, 1)

## WebGL

Reconstruct the graphics as a full-bleed background field using webgl, renderer, dpr clamp, custom shaders. The effect should read as retro-futurist, technical, and meditative: dot-matrix particle field with green on black and sparse spacing. Build it from dot particles + soft depth fade so the effect reads clearly. Animate it as slow breathing pulse. Interaction can react to the pointer, but only as a subtle drift. Preserve dom fallback.

**Id:** webgl

**Label:** WebGL

**Stack:** ThreeJS, WebGL

**Insights:**
  - **Scene:**
    - **Value:** Full-bleed background field
  - **Effect:**
    - **Value:** Dot-matrix particle field
  - **Primitives:**
    - **Value:** Dot particles + soft depth fade
  - **Motion:**
    - **Value:** Slow breathing pulse
  - **Interaction:**
    - **Value:** Pointer-reactive drift
  - **Render:**
    - **Value:** WebGL, Renderer, DPR clamp, custom shaders

**Techniques:** Dot matrix, Breathing pulse, Pointer parallax, Shader gradients, Noise fields

**Code Evidence:**
  - **HTML reference:**
    - **Language:** html
    - **Snippet:**
      ```html
      <!-- WebGL Canvas Background -->
      <canvas id="gl" class="absolute inset-0 w-full h-full pointer-events-none z-0" aria-hidden="true"></canvas>

      <!-- Overlay UI Wrapper -->
      ```
  - **JS reference:**
    - **Language:** js
    - **Snippet:**
      ```
      import * as THREE from 'three';

      // --- DOM Elements ---
      const canvas = document.getElementById('gl');
      const elNodes = document.getElementById('nNodes');
      const elLinks = document.getElementById('nLinks');
      ```
  - **Renderer setup:**
    - **Language:** js
    - **Snippet:**
      ```
      const elFps = document.getElementById('nFps');

      // --- WebGL Setup ---
      const isMobile = window.innerWidth < 768;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(DPR);
      renderer.setClearColor(0x050505, 1);
      …
      ```
  - **Scene setup:**
    - **Language:** js
    - **Snippet:**
      ```
      import * as THREE from 'three';

      // --- DOM Elements ---
      const canvas = document.getElementById('gl');
      const elNodes = document.getElementById('nNodes');
      ```

## ThreeJS

Reconstruct the Three.js layer as a full-bleed background field with layered spatial depth that feels retro-futurist, volumetric, and technical. Use dpr clamp renderer settings, perspective, ~55deg fov, plane + custom buffer geometry geometry, shadermaterial materials, and ambient + key + rim lighting. Motion should read as slow orbital drift, with poster frame + dom fallback.

**Id:** threejs

**Label:** ThreeJS

**Stack:** ThreeJS, WebGL

**Insights:**
  - **Scene:**
    - **Value:** Full-bleed background field with layered spatial depth
  - **Render:**
    - **Value:** DPR clamp
  - **Camera:**
    - **Value:** Perspective, ~55deg FOV
  - **Lighting:**
    - **Value:** ambient + key + rim
  - **Materials:**
    - **Value:** ShaderMaterial
  - **Geometry:**
    - **Value:** plane + custom buffer geometry
  - **Motion:**
    - **Value:** Slow orbital drift

**Techniques:** Shader materials, Particle depth, Timeline beats, DPR clamp, Poster frame + DOM fallback

**Code Evidence:**
  - **HTML reference:**
    - **Language:** html
    - **Snippet:**
      ```html
      <!-- WebGL Canvas Background -->
      <canvas id="gl" class="absolute inset-0 w-full h-full pointer-events-none z-0" aria-hidden="true"></canvas>

      <!-- Overlay UI Wrapper -->
      ```
  - **JS reference:**
    - **Language:** js
    - **Snippet:**
      ```
      import * as THREE from 'three';

      // --- DOM Elements ---
      const canvas = document.getElementById('gl');
      const elNodes = document.getElementById('nNodes');
      const elLinks = document.getElementById('nLinks');
      ```
  - **Renderer setup:**
    - **Language:** js
    - **Snippet:**
      ```
      const elFps = document.getElementById('nFps');

      // --- WebGL Setup ---
      const isMobile = window.innerWidth < 768;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(DPR);
      renderer.setClearColor(0x050505, 1);
      …
      ```
  - **Scene setup:**
    - **Language:** js
    - **Snippet:**
      ```
      import * as THREE from 'three';

      // --- DOM Elements ---
      const canvas = document.getElementById('gl');
      const elNodes = document.getElementById('nNodes');
      ```
