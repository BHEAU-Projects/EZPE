import * as Champions from "@pkmn/mods/champions";
import * as ChampionsRegMa from "@pkmn/mods/championsregma";
import {
  Battle as SimBattle,
  Dex as SimDex,
  TeamValidator as SimTeamValidator,
  Teams,
  toID,
  type ModData
} from "@pkmn/sim";

const championsDex = SimDex.mod("champions", Champions as ModData);
const championsRegMaDex = SimDex.mod("championsregma", ChampionsRegMa as ModData);

function dexForFormat(formatId: string) {
  if (!formatId.includes("champions")) return SimDex;
  return formatId.includes("regma") ? championsRegMaDex : championsDex;
}

export class Battle extends SimBattle {
  constructor(options: ConstructorParameters<typeof SimBattle>[0]) {
    super(options, dexForFormat(String(options.formatid)));
  }
}

export class TeamValidator extends SimTeamValidator {
  constructor(formatId: string) {
    super(formatId, dexForFormat(formatId));
  }
}

export const Dex = {
  forFormat(formatId: string) {
    return dexForFormat(formatId).forFormat(formatId);
  },
  formats: {
    get(formatId: string) {
      return dexForFormat(formatId).formats.get(formatId);
    }
  }
};

export { Teams, toID };
