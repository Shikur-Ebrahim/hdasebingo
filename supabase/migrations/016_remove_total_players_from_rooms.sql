-- 016_remove_total_players_from_rooms.sql
-- Remove total_players column from rooms table
-- Player counts are dynamically derived from users registered with the agent (users.inviter_id)

ALTER TABLE public.rooms DROP COLUMN IF EXISTS total_players;
