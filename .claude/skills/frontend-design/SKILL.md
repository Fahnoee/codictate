---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (React/Next.js with TypeScript) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Styling: Tailwind CSS + DaisyUI

**Always** use Tailwind CSS utility classes as the primary styling approach. Layer DaisyUI component classes on top for interactive UI primitives (buttons, modals, dropdowns, inputs, badges, alerts, etc.).

- Use DaisyUI semantic component classes (`btn`, `card`, `badge`, `modal`, `drawer`, `navbar`, `hero`, `stat`, etc.) as building blocks — then extend and override with Tailwind utilities to achieve the desired aesthetic.
- Leverage DaisyUI's theming system (`data-theme` attribute, CSS variables like `--color-primary`, `--color-base-100`) for cohesive, switchable color palettes.
- Prefer Tailwind utility classes over custom CSS. Only write custom CSS when Tailwind/DaisyUI cannot achieve the effect (e.g., complex clip-paths, noise textures, advanced pseudo-element tricks).
- Never use inline styles when an equivalent Tailwind class exists.
- Apply responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`) consistently — mobile-first.

## Animations: motion (standard) + GSAP (advanced)

### Standard animations — use `motion` (formerly framer-motion)
For component-level motion, page transitions, and interactive micro-animations use `motion` (formerly framer-motion) for React:
- Import by using `import { motion } from "motion/react"`
- `motion.*` components with `initial`, `animate`, `exit`, and `whileHover`/`whileTap` props.
- `AnimatePresence` for mount/unmount transitions.
- `variants` for coordinated, staggered reveal sequences on page load.
- `useMotionValue`, `useSpring`, `useTransform` for physics-based and scroll-linked effects.
- Focus on high-impact moments: staggered page-load reveals, spring-physics interactions, and hover states that feel alive.

**Available motion skill** — read before implementing complex animations:
- **`framer-motion`** (`.agents/skills/framer-motion/SKILL.md`) — expert guidelines for performant animations with the `motion` library (formerly Framer Motion) in React. Read this for advanced patterns, performance tips, and correct API usage.

### Advanced animations — use `gsap` (react)
For scroll-driven storytelling, complex timelines, SVG morphing, or any animation that requires precise sequencing beyond what framer-motion offers use GSAP:
- Use `gsap` with `useGSAP` hook (from `@gsap/react`) for proper React integration and automatic cleanup.
- Use `ScrollTrigger` plugin for scroll-driven animations and parallax effects.
- Use `gsap.timeline()` for multi-step, choreographed sequences.
- Use `gsap.to` / `gsap.from` / `gsap.fromTo` for individual element animations.
- Register plugins at the module level: `gsap.registerPlugin(ScrollTrigger, useGSAP)`.

**Decision guide**: Default to motion for most UI motion. Reach for GSAP when you need scroll-triggered timelines, SVG animation, or animations that must run outside React's render cycle for performance.

**Available GSAP skills** — read the relevant skill before implementing:
- **`gsap-fundamentals`** (`.agents/skills/gsap-fundamentals/SKILL.md`) — core tweens, easing, and animation properties. Start here for any GSAP work.
- **`gsap-sequencing`** (`.agents/skills/gsap-sequencing/SKILL.md`) — complex timelines, labels, callbacks, nested timelines, and position parameters. Use for multi-step cinematic sequences.
- **`gsap-scrolltrigger`** (`.agents/skills/gsap-scrolltrigger/SKILL.md`) — ScrollTrigger plugin: pinning, scrubbing, snap points, parallax. Use for scroll-driven animations and sticky sections.
- **`gsap-react`** (`.agents/skills/gsap-react/SKILL.md`) — React-specific patterns: `useGSAP` hook, ref handling, cleanup, and context management. Always read this when integrating GSAP into React components.
- **`gsap-router`** (`.agents/skills/gsap-router/SKILL.md`) — router skill that delegates to the four above. Use when unsure which GSAP skill to reach for.

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Roboto; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Define the palette via DaisyUI theme variables. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use motion (formerly framer-motion) for component-level animations and micro-interactions. Use GSAP for advanced scroll-driven or timeline-based sequences. Focus on high-impact moments: one well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions. Scroll-triggering and hover states should surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
