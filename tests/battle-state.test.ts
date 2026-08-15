import { describe, expect, it } from "vitest";

import { battleStateSchema, type BattleState } from "../src/domain/battle-state.js";

const baseStats = {
  hp: 170,
  atk: 135,
  def: 110,
  spa: 90,
  spd: 100,
  spe: 80
};

const validBattleState: BattleState = {
  format: "champions-vgc-doubles",
  regulationId: "development",
  turnNumber: 1,
  playerSide: "p1",
  teams: {
    p1: {
      side: "p1",
      active: [
        {
          slot: "p1a",
          set: {
            speciesId: "incineroar",
            displayName: "Incineroar",
            level: 50,
            itemId: "sitrusberry",
            abilityId: "intimidate",
            moveIds: ["fakeout", "flareblitz", "partingshot", "protect"],
            stats: baseStats
          },
          hp: { unit: "exact", current: 170, max: 170 },
          status: "healthy",
          boosts: {
            atk: 0,
            def: 0,
            spa: 0,
            spd: 0,
            spe: 0,
            accuracy: 0,
            evasion: 0
          },
          volatileEffectIds: [],
          protectedThisTurn: false
        },
        {
          slot: "p1b",
          set: {
            speciesId: "rillaboom",
            displayName: "Rillaboom",
            level: 50,
            itemId: "assaultvest",
            abilityId: "grassysurge",
            moveIds: ["woodhammer", "fakeout", "uturn", "grassyglide"],
            stats: baseStats
          },
          hp: { unit: "exact", current: 175, max: 175 },
          status: "healthy",
          boosts: {
            atk: 0,
            def: 0,
            spa: 0,
            spd: 0,
            spe: 0,
            accuracy: 0,
            evasion: 0
          },
          volatileEffectIds: [],
          protectedThisTurn: false
        }
      ],
      bench: [],
      sideConditions: {
        tailwindTurns: 0,
        reflectTurns: 0,
        lightScreenTurns: 0,
        auroraVeilTurns: 0,
        safeguardTurns: 0,
        stealthRock: false,
        stickyWeb: false,
        spikesLayers: 0,
        toxicSpikesLayers: 0
      }
    },
    p2: {
      side: "p2",
      active: [
        {
          slot: "p2a",
          set: {
            speciesId: "fluttermane",
            displayName: "Flutter Mane",
            level: 50,
            itemId: "choicespecs",
            abilityId: "protosynthesis",
            moveIds: ["moonblast", "shadowball", "dazzlinggleam", "protect"],
            stats: baseStats
          },
          hp: { unit: "percent", percent: 100 },
          status: "healthy",
          boosts: {
            atk: 0,
            def: 0,
            spa: 0,
            spd: 0,
            spe: 0,
            accuracy: 0,
            evasion: 0
          },
          volatileEffectIds: [],
          protectedThisTurn: false
        }
      ],
      bench: [],
      sideConditions: {
        tailwindTurns: 0,
        reflectTurns: 0,
        lightScreenTurns: 0,
        auroraVeilTurns: 0,
        safeguardTurns: 0,
        stealthRock: false,
        stickyWeb: false,
        spikesLayers: 0,
        toxicSpikesLayers: 0
      }
    }
  },
  field: {
    weather: null,
    weatherTurnsRemaining: 0,
    terrain: null,
    terrainTurnsRemaining: 0,
    trickRoomTurnsRemaining: 0,
    magicRoomTurnsRemaining: 0,
    wonderRoomTurnsRemaining: 0,
    gravityTurnsRemaining: 0
  },
  legalActions: [
    {
      type: "move",
      activeSlot: "p1a",
      moveId: "fakeout",
      targetSlot: "p2a",
      flags: {}
    }
  ]
};

describe("battleStateSchema", () => {
  it("accepts a valid minimal Doubles/VGC battle state", () => {
    expect(battleStateSchema.safeParse(validBattleState).success).toBe(true);
  });

  it("rejects a state missing format", () => {
    const { format: _format, ...state } = validBattleState;

    expect(battleStateSchema.safeParse(state).success).toBe(false);
  });

  it("rejects an invalid player side", () => {
    const state = {
      ...validBattleState,
      playerSide: "p3"
    };

    expect(battleStateSchema.safeParse(state).success).toBe(false);
  });

  it("rejects exact current HP greater than max HP", () => {
    const state = structuredClone(validBattleState);
    const hp = state.teams.p1.active[0].hp;
    if (hp.unit !== "exact") throw new Error("Expected exact player HP in test fixture.");
    hp.current = 171;

    expect(battleStateSchema.safeParse(state).success).toBe(false);
  });

  it("requires exact HP for the player and percentage HP for the opponent", () => {
    const opponentWithExactHp = structuredClone(validBattleState);
    opponentWithExactHp.teams.p2.active[0].hp = {
      unit: "exact",
      current: 130,
      max: 130
    };

    const playerWithPercentageHp = structuredClone(validBattleState);
    playerWithPercentageHp.teams.p1.active[0].hp = {
      unit: "percent",
      percent: 100
    };

    expect(battleStateSchema.safeParse(opponentWithExactHp).success).toBe(false);
    expect(battleStateSchema.safeParse(playerWithPercentageHp).success).toBe(false);
  });

  it("rejects stat boosts outside the legal -6 to 6 range", () => {
    const state = structuredClone(validBattleState);
    state.teams.p1.active[0].boosts.atk = 7;

    expect(battleStateSchema.safeParse(state).success).toBe(false);
  });

  it("rejects missing legal actions", () => {
    const { legalActions: _legalActions, ...state } = validBattleState;

    expect(battleStateSchema.safeParse(state).success).toBe(false);
  });

  it("rejects invalid move target shapes", () => {
    const state = structuredClone(validBattleState) as unknown as {
      legalActions: Array<Record<string, unknown>>;
    };
    state.legalActions[0] = {
      type: "move",
      activeSlot: "p1a",
      moveId: "fakeout",
      targetSlot: "enemy-left",
      flags: {}
    };

    expect(battleStateSchema.safeParse(state).success).toBe(false);
  });
});
