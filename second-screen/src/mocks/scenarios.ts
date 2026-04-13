import { MatchEventType, TeamSide } from "../types";

export type ScenarioEvent = {
  minuteOffset: number; // added to current match minute when applied
  type: MatchEventType;
  teamSide: TeamSide;
  playerName?: string;
};

export type Scenario = {
  name: string;
  description: string;
  events: ScenarioEvent[];
};

export const SCENARIOS: Record<string, Scenario> = {
  quiet_opening: {
    name: "Quiet Opening",
    description: "Slow first 10 minutes with minimal action",
    events: [
      { minuteOffset: 2, type: "foul", teamSide: "home" },
      { minuteOffset: 5, type: "shot", teamSide: "away" },
      { minuteOffset: 8, type: "foul", teamSide: "away" },
    ],
  },

  barcelona_pressure: {
    name: "Barcelona Pressure Spell",
    description: "Barcelona piling on with shots and corners",
    events: [
      { minuteOffset: 1, type: "shot", teamSide: "away", playerName: "Pedri" },
      { minuteOffset: 1, type: "corner", teamSide: "away" },
      { minuteOffset: 2, type: "shot_on_target", teamSide: "away", playerName: "Lewandowski" },
      { minuteOffset: 2, type: "corner", teamSide: "away" },
      { minuteOffset: 3, type: "shot", teamSide: "away", playerName: "Yamal" },
      { minuteOffset: 4, type: "foul", teamSide: "home", playerName: "Koke" },
    ],
  },

  atletico_foul_streak: {
    name: "Atletico Foul Streak",
    description: "Atletico committing fouls leading to yellow cards",
    events: [
      { minuteOffset: 1, type: "foul", teamSide: "home", playerName: "Llorente" },
      { minuteOffset: 2, type: "foul", teamSide: "home", playerName: "Witsel" },
      { minuteOffset: 3, type: "yellow_card", teamSide: "home", playerName: "Witsel" },
      { minuteOffset: 4, type: "foul", teamSide: "away", playerName: "Gavi" },
      { minuteOffset: 5, type: "yellow_card", teamSide: "home", playerName: "Llorente" },
    ],
  },

  consecutive_corners: {
    name: "Corner Exchange",
    description: "Multiple corners in quick succession from both teams",
    events: [
      { minuteOffset: 1, type: "corner", teamSide: "home" },
      { minuteOffset: 1, type: "shot", teamSide: "home", playerName: "Griezmann" },
      { minuteOffset: 2, type: "corner", teamSide: "home" },
      { minuteOffset: 2, type: "corner", teamSide: "away" },
      { minuteOffset: 3, type: "shot_on_target", teamSide: "away", playerName: "Raphinha" },
    ],
  },

  goal_after_pressure: {
    name: "Goal After Sustained Pressure",
    description: "Barcelona pressure build-up culminating in a goal",
    events: [
      { minuteOffset: 1, type: "shot", teamSide: "away", playerName: "Pedri" },
      { minuteOffset: 1, type: "corner", teamSide: "away" },
      { minuteOffset: 2, type: "shot_on_target", teamSide: "away", playerName: "Lewandowski" },
      { minuteOffset: 2, type: "foul", teamSide: "home" },
      { minuteOffset: 3, type: "shot_on_target", teamSide: "away", playerName: "Raphinha" },
      { minuteOffset: 3, type: "goal", teamSide: "away", playerName: "Raphinha" },
    ],
  },

  atletico_counter: {
    name: "Atletico Counter-Attack",
    description: "Atletico hit on the break with quick transitions",
    events: [
      { minuteOffset: 1, type: "foul", teamSide: "away" },
      { minuteOffset: 1, type: "shot", teamSide: "home", playerName: "Griezmann" },
      { minuteOffset: 2, type: "shot_on_target", teamSide: "home", playerName: "Morata" },
      { minuteOffset: 2, type: "corner", teamSide: "home" },
      { minuteOffset: 3, type: "goal", teamSide: "home", playerName: "Morata" },
    ],
  },
};
