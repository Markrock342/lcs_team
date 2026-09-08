# LCS Studio Design System

## 1. Project overview
- Product: Limit Code Studio Team Workspace
- Surface: Dashboard/Admin + App/Product UI redesign
- Platform: Responsive web/PWA
- Users: ทีม PM, Backend, Design/Frontend, Sale, Admin และ Guest
- Goal: อ่านสถานะเร็ว ใช้งานประจำวันง่าย และคงรูปแบบเดียวกันทุกหน้า

## 2. Brand direction
- Style: Creative studio, calm, precise, information-first
- Concept: “Production Job Jacket” — รายการงานเป็นซองงานที่แบ่งชื่อ สถานะ metadata และ action เป็นลำดับชัดเจน
- Voice: ไทยธรรมชาติ กระชับ ใช้คำกริยาตรงไปตรงมา
- Adversarial verdict: แนวคิดยังจำได้เมื่อปิดชื่อแบรนด์ เพราะ card anatomy และ status stamp ผูกกับขั้นตอนผลิตงาน; จุดอ่อนเดิมคือ card grid น้ำหนักเท่ากัน จึงแก้ด้วย surface hierarchy และ metadata rail
- References: [Amber Studio Dashboard](https://contra.com/p/rUZrl7Mc-amber-creative-studio-project-control-dashboard), [beQ Dashboard](https://ux-design-awards.com/winners/2026-1-beq-dashboard-smart-investment-reward-control), [Rubrik Aura](https://www.rubrik.com/blog/company/26/5/rubriks-aura-design-system-wins-the-2026-if-design-award), [ThaiGraph Typography](https://thaigraph.com/learn/typography/)

## 3. Color system
- Dark dominant: `#071018`; surface: `#0D1A28`; raised: `#132433`
- Dark text: `#EEF5FB`; muted: `#A7BDCF`; accent: `#48A8D8`
- Light dominant: `#F3F6F8`; surface: `#FFFFFF`; raised: `#E9F0F4`
- Light text: `#13202C`; muted: `#536B7D`; accent: `#176F9E`
- Status families: slate=pending, amber=waiting, blue=active, violet=review/quoted, green=done/won, red=urgent/lost
- Separation uses background levels and a soft shadow. Borders are reserved for controls, dividers, and dense records.
- Color is always paired with a status label and shape.

## 4. Typography system
- Personality: precise creative studio
- Family: IBM Plex Sans Thai for Thai/Latin metric compatibility and dense dashboard readability
- Scale: h1 28/32, h2 20/24, h3 17/20, body 16/26, body-sm 14/22, caption 13/20, button 14/20
- Thai body line-height is 1.6; long copy is capped at 70ch.
- Do not add letter spacing to Thai copy. Tracking is permitted only for short Latin metadata labels.

## 5. Layout system
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px
- Page gap: 24px mobile, 32px desktop
- Data grids use `repeat(auto-fit, minmax(280px, 1fr))`
- Desktop shell keeps the sidebar; mobile keeps top header and five-item bottom navigation.
- Dense pages use full content width; focused forms/settings use a narrower reading column.
- Horizontal workflows use a responsive grid on desktop and a filtered stack or snap rail on mobile with hidden scrollbars.

## 6. Component system
- Base: native React/HTML + Tailwind v4 utilities
- Card: `Card`, `CardHeader`, `JobJacket`
- Status: `StatusStamp` plus domain wrappers
- Data: `MetricTile`, `ListRow`, `PageLoader`, `EmptyState`, `ErrorState`
- Controls: existing Button/Input/Select/Textarea, upgraded with label association and focus-visible states
- Briefing: `WorkspaceBrief` on the dashboard — recessed composer, status stamp, typewriter caret
- Sales prospects: category → region → province → court cards; never dump a full import as one grid
- Modal: focused task sheet on mobile, dialog on desktop, Escape close and focus restoration

## 7. Card and section style
- Job Jacket radius: 16px; sections: 20px; controls: 12px
- Cards use one raised surface and subtle shadow; no nested elevated cards
- Status highlight is a full-width metadata band or subtle whole-card tint, never a side stripe
- Media is optional; missing/failed media collapses without reserving blank space

## 8. Icon system
- Existing Lucide set is retained to avoid mixing icon families during this redesign
- Standard sizes: 16px metadata, 18–20px controls, 24px empty states
- Icon-only controls require an accessible label; status never relies on icons alone

## 9. Image and asset rules
- Logo: existing high-resolution PNG
- Client cover: image MIME types only, 16:9 crop, lazy below fold
- PDFs and documents render as file rows, never image covers
- Avatar failures fall back to initials

## 10. Animation and interaction
- CSS-only; 160ms controls and 240ms entrances using ease-out
- Animate only transform and opacity
- Dashboard briefing uses diamond status dots and an accent caret while Gemini types; reduced-motion shows the answer immediately
- Every control has hover, focus-visible, active, and disabled states
- Async work shows loading immediately and resolves to inline success/error
- Reduced-motion disables nonessential animation
- CWV targets are pursued through route splitting, reserved media dimensions, lazy images, small hydrated leaves, and CDN-cached assets

## 11. Accessibility
- Body/supporting text targets WCAG AA 4.5:1; UI and focus indicators target 3:1
- Touch targets are at least 44×44px
- Keyboard order follows visual order; dialogs trap/restore focus and close on Escape
- Form labels are programmatically associated; errors use alert semantics
- Status always includes readable text and a shape, not color alone

## 12. Anti-AI-slop rules
- Approved palette is limited to the semantic colors in section 3
- No pure black/white defaults, gradient text, decorative glass, neon glow, side-stripe cards, or nested card grids
- The Job Jacket structure must remain visible across pages
- Existing Lucide is a documented migration exception; do not add another icon library

## 13. Future page instructions
Reuse the tokens, card anatomy, status stamps, layout rhythm, Thai typography, and state components here. New statuses must define dark/light semantic tokens and a non-color cue.

## 14. Update policy
Update this file whenever tokens, typography, card anatomy, status semantics, motion, or responsive layout rules change.
