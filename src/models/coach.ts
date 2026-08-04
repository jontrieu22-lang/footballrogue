/**
 * The coach attached to each team. Experience is the meta-progression
 * currency: it drives the weekly read roll (how often you see the
 * opponent's game plan before committing) and, via scouting tier, how
 * sharp your draft and weekly scouting reports are. The player's coach
 * survives being fired — see DESIGN.md §5.3 and the franchise save.
 */
export interface Coach {
  id: string;
  name: string;
  /** Career seasons coached. A fresh hire starts at 0. */
  experience: number;
}
