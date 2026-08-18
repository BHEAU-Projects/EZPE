import type { BattleState } from "../domain/battle-state.js";
import type { BattleStateSingleTurnChoices } from "../sim/showdown-adapter.js";

const zeroStatPoints = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const emptyBoosts = {
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  accuracy: 0,
  evasion: 0
};

export const singleTurnBattleState: BattleState = {
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
            speciesId: "pikachu",
            displayName: "Pikachu",
            level: 50,
            itemId: "lightball",
            abilityId: "static",
            moveIds: ["thunderbolt", "protect"],
            statAlignment: "Serious",
            statPoints: zeroStatPoints,
            stats: { hp: 110, atk: 75, def: 60, spa: 70, spd: 70, spe: 110 }
          },
          hp: { unit: "exact", current: 110, max: 110 },
          status: "healthy",
          boosts: emptyBoosts,
          volatileEffectIds: [],
          protectedThisTurn: false,
          protectStreak: 0
        },
        {
          slot: "p1b",
          set: {
            speciesId: "bulbasaur",
            displayName: "Bulbasaur",
            level: 50,
            itemId: null,
            abilityId: "overgrow",
            moveIds: ["tackle", "protect"],
            statAlignment: "Serious",
            statPoints: zeroStatPoints,
            stats: { hp: 120, atk: 69, def: 69, spa: 85, spd: 85, spe: 65 }
          },
          hp: { unit: "exact", current: 120, max: 120 },
          status: "healthy",
          boosts: emptyBoosts,
          volatileEffectIds: [],
          protectedThisTurn: false,
          protectStreak: 0
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
            speciesId: "squirtle",
            displayName: "Squirtle",
            level: 50,
            itemId: null,
            abilityId: "torrent",
            moveIds: ["tackle", "protect"],
            statAlignment: "Serious",
            statPoints: zeroStatPoints,
            stats: { hp: 119, atk: 68, def: 85, spa: 70, spd: 84, spe: 63 }
          },
          hp: { unit: "percent", percent: 100 },
          status: "healthy",
          boosts: emptyBoosts,
          volatileEffectIds: [],
          protectedThisTurn: false,
          protectStreak: 0
        },
        {
          slot: "p2b",
          set: {
            speciesId: "charmander",
            displayName: "Charmander",
            level: 50,
            itemId: null,
            abilityId: "blaze",
            moveIds: ["scratch", "protect"],
            statAlignment: "Serious",
            statPoints: zeroStatPoints,
            stats: { hp: 114, atk: 72, def: 63, spa: 80, spd: 70, spe: 85 }
          },
          hp: { unit: "percent", percent: 100 },
          status: "healthy",
          boosts: emptyBoosts,
          volatileEffectIds: [],
          protectedThisTurn: false,
          protectStreak: 0
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
      moveId: "thunderbolt",
      targetSlot: "p2a",
      flags: {}
    },
    {
      type: "move",
      activeSlot: "p1b",
      moveId: "tackle",
      targetSlot: "p2a",
      flags: {}
    }
  ]
};

export const singleTurnChoices: BattleStateSingleTurnChoices = {
  p1Choice: "move thunderbolt 1, move tackle 1",
  p2Choice: "move tackle 1, move scratch 1"
};
