import { z } from "zod";

export type ItemGroup = "pessoal" | "agentik" | "nao_classificado";

export type ConfiguredItemGroups = {
  pessoal: string[];
  agentik: string[];
  all: string[];
  byItemId: Map<string, ItemGroup>;
  groupsConfigured: boolean;
};

function parseIds(raw: string | undefined, variable: string): string[] {
  if (!raw?.trim()) throw new Error(`${variable} precisa conter pelo menos um Item ID.`);
  return [...new Set(raw.trim().split(/[\s,;]+/).filter(Boolean).map(value => z.string().uuid().parse(value)))];
}

export function configuredItemGroups(environment: NodeJS.ProcessEnv = process.env): ConfiguredItemGroups {
  const personalRaw = environment.PLUGGY_PERSONAL_ITEM_IDS?.trim();
  const agentikRaw = environment.PLUGGY_AGENTIK_ITEM_IDS?.trim();
  const byItemId = new Map<string, ItemGroup>();

  if (personalRaw || agentikRaw) {
    const pessoal = parseIds(personalRaw, "PLUGGY_PERSONAL_ITEM_IDS");
    const agentik = parseIds(agentikRaw, "PLUGGY_AGENTIK_ITEM_IDS");
    for (const id of pessoal) byItemId.set(id, "pessoal");
    for (const id of agentik) {
      if (byItemId.has(id)) throw new Error("Um Item ID não pode aparecer nos grupos Pessoal e Agentik ao mesmo tempo.");
      byItemId.set(id, "agentik");
    }
    return { pessoal, agentik, all: [...pessoal, ...agentik], byItemId, groupsConfigured: true };
  }

  const raw = environment.PLUGGY_ITEM_IDS?.trim() || environment.PLUGGY_ITEM_ID?.trim();
  if (!raw) throw new Error("Configure PLUGGY_PERSONAL_ITEM_IDS e PLUGGY_AGENTIK_ITEM_IDS, ou PLUGGY_ITEM_IDS para o modo legado.");
  const all = [...new Set(raw.split(/[\s,;]+/).filter(Boolean).map(value => z.string().uuid().parse(value)))];
  for (const id of all) byItemId.set(id, "nao_classificado");
  return { pessoal: [], agentik: [], all, byItemId, groupsConfigured: false };
}
