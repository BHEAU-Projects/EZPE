import type {
  ActivePokemon,
  FieldState,
  PlayerSide,
  StatBoosts,
  StatusCondition
} from "../domain/battle-state.js";

type Weather = NonNullable<FieldState["weather"]>;
type Terrain = NonNullable<FieldState["terrain"]>;

export type CliCommand =
  | { type: "hp"; slot: ActivePokemon["slot"]; unit: "exact"; current: number }
  | { type: "hp"; slot: ActivePokemon["slot"]; unit: "percent"; percent: number }
  | { type: "status"; slot: ActivePokemon["slot"]; status: StatusCondition | "clear" }
  | { type: "faint"; slot: ActivePokemon["slot"] }
  | { type: "switch"; slot: ActivePokemon["slot"]; benchSlot: number; side: PlayerSide }
  | { type: "boost"; slot: ActivePokemon["slot"]; stat: keyof StatBoosts; stage: number }
  | { type: "pp"; slot: ActivePokemon["slot"]; moveId: string; remainingPp: number }
  | { type: "item"; slot: ActivePokemon["slot"]; itemId: string | null }
  | { type: "ability"; slot: ActivePokemon["slot"]; abilityId: string }
  | { type: "weather"; weather: Weather | null; turns: number }
  | { type: "terrain"; terrain: Terrain | null; turns: number }
  | { type: "turn"; turnNumber: number }
  | { type: "rank"; top: number; maxOpponentPlans: number }
  | { type: "show" }
  | { type: "history" }
  | { type: "save"; path: string }
  | { type: "help" }
  | { type: "quit" };

const activeSlots = new Set(["p1a", "p1b", "p2a", "p2b"]);
const boostStats = new Set(["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"]);
const statuses = new Set(["healthy", "brn", "frz", "par", "psn", "slp", "tox", "clear"]);
const weathers = new Set(["rain", "sun", "sandstorm", "snow", "harshsunshine", "heavyrain", "strongwinds"]);
const terrains = new Set(["electric", "grassy", "misty", "psychic"]);

export function parseCliCommand(input: string): CliCommand {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a command. Type 'help' to list commands.");

  const [name, ...args] = trimmed.split(/\s+/);
  const command = name.toLowerCase();

  switch (command) {
    case "hp": {
      const slot = parseSlot(args[0]);
      const value = requireArg(args[1], "HP value");
      if (value.endsWith("%")) {
        return { type: "hp", slot, unit: "percent", percent: parseNumber(value.slice(0, -1), 0, 100) };
      }
      return { type: "hp", slot, unit: "exact", current: parseInteger(value, 0, 999) };
    }
    case "status": {
      const status = requireArg(args[1], "status").toLowerCase();
      if (!statuses.has(status)) throw new Error(`Unknown status '${status}'.`);
      return {
        type: "status",
        slot: parseSlot(args[0]),
        status: status as StatusCondition | "clear"
      };
    }
    case "faint":
      return { type: "faint", slot: parseSlot(args[0]) };
    case "switch": {
      const slot = parseSlot(args[0]);
      return {
        type: "switch",
        slot,
        benchSlot: parseInteger(requireArg(args[1], "bench number"), 1, 4) - 1,
        side: slot.slice(0, 2) as PlayerSide
      };
    }
    case "boost": {
      const stat = requireArg(args[1], "stat").toLowerCase();
      if (!boostStats.has(stat)) throw new Error(`Unknown boost stat '${stat}'.`);
      return {
        type: "boost",
        slot: parseSlot(args[0]),
        stat: stat as keyof StatBoosts,
        stage: parseInteger(requireArg(args[2], "stage"), -6, 6)
      };
    }
    case "pp":
      return {
        type: "pp",
        slot: parseSlot(args[0]),
        moveId: canonicalId(requireArg(args[1], "move")),
        remainingPp: parseInteger(requireArg(args[2], "remaining PP"), 0, 64)
      };
    case "item": {
      const item = requireArg(args[1], "item").toLowerCase();
      return { type: "item", slot: parseSlot(args[0]), itemId: item === "none" ? null : canonicalId(item) };
    }
    case "ability":
      return { type: "ability", slot: parseSlot(args[0]), abilityId: canonicalId(requireArg(args[1], "ability")) };
    case "weather":
      return parseFieldCommand("weather", args);
    case "terrain":
      return parseFieldCommand("terrain", args);
    case "turn":
      return { type: "turn", turnNumber: parseInteger(requireArg(args[0], "turn number"), 1, 999) };
    case "rank":
      return {
        type: "rank",
        top: args[0] ? parseInteger(args[0], 1, 20) : 3,
        maxOpponentPlans: args[1] ? parseInteger(args[1], 1, 100) : 8
      };
    case "show":
      return { type: "show" };
    case "history":
      return { type: "history" };
    case "save":
      return { type: "save", path: trimmed.slice(name.length).trim() || "battle-session.json" };
    case "help":
      return { type: "help" };
    case "quit":
    case "exit":
      return { type: "quit" };
    default:
      throw new Error(`Unknown command '${name}'. Type 'help' to list commands.`);
  }
}

function parseFieldCommand(type: "weather" | "terrain", args: string[]): CliCommand {
  const value = requireArg(args[0], type).toLowerCase();
  if (value === "clear" || value === "none") return { type, [type]: null, turns: 0 } as CliCommand;
  const allowed = type === "weather" ? weathers : terrains;
  if (!allowed.has(value)) throw new Error(`Unknown ${type} '${value}'.`);
  return {
    type,
    [type]: value,
    turns: parseInteger(requireArg(args[1], "turn count"), 1, 8)
  } as CliCommand;
}

function parseSlot(value: string | undefined): ActivePokemon["slot"] {
  const slot = requireArg(value, "active slot").toLowerCase();
  if (!activeSlots.has(slot)) throw new Error(`Unknown active slot '${slot}'.`);
  return slot as ActivePokemon["slot"];
}

function canonicalId(value: string): string {
  const id = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!id) throw new Error(`Could not create a canonical id from '${value}'.`);
  return id;
}

function parseInteger(value: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`Expected an integer from ${minimum} to ${maximum}, received '${value}'.`);
  }
  return number;
}

function parseNumber(value: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`Expected a number from ${minimum} to ${maximum}, received '${value}'.`);
  }
  return number;
}

function requireArg(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}
