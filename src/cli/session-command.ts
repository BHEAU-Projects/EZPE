import type { BattleSession } from "../session/battle-session.js";
import { saveBattleSessionFile } from "../io/battle-state-file.js";
import type { CliCommand } from "./command-parser.js";

export interface CommandResult {
  lines: string[];
  shouldExit?: boolean;
}

export const cliHelpLines = [
  "hp <slot> <number|percent%>       hp p1a 117 | hp p2a 63%",
  "status <slot> <status|clear>      status p2a par",
  "faint <slot>                      faint p2a",
  "switch <slot> <bench 1-4>         switch p1a 1",
  "boost <slot> <stat> <-6..6>       boost p1a spa 2",
  "pp <slot> <move> <remaining>      pp p1a thunderbolt 7",
  "item <slot> <item|none>           item p1a none",
  "ability <slot> <ability>          ability p1a lightningrod",
  "weather <weather|clear> <turns>   weather rain 5",
  "terrain <terrain|clear> <turns>   terrain electric 5",
  "turn <number>                     turn 2",
  "rank [top=3] [responses=8]        rank 3 8",
  "show | history | save <path> | help | quit"
];

export function executeSessionCommand(
  session: BattleSession,
  command: CliCommand
): CommandResult {
  switch (command.type) {
    case "hp":
      session.applyEvent({
        type: "damage-observed",
        slot: command.slot,
        remainingHp:
          command.unit === "exact"
            ? { unit: "exact", current: command.current }
            : { unit: "percent", percent: command.percent }
      });
      return updated(`${command.slot} HP`);

    case "status":
      if (command.status === "clear" || command.status === "healthy") {
        session.applyEvent({ type: "status-cleared", slot: command.slot });
      } else {
        session.applyEvent({
          type: "status-applied",
          slot: command.slot,
          status: command.status
        });
      }
      return updated(`${command.slot} status`);

    case "faint":
      session.applyEvent({ type: "faint-observed", slot: command.slot });
      return updated(`${command.slot} fainted`);

    case "switch":
      session.applyEvent({
        type: "switch-observed",
        side: command.side,
        activeSlot: command.slot,
        benchSlot: command.benchSlot
      });
      return updated(`${command.slot} switched`);

    case "boost": {
      const pokemon = findActive(session, command.slot);
      session.applyEvent({
        type: "boosts-changed",
        slot: command.slot,
        boosts: { ...pokemon.boosts, [command.stat]: command.stage }
      });
      return updated(`${command.slot} ${command.stat}`);
    }

    case "pp":
      session.applyEvent({
        type: "move-pp-changed",
        slot: command.slot,
        moveId: command.moveId,
        remainingPp: command.remainingPp
      });
      return updated(`${command.slot} ${command.moveId} PP`);

    case "item":
      session.applyEvent({
        type: "item-changed",
        slot: command.slot,
        itemId: command.itemId
      });
      return updated(`${command.slot} item`);

    case "ability":
      session.applyEvent({
        type: "ability-changed",
        slot: command.slot,
        abilityId: command.abilityId
      });
      return updated(`${command.slot} ability`);

    case "weather":
      session.applyEvent({
        type: "field-changed",
        changes: {
          weather: command.weather,
          weatherTurnsRemaining: command.turns
        }
      });
      return updated("weather");

    case "terrain":
      session.applyEvent({
        type: "field-changed",
        changes: {
          terrain: command.terrain,
          terrainTurnsRemaining: command.turns
        }
      });
      return updated("terrain");

    case "turn":
      session.applyEvent({ type: "turn-started", turnNumber: command.turnNumber });
      return updated(`turn ${command.turnNumber}`);

    case "rank": {
      const startedAt = performance.now();
      const advice = session.rank({ maxOpponentPlans: command.maxOpponentPlans });
      const elapsedMs = performance.now() - startedAt;
      const lines = advice.slice(0, command.top).map((result) => {
        const evaluation = result.debug.opponentEvaluation;
        return [
          `${result.rank}. ${result.actionPlan.showdownChoice}`,
          `score ${round(result.score)} | expected ${round(evaluation.expectedScore)} | worst ${round(evaluation.worstCaseScore)}`,
          result.explanationTags.join(", ") || "no tags",
          `worst response: ${evaluation.worstOpponentChoice}`
        ].join(" | ");
      });
      lines.push(
        `${advice.length} plans, up to ${command.maxOpponentPlans} opponent responses, ${Math.round(elapsedMs)} ms`
      );
      return { lines };
    }

    case "show":
      return { lines: formatState(session) };

    case "history":
      return {
        lines: session.getHistory().map((event, index) => `${index + 1}. ${JSON.stringify(event)}`)
      };

    case "save":
      saveBattleSessionFile(command.path, session);
      return { lines: [`Saved ${command.path}`] };

    case "help":
      return { lines: cliHelpLines };

    case "quit":
      return { lines: ["Session closed."], shouldExit: true };
  }
}

function findActive(session: BattleSession, slot: string) {
  const side = slot.slice(0, 2) as "p1" | "p2";
  const pokemon = session.getState().teams[side].active.find((member) => member.slot === slot);
  if (!pokemon) throw new Error(`No active Pokemon exists in ${slot}.`);
  return pokemon;
}

function formatState(session: BattleSession): string[] {
  const state = session.getState();
  const lines = [`Turn ${state.turnNumber} | ${state.regulationId} | advising ${state.playerSide}`];

  for (const side of ["p1", "p2"] as const) {
    const active = state.teams[side].active.map((pokemon) => {
      const hp =
        pokemon.hp.unit === "exact"
          ? `${pokemon.hp.current}/${pokemon.hp.max}`
          : `${pokemon.hp.percent}%`;
      return `${pokemon.slot} ${pokemon.set.displayName ?? pokemon.set.speciesId} ${hp} ${pokemon.status}`;
    });
    lines.push(`${side}: ${active.join(" | ")}`);
  }

  lines.push(
    `Field: weather=${state.field.weather ?? "none"} terrain=${state.field.terrain ?? "none"} trickroom=${state.field.trickRoomTurnsRemaining}`
  );
  return lines;
}

function updated(label: string): CommandResult {
  return { lines: [`Updated ${label}.`] };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
