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
  abilities: Record<string, { dname?: string }>,
  ids: Record<string, string>,
) => {
  const names = new Set(Object.values(ids));
  const errors: string[] = [];
  for (const talent of talents) {
    if (!names.has(talent)) errors.push(`Missing talent ID: ${talent}`);
    if (!abilities[talent]?.dname)
      errors.push(`Missing talent name: ${talent}`);
    else if (/\{[^}]+\}|%[a-z_]\w*%/i.test(abilities[talent].dname!))
      errors.push(
        `Unresolved talent name: ${talent}: ${abilities[talent].dname}`,
      );
  }
  return errors;
};

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

const abilityValues = (script: any): Record<string, any> => {
  if (script.AbilityValues) return script.AbilityValues;
  return Object.assign(
    {},
    ...Object.values(script.AbilitySpecial ?? {}).map((entry: any) =>
      Object.fromEntries(
        Object.entries(entry).filter(([key]) => key !== "var_type"),
      ),
    ),
  );
};

// Build from unmodified scripts before description formatting lowercases keys.
// Keep every talent modifier, including those following a facet or another talent.
// Prefer the hero's equipped abilities over obsolete scripts and summon variants.
export const buildSpecialBonusLookup = (
  scripts: Record<string, any>,
  preferredAbilities = new Set<string>(),
): SpecialBonusLookup => {
  const candidates: Record<
    string,
    Record<string, { priority: number; values: Set<string> }>
  > = {};
  const add = (
    talent: string,
    key: string,
    raw: unknown,
    priority: number,
    modifier = false,
  ) => {
    if (typeof raw !== "string") return;
    const value = raw
      .trim()
      .split(/\s+/)
      .map((part) =>
        part.replace(modifier ? /^[+\-=x]/ : /^[+=x]/, "").replace(/%/g, ""),
      )
      .join(" ");
    if (
      !/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s+[+-]?(?:\d+(?:\.\d+)?|\.\d+))*$/.test(
        value,
      )
    )
      return;
    const entries = (candidates[talent] ??= {});
    key = key.toLowerCase();
    const old = entries[key];
    if (!old || priority > old.priority)
      entries[key] = { priority, values: new Set([value]) };
    else if (priority === old.priority) old.values.add(value);
  };
  for (const [name, script] of Object.entries(scripts)) {
    for (const [key, attr] of Object.entries(abilityValues(script))) {
      if (name.startsWith("special_bonus"))
        add(
          name,
          key,
          typeof attr === "object" && attr !== null ? attr.value : attr,
          3,
        );
      if (!attr || typeof attr !== "object") continue;
      for (const [talent, raw] of Object.entries(attr)) {
        if (
          !talent.startsWith("special_bonus_") ||
          /^special_bonus_(facet|scepter|shard)/.test(talent)
        )
          continue;
        const priority = preferredAbilities.has(name) ? 2 : 1;
        add(talent, `bonus_${key}`, raw, priority, true);
        // Used only by localizations explicitly asking for {s:value}.
        add(talent, "value", raw, priority, true);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(candidates).map(([talent, entries]) => [
      talent,
      Object.fromEntries(
        Object.entries(entries)
          .filter(([, entry]) => entry.values.size === 1)
          .map(([key, entry]) => [key, [...entry.values][0]]),
      ),
    ]),
  );
};

export const resolveSpecialBonusPlaceholders = (
  abilities: Record<string, { dname?: string }>,
  lookup: SpecialBonusLookup,
) => {
  Object.entries(abilities).forEach(([name, ability]) => {
    const values = lookup[name];
    if (!ability.dname || !values) {
      return;
    }

    ability.dname = ability.dname.replace(
      /\{s:([^}]+)\}/g,
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
