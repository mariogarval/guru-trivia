export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          country: string | null;
          preferred_language: string;
          total_points: number;
          lives: number;
          last_life_regen: string;
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          country?: string | null;
          preferred_language?: string;
          total_points?: number;
          lives?: number;
          last_life_regen?: string;
          created_at?: string;
        };
        Update: {
          username?: string | null;
          country?: string | null;
          preferred_language?: string;
          total_points?: number;
          lives?: number;
          last_life_regen?: string;
        };
      };
      questions: {
        Row: {
          id: string;
          match_id: string | null;
          category: string;
          difficulty: string;
          question_text: string;
          options: Json;
          correct_answer_index: number;
          explanation: string | null;
          language: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_id?: string | null;
          category: string;
          difficulty: string;
          question_text: string;
          options: Json;
          correct_answer_index: number;
          explanation?: string | null;
          language?: string;
          created_at?: string;
        };
        Update: {
          match_id?: string | null;
          category?: string;
          difficulty?: string;
          question_text?: string;
          options?: Json;
          correct_answer_index?: number;
          explanation?: string | null;
          language?: string;
        };
      };
      user_answers: {
        Row: {
          id: string;
          user_id: string;
          question_id: string;
          is_correct: boolean;
          time_taken: number;
          points_earned: number;
          answered_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          question_id: string;
          is_correct: boolean;
          time_taken: number;
          points_earned: number;
          answered_at?: string;
        };
        Update: never;
      };
      matches: {
        Row: {
          id: string;
          home_team: string;
          away_team: string;
          home_team_crest: string | null;
          away_team_crest: string | null;
          status: string;
          kickoff_time: string;
          venue: string | null;
          current_score: string | null;
        };
        Insert: {
          id: string;
          home_team: string;
          away_team: string;
          home_team_crest?: string | null;
          away_team_crest?: string | null;
          status: string;
          kickoff_time: string;
          venue?: string | null;
          current_score?: string | null;
        };
        Update: {
          status?: string;
          current_score?: string | null;
          venue?: string | null;
        };
      };
      leagues: {
        Row: {
          id: string;
          name: string;
          code: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          name?: string;
        };
      };
      league_members: {
        Row: {
          league_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          league_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: never;
      };
    };
    Views: {
      leaderboard: {
        Row: {
          user_id: string;
          username: string | null;
          country: string | null;
          total_points: number;
          global_rank: number;
          country_rank: number;
        };
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
