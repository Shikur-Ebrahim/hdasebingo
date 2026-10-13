-- Enable Supabase Realtime on bingo tables + users for INSTANT updates
-- Run this in Supabase SQL Editor

-- Add tables to Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE bingo_games;
ALTER PUBLICATION supabase_realtime ADD TABLE bingo_players;
ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- Set REPLICA IDENTITY FULL so UPDATE events include all columns
ALTER TABLE bingo_games REPLICA IDENTITY FULL;
ALTER TABLE bingo_players REPLICA IDENTITY FULL;
ALTER TABLE users REPLICA IDENTITY FULL;
