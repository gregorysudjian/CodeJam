# src/ui notes (Jiscar 1, branch j1-ui)

## Sat 18:20

**A judge will notice**

- Results (demo 1:30–1:55) is one screen at 1280×720, 1366×768 and a MacBook window: all six
  move rows and PLAY THIS NEXT sit above the footer (QA Q5 is fully fixed, including the 10 px).
- On tall screens the footer sits on the bottom edge instead of floating mid-page.
- MISS keeps a dark outline, so red-blind players can still read it (from Patrick 2).

**Polish nobody will see**

- `short` / `tight` height variants in theme.css replace the `.results-screen` override pile.
- tailwind-merge learns `text-outline`, so `cn()` doesn't drop the colour.

**Not tested:** camera screens, Supabase, the AI coach (a longer AI recap may push the coach
card to scroll at 1280×720; PLAY AGAIN stays visible either way).

**Next:** Q19 select at 125–150 % → Q20 leaderboard and kiosk at 125–150 % → copy rows C5,
C6, C7, C10 → Q12 landing QR → dashboard with 3–10 sessions → focus and contrast pass.
