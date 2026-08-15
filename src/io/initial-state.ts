import type { BattleState, PlayerSide } from "../domain/battle-state.js";
import { singleTurnBattleState } from "../fixtures/single-turn-battle-state.js";
import { createBattleStateFromTeams, loadBattleStateFile } from "./battle-state-file.js";
import { importOpponentTeamFile, importTeamFile } from "./team-importer.js";

export interface InitialStateOptions {
  sample: boolean;
  statePath?: string;
  playerTeamPath?: string;
  opponentTeamPath?: string;
  regulationId: string;
  playerSide: PlayerSide;
}

export function loadInitialState(args: string[]): BattleState {
  const options = parseInitialStateArguments(args);
  if (options.sample) return structuredClone(singleTurnBattleState);
  if (options.statePath) return loadBattleStateFile(options.statePath);

  if (!options.playerTeamPath || !options.opponentTeamPath) {
    throw new Error(
      [
        "Start with --state <battle.json>, --sample, or both team files:",
        "--player-team <team.txt> --opponent-team <team.txt> [--regulation champions-m-b]"
      ].join("\n")
    );
  }

  const playerTeam = importTeamFile(options.playerTeamPath, options.regulationId);
  const opponentTeam = importOpponentTeamFile(
    options.opponentTeamPath,
    options.regulationId
  );

  return createBattleStateFromTeams({
    regulationId: options.regulationId,
    playerSide: options.playerSide,
    p1Team: options.playerSide === "p1" ? playerTeam : opponentTeam,
    p2Team: options.playerSide === "p2" ? playerTeam : opponentTeam
  });
}

export function parseInitialStateArguments(args: string[]): InitialStateOptions {
  const result: InitialStateOptions = {
    sample: false,
    regulationId: "champions-m-b",
    playerSide: "p1"
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--sample") {
      result.sample = true;
    } else if (flag === "--state") {
      result.statePath = requireValue(flag, value);
      index += 1;
    } else if (flag === "--player-team") {
      result.playerTeamPath = requireValue(flag, value);
      index += 1;
    } else if (flag === "--opponent-team") {
      result.opponentTeamPath = requireValue(flag, value);
      index += 1;
    } else if (flag === "--regulation") {
      result.regulationId = requireValue(flag, value);
      index += 1;
    } else if (flag === "--player-side") {
      const side = requireValue(flag, value);
      if (side !== "p1" && side !== "p2") throw new Error("--player-side must be p1 or p2.");
      result.playerSide = side;
      index += 1;
    } else {
      throw new Error(`Unknown startup option '${flag}'.`);
    }
  }

  return result;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}
