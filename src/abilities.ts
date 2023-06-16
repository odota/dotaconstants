export type AbilityBehavior = Array<
  | "Unit Target"
  | "Passive"
  | "No Target"
  | "Instant Cast"
  | "Channeled"
  | "Point Target"
  | "AOE"
  | "Hidden"
>;
export type AbilityTargetTeam = "Both" | "Enemy" | "Friendly";
export type AttributeDamageType = "Physical" | "Magical" | "Pure";
export type AbilityTargetType = "Hero" | "Basic";

export type AbilityAttribute = {
  key: string;
  header: string;
  value: string | Array<string>;
  generated: boolean;
};

export type DotaAbility = {
  dname: string;
  img?: string;
  behavior?: AbilityBehavior;
  target_team?: AbilityTargetTeam;
  attrib?: Array<AbilityAttribute>;
  dmg_type?: AttributeDamageType;
  bkbpierce?: "Yes" | "No";
  desc?: string;
  lore?: string;
  dispellable?: Array<any>;
  mc?: string | Array<string>;
  cd?: string | Array<string>;
  target_type?: AbilityTargetType;
};

export type DotaAbilities = {
  [key: string]: DotaAbility;
};

export type DotaAbilityIds = {
  [key: keyof DotaAbilities]: string;
};
