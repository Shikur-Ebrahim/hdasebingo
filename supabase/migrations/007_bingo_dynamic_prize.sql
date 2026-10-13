-- Update the prize calculation RPC to handle dynamic commission based on player count
-- 2 players = 0% commission (100% payout)
-- 3+ players = 20% commission (80% payout)

CREATE OR REPLACE FUNCTION bingo_add_to_prize(p_game_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  WITH pcount AS (
    SELECT COUNT(*) as c FROM bingo_players WHERE game_id = p_game_id
  ),
  g AS (
    SELECT stake FROM bingo_games WHERE id = p_game_id
  )
  UPDATE bingo_games
  SET prize_pool = CASE 
        WHEN (SELECT c FROM pcount) < 3 THEN (SELECT c FROM pcount) * (SELECT stake FROM g)
        ELSE (SELECT c FROM pcount) * (SELECT stake FROM g) * 0.8
      END,
      updated_at = NOW()
  WHERE id = p_game_id AND status = 'waiting';
$$;
