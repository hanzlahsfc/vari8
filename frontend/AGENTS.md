# Frontend design instructions

These permanent project instructions apply whenever an agent creates, modifies, or reviews UI anywhere in this repository. Follow explicit user direction for the current task, and scale design effort to the requested change. Setup and documentation tasks should stay within their requested scope.

Use the existing Next.js, React, Tailwind CSS, shadcn/ui, and Motion for React foundation. When using general design skills, retain the project-specific preferences below: purposeful glass, glow, gradients, atmosphere, and experimental composition are allowed; blanket aesthetic bans must not replace this design direction.

## Design direction and composition

- Never default to generic AI-generated SaaS UI. Before substantial UI work, establish a clear visual concept appropriate to the product, audience, and content.
- Treat design through **material, lighting, depth, composition, typography, and motion**. Make these choices work together as one visual language.
- Avoid repetitive rounded cards, uniform flat dark backgrounds, and default shadcn styling. Use cards or dark themes when they serve the content, with deliberate surface treatment and hierarchy.
- Choose layout from the content and desired emphasis. Avoid conventional **hero + three cards + feature grid** compositions unless they genuinely suit the design. Do not fill space with invented metrics, decorative charts, or interchangeable feature blocks.
- Choose typography deliberately: typefaces, scale, weight, line height, line length, and spacing should reinforce the concept and reading hierarchy. Preserve room for content and clear relationships between elements.
- When modifying existing UI, extend its established design language. A broader redesign should follow the user's requested scope.

## Materials, atmosphere, and lighting

- Use layered surfaces and atmospheric backgrounds where they support depth, hierarchy, or the visual concept. Distinguish the background, structural surfaces, and foreground elements through deliberate differences in tone, texture, opacity, borders, and shadows.
- Use **glass, glow, gradients, noise, masks, and shaders** when they support the design. Select effects for a specific purpose, such as material character, focus, spatial separation, or atmosphere.
- Treat gradients and glow as **coherent lighting**, not decoration. Keep light direction, color, falloff, highlights, shadows, and reflections consistent with the chosen materials and scene.
- Reserve stronger effects for meaningful focal points. Do not make every component glow, float, or animate; quiet areas help preserve hierarchy.
- Keep text readable, contrast sufficient, and controls recognizable. Check the performance and responsive behavior of expensive blur, shader, or animation effects, and provide a suitable fallback when needed.

## Motion and interaction

- Use **Motion for React** (`motion/react`) for polished interactions and transitions. Motion should explain state changes, provide feedback, or connect related states.
- Establish consistent timing and easing. Apply motion selectively; avoid animating every element or adding ambient loops without a clear design reason.
- Respect reduced-motion preferences through the existing Motion provider. Essential content and interactions must remain usable when motion is reduced.
- Give hover, focus, active, loading, and disabled states deliberate treatment where applicable. Preserve keyboard access and visible focus states.

## Components and external sources

- Treat shadcn/ui as editable primitives. Adapt typography, surfaces, colors, borders, radii, spacing, and interaction states to the project's visual language rather than shipping default styling.
- Search for or use high-quality external UI components when they produce a better result than a generic implementation. Possible sources include **21st.dev, Aceternity UI, React Bits, and Magic UI**. These are options, not required dependencies for every page.
- Evaluate a component's visual fit, behavior, accessibility, responsiveness, and compatibility with the existing stack before adopting it.
- Adapt external components to the project's design language. Replace source-specific colors, fonts, spacing, effects, motion, and demo content; compose borrowed components into a coherent page.
- Add only the dependencies and component code the chosen implementation needs.

## Visual inspection and refinement

- After implementing or modifying a page, run the app and inspect the actual rendered result in a browser. Inspect desktop and mobile layouts and exercise the important interactions. For a small component edit, inspect the affected component in context.
- Check composition, typography, spacing, depth, lighting, contrast, responsive behavior, and motion together. A successful build or code check does not establish visual quality.
- Look for generic patterns: repeated rounded containers, unadapted shadcn defaults, formulaic sections, weak typography, disconnected effects, or animation applied everywhere.
- If the result still looks generic or AI-generated, refine it before calling the UI work complete. Reinspect the changed areas to verify the improvement.
- Report what was actually inspected. If visual inspection is unavailable, state that limitation clearly and do not claim the page was visually verified.

## Next.js technical guidance

Keep the framework-managed block below intact. Maintain custom project instructions outside its markers so Next.js can update its technical guidance while preserving the design rules above.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
