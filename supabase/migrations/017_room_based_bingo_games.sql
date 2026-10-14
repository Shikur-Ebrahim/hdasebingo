-- 017_room_based_bingo_games.sql
-- Add room_id and total_players to bingo_games

-- 1. Add columns to bingo_games
ALTER TABLE public.bingo_games 
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE;

ALTER TABLE public.bingo_games 
  ADD COLUMN IF NOT EXISTS total_players INTEGER DEFAULT 0;

-- 2. Indexes for fast lookup by room and stake
CREATE INDEX IF NOT EXISTS idx_bingo_games_room_id ON public.bingo_games(room_id);
CREATE INDEX IF NOT EXISTS idx_bingo_games_room_stake ON public.bingo_games(room_id, stake);
CREATE INDEX IF NOT EXISTS idx_bingo_games_room_status ON public.bingo_games(room_id, status);

-- 3. Populate initial 4 stake games (10, 20, 50, 100 ETB) for all existing active rooms
DO $$
DECLARE
  r RECORD;
  s INTEGER;
  stakes INTEGER[] := ARRAY[10, 20, 50, 100];
BEGIN
  FOR r IN SELECT id FROM public.rooms WHERE status = 'active' LOOP
    FOREACH s IN ARRAY stakes LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.bingo_games 
        WHERE room_id = r.id AND stake = s AND status IN ('waiting', 'calling')
      ) THEN
        INSERT INTO public.bingo_games (
          game_id,
          room_id,
          stake,
          prize_pool,
          total_players,
          status,
          called_numbers,
          start_at
        ) VALUES (
          floor(100 + random() * 900)::text,
          r.id,
          s,
          0,
          0,
          'waiting',
          '[]'::jsonb,
          (NOW() + INTERVAL '1 year')
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;
