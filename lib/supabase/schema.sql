-- GURU World Cup 2026 — Supabase Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  country TEXT,
  preferred_language TEXT DEFAULT 'en',
  total_points INTEGER DEFAULT 0,
  lives INTEGER DEFAULT 5,
  last_life_regen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Questions
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('historical', 'player', 'team', 'tournament', 'live')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer_index INTEGER NOT NULL CHECK (correct_answer_index BETWEEN 0 AND 3),
  explanation TEXT,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions are publicly readable" ON questions FOR SELECT USING (true);
CREATE POLICY "Service role can manage questions" ON questions FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_questions_match_id ON questions(match_id);
CREATE INDEX idx_questions_difficulty ON questions(difficulty);
CREATE INDEX idx_questions_language ON questions(language);
CREATE INDEX idx_questions_category ON questions(category);

-- User Answers
CREATE TABLE user_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_taken INTEGER NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, question_id)
);

ALTER TABLE user_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see own answers" ON user_answers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own answers" ON user_answers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_answers_user_id ON user_answers(user_id);
CREATE INDEX idx_user_answers_question_id ON user_answers(question_id);

-- Matches
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_team_crest TEXT,
  away_team_crest TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'live', 'finished')),
  kickoff_time TIMESTAMPTZ NOT NULL,
  venue TEXT,
  current_score TEXT
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Matches are publicly readable" ON matches FOR SELECT USING (true);
CREATE POLICY "Service role can manage matches" ON matches FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_kickoff_time ON matches(kickoff_time);

-- Leagues
CREATE TABLE leagues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leagues are publicly readable" ON leagues FOR SELECT USING (true);
CREATE POLICY "Users can create leagues" ON leagues FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "League creator can update" ON leagues FOR UPDATE USING (auth.uid() = created_by);

CREATE TABLE league_members (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (league_id, user_id)
);

ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "League members are viewable by members" ON league_members FOR SELECT USING (true);
CREATE POLICY "Users can join leagues" ON league_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave leagues" ON league_members FOR DELETE USING (auth.uid() = user_id);

-- Leaderboard (materialized view updated hourly via cron or trigger)
CREATE MATERIALIZED VIEW leaderboard AS
SELECT
  p.id AS user_id,
  p.username,
  p.country,
  p.total_points,
  ROW_NUMBER() OVER (ORDER BY p.total_points DESC) AS global_rank,
  ROW_NUMBER() OVER (PARTITION BY p.country ORDER BY p.total_points DESC) AS country_rank
FROM profiles p
WHERE p.total_points > 0;

CREATE UNIQUE INDEX ON leaderboard(user_id);
CREATE INDEX ON leaderboard(global_rank);
CREATE INDEX ON leaderboard(country, country_rank);

-- Function to refresh leaderboard
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Realtime: enable on profiles table for leaderboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
