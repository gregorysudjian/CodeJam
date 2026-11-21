-- 0005_leaderboard_public: the leaderboard is readable before sign-in (docs/LIVE.md, F1).
-- NEEDS GREG'S OK: changes the CONTRACTS.md rule "leaderboard: readable by any signed-in user".
--
-- Why: a visitor who scans the QR code and taps Leaderboard, or opens the site for the first time,
-- is not signed in yet, so the app showed "Be the first on the board" over a full board, and the
-- landing page showed no top scores. Signing every visitor in just to read it would spend the
-- anonymous sign-in limit (1000 an hour, shared by everyone on the venue wifi) and create a
-- player for each phone.
--
-- What is exposed: exactly what the kiosk already shows on a screen to the whole room (display
-- name, workout, mode, round length, score, date). The tables stay closed to anon (0001, 0004).
-- It stays a PLAIN view: never add security_invoker (see CONTRACTS.md).

grant select on public.leaderboard to anon;
