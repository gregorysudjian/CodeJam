-- 0008: the landing's sign-up form asks "is this username taken?" before the visitor has signed
-- in, so the check is open to anon too. It answers only true or false for one name; names are
-- public on the leaderboard already. The other friends functions stay signed-in only.
grant execute on function public.username_taken(text) to anon;
