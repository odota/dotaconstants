export const HTML_REGEX = /(<([^>]+)>)/gi;

export const mapAbilities = (tokens: any) => {
  const tokenKeys = Object.keys(tokens);
  tokenKeys.forEach(
    (key) => (tokens[key] = tokens[key].replace(HTML_REGEX, "")),
  );
  return tokens;
};

export const removeExtraneousWhitespacesFromString = (string: string) => {
  if (!string) {
    return "";
  }

  return string.replace(/\s+/g, " ").trim();
};

export const cleanupArray = (array: string[]) => {
  if (!array) {
    return [];
  }

  return array.filter((n) => removeExtraneousWhitespacesFromString(n));
};

export type SpecialBonusLookup = Record<string, Record<string, string>>;

export const abilityNameStrings = (tokens: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [key.toLowerCase(), value]),
  );

export const buildAbilityIds = (
  locked: Record<string, string>,
  currentTalents: Set<string>,
) => {
  const ids: Record<string, string> = {};
  for (const [name, id] of Object.entries(locked)) {
    const previous = ids[id];
    if (previous && currentTalents.has(previous) && currentTalents.has(name)) {
      throw new Error(`Current talents share ID ${id}: ${previous}, ${name}`);
    }
    if (!previous || !currentTalents.has(previous)) ids[id] = name;
  }
  return ids;
};

export const validateCurrentTalents = (
  talents: Set<string>,
  abilities: Record<string, { dname?: unknown }>,
  ids: Record<string, string>,
) => {
  const names = new Set(Object.values(ids));
  const errors: string[] = [];
  for (const talent of talents) {
    if (!names.has(talent)) errors.push(`Missing talent ID: ${talent}`);
    const name = abilities[talent]?.dname;
    if (!hasTalentName(name)) errors.push(`Missing talent name: ${talent}`);
    else if (hasTalentPlaceholder(name))
      errors.push(
        `Unresolved talent name: ${talent}: ${abilities[talent].dname}`,
      );
  }
  return errors;
};

export const hasTalentName = (name: unknown): name is string =>
  typeof name === "string" && name.trim().length > 0;

export const hasTalentPlaceholder = (name: unknown) =>
  typeof name === "string" && /\{[^}]+\}|%[a-z_]\w*%/i.test(name);

export const getReferencedHeroTalents = (heroes: Record<string, any>) => {
  const talents = new Set<string>();
  for (const hero of Object.values(heroes)) {
    const start = Number(hero.AbilityTalentStart ?? 10);
    for (const [slot, name] of Object.entries(hero)) {
      const match = slot.match(/^Ability(\d+)$/);
      if (
        match &&
        Number(match[1]) >= start &&
        typeof name === "string" &&
        name.startsWith("special_bonus")
      ) {
        talents.add(name);
      }
    }
  }
  return talents;
};

export const talentValueEntries = (script: any): [string, any][] =>
  script.AbilityValues
    ? Object.entries(script.AbilityValues)
    : Object.values(script.AbilitySpecial ?? {}).flatMap((entry: any) =>
        Object.entries(entry).filter(([key]) => key !== "var_type"),
      );

export const isTalentModifier = (key: string) =>
  key.startsWith("special_bonus_") &&
  !/^special_bonus_(facet|scepter|shard)/.test(key);

export type TalentValueCandidate = {
  talent: string;
  key: string;
  ability: string;
  attribute: string;
  raw: unknown;
  priority: number;
  condition: string;
  semantic?: string;
  display?: string;
  reason?: string;
};

// Exact decimal identity, without floating-point rounding or permissive parsing.
const decimalIdentity = (value: string) => {
  const [integer, fraction = ""] = value.split(".");
  const whole = integer.replace(/^0+/, "") || "0";
  const tail = fraction.replace(/0+$/, "");
  return tail ? `${whole}.${tail}` : whole;
};

const parseTalentValue = (raw: unknown, modifier: boolean) => {
  if (typeof raw !== "string") return undefined;
  const parts = raw.trim().split(/\s+/);
  const semantic: string[] = [];
  const display: string[] = [];
  for (const part of parts) {
    const match = /^([+=x]?)(-?(?:\d+(?:\.\d+)?|\.\d+))(%?)$/.exec(part);
    if (!match) return undefined;
    const [, prefix, operand, unit] = match;
    const subtract = modifier && !prefix && operand.startsWith("-");
    const operator = subtract ? "-" : prefix;
    const amount = subtract ? operand.slice(1) : operand;
    const magnitude = decimalIdentity(amount.replace(/^-/, ""));
    const number =
      amount.startsWith("-") && magnitude !== "0" ? `-${magnitude}` : magnitude;
    semantic.push(
      JSON.stringify([
        modifier || operator === "=" || operator === "x" ? operator : "literal",
        number,
        unit,
      ]),
    );
    display.push(amount);
  }
  return { semantic: JSON.stringify(semantic), display: display.join(" ") };
};

