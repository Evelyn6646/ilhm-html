# TRUSTIFY Design Direction

## Product and audience

TRUSTIFY helps Indonesian residents pause and assess suspicious messages, phone numbers, bank accounts, and links. The interface should feel like a practical public-interest security tool, not a threat-intelligence console or a sales site.

## Visual identity

- **Palette:** marine navy anchors navigation; a cool mineral canvas separates work areas; teal marks primary actions; green, amber, and red are reserved for risk states. Never use status color as decoration.
- **Typography:** Sora gives headings a precise, calm technical character; DM Sans keeps Indonesian labels and long explanations comfortable to read. Use tabular numerals for scores and dates.
- **Composition:** the public page leads with the actual check workflow and a legible sample result, not an abstract security illustration. Signed-in screens prioritize the check action, real recent activity, and evidence. Admin screens prioritize review queues and tables.
- **Surfaces:** mostly flat, with fine borders for grouping. Use radius 4px for controls, 8px for framed work areas, and no card-within-card. Shadows are limited to overlays.
- **Iconography:** use restrained, task-specific Lucide outline icons. The shield identifies the product; a label always accompanies risk color.
- **Motion:** ENERGY 2 / RHYTHM 3 / MOTION 1. Composition varies with page intent; motion is limited to state changes and short color transitions. Honor `prefers-reduced-motion`.

## Decision notes

- Navy navigation creates a stable frame; light work surfaces preserve contrast for messages, URLs, and report details.
- Teal is concentrated on the next action so it remains easy to find.
- Risk colors are semantic only, because an incorrect color interpretation could affect a user's decision.
- The hero embeds a working message check and a clearly labelled simulated finding to demonstrate the product without claiming a real-world detection.
- Public counts come from the database and are visibly marked as including simulation data when demo records exist; no fabricated totals or trend lines are added.
- Heuristic number-pattern scores are kept separate from reputation status, because digit shape cannot identify an account holder or prove fraud.