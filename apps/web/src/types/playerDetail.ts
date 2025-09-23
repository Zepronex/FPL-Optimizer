export interface PlayerSuggestion {
  id: number;
  name: string;
  teamShort: string;
  price: number;
  score: number;
  form: number;
  xg90: number;
  xa90: number;
  next3Ease: number;
  delta: number;
}

export interface SuggestionsResponse {
  currentPlayer: {
    id: number;
    name: string;
    score: number;
  };
  suggestions: PlayerSuggestion[];
  count: number;
}