// Build from unmodified scripts before description formatting lowercases keys.
// Keep every talent modifier, including those following a facet or another talent.
// Prefer the hero's equipped abilities over obsolete scripts and summon variants.
export const analyzeSpecialBonusValues = (
  scripts: Record<string, any>,
  preferredAbilities = new Set<string>(),
) => {
  const candidates: TalentValueCandidate[] = [];
  const add = (
    talent: string,
    key: string,
    raw: unknown,
    priority: number,
    modifier = false,
    ability = talent,
    attribute = key,
    condition = "base",
  ) => {
    const candidate = {
      talent,
      key: key.toLowerCase(),
      ability,
      attribute,
      raw,
      priority,
      condition,
    };
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const entries = Object.entries(raw);
      // Explicit base plus upgrade branches; never flatten an upgrade into base.
      if (
        entries.length &&
        entries.every(
          ([field]) =>
            field === "value" ||
            /^special_bonus_(scepter|shard|facet)(?:_|$)/.test(field),
        )
      ) {
        if (condition === "base" && !Object.hasOwn(raw, "value"))
          candidates.push({ ...candidate, reason: "conditional-only" });
        for (const [field, value] of entries)
          add(
            talent,
            key,
            value,
            priority,
            modifier,
            ability,
            attribute,
            field === "value" ? condition : `${condition}/${field}`,
          );
      } else candidates.push({ ...candidate, reason: "unsupported-object" });
      return;
    }
    const parsed = parseTalentValue(raw, modifier);
    candidates.push({
      ...candidate,
      ...parsed,
      ...(!parsed && { reason: "invalid-value" }),
    });
  };
  for (const [name, script] of Object.entries(scripts)) {
    for (const [key, attr] of talentValueEntries(script)) {
      if (name.startsWith("special_bonus"))
        add(
          name,
          key,
          typeof attr === "object" && attr !== null ? attr.value : attr,
          3,
          false,
          name,
          key,
        );
      if (!attr || typeof attr !== "object") continue;
      for (const [talent, raw] of Object.entries(attr)) {
        if (!isTalentModifier(talent)) continue;
        const priority = preferredAbilities.has(name) ? 2 : 1;
        add(talent, `bonus_${key}`, raw, priority, true, name, key);
        // Used only by localizations explicitly asking for {s:value}.
        add(talent, "value", raw, priority, true, name, key);
      }
    }
  }
  const lookup: SpecialBonusLookup = {};
  const conflicts: {
    talent: string;
    key: string;
    candidates: TalentValueCandidate[];
  }[] = [];
  const equivalents: typeof conflicts = [];
  const grouped: Partial<Record<string, TalentValueCandidate[]>> =
    Object.groupBy(candidates, (c) => `${c.talent}/${c.key}`);
  for (const groupKey of Object.keys(grouped).sort()) {
    const group = grouped[groupKey]!;
    const base = group.filter((c) => c.condition === "base");
    if (!base.length) continue;
    const priority = Math.max(...base.map((c) => c.priority));
    const relevant = base.filter((c) => c.priority === priority);
    const { talent, key } = relevant[0];
    lookup[talent] ??= {};
    // A malformed relevant candidate must not make the remaining one look unique.
    if (relevant.some((c) => c.reason)) continue;
    if (new Set(relevant.map((c) => c.semantic)).size !== 1) {
      conflicts.push({ talent, key, candidates: relevant });
      continue;
    }
    const displays = [...new Set(relevant.map((c) => c.display!))].sort();
    if (displays.length > 1)
      equivalents.push({ talent, key, candidates: relevant });
    lookup[talent][key] = displays[0];
  }
  return { lookup, candidates, conflicts, equivalents };
};

export const buildSpecialBonusLookup = (
  scripts: Record<string, any>,
  preferredAbilities = new Set<string>(),
): SpecialBonusLookup =>
  analyzeSpecialBonusValues(scripts, preferredAbilities).lookup;

export const resolveSpecialBonusPlaceholders = (
  abilities: Record<string, { dname?: string }>,
  lookup: SpecialBonusLookup,
) => {
  Object.entries(abilities).forEach(([name, ability]) => {
    const values = lookup[name];
    if (!hasTalentName(ability.dname) || !values) {
      return;
    }

    ability.dname = ability.dname.replace(
      /\{s:([^}]+)\}/gi,
      (placeholder, key, offset: number, template: string) => {
        const value = values[key.toLowerCase()] ?? values[key];
        if (value === undefined || value === null) return placeholder;
        // Localization owns an explicit +/- sign and percent/unit suffix.
        // Otherwise retain negative values; never discard an unresolved token.
        const signedByTemplate = /[+-]\s*$/.test(template.slice(0, offset));
        return String(value)
          .split(/\s+/)
          .map((part) => (signedByTemplate ? part.replace(/^[+-]/, "") : part))
          .join(" / ");
      },
    );
  });
};
