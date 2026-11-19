import { invoke } from '@tauri-apps/api/core';

export interface AppleTriple {
  subject: string;
  predicate: string;
  relationshipId?: string;
  relationshipPredicate?: string;
  object: string;
  confidence: number;
  sources?: string;
  sourceDuplicates?: number;
  timestamp?: string;
}

export interface AppleScorecard {
  entity: string;
  scores: Record<string, number>;
  source?: string;
}

export interface LocalEdgeView {
  predicate_id: string;
  predicate_label: string;
  relationship_type_id: string;
  relationship_type_label: string;
  target_id: string;
  target_name: string;
  confidence: number;
}

export interface LocalEntityView {
  id: string;
  class_id: string;
  class_label: string;
  name: string;
  attributes: Record<string, string[]>;
  edges: LocalEdgeView[];
  scorecard: Record<string, number>;
}

export interface LocalAppleSnapshot {
  dir: string;
  active_triples_total: number;
  expired_triples_total: number;
  scorecards_total: number;
  entities_total: number;
  classes_breakdown: Record<string, number>;
  entities: LocalEntityView[];
  apple_payload: Record<string, unknown>;
}

export interface ConvoTurnInput {
  id?: string;
  speaker: string;
  partner?: string;
  text: string;
  at?: string;
}

export async function readLocalAppleKnowledgeGraph(options?: {
  dir?: string;
  owner?: string;
  source?: string;
  limit?: number;
  entityFilter?: string;
}): Promise<LocalAppleSnapshot> {
  return invoke<LocalAppleSnapshot>('knowledge_graph_read_local', {
    dir: options?.dir ?? null,
    owner: options?.owner ?? null,
    source: options?.source ?? null,
    limit: options?.limit ?? null,
    entityFilter: options?.entityFilter ?? null,
  });
}

export async function syncAppleKnowledgeGraph(options: {
  bearerToken: string;
  apiUrl?: string;
  dir?: string;
  owner?: string;
  source?: string;
  limit?: number;
}): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('knowledge_graph_sync_apple', {
    apiUrl: options.apiUrl ?? null,
    bearerToken: options.bearerToken,
    dir: options.dir ?? null,
    owner: options.owner ?? null,
    source: options.source ?? null,
    limit: options.limit ?? null,
  });
}

export async function queryEntityState(options: {
  entity: string;
  apiUrl?: string;
  bearerToken?: string;
  asOf?: string;
  asKnown?: string;
  local?: boolean;
  dir?: string;
}): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('knowledge_graph_query_entity', {
    apiUrl: options.apiUrl ?? null,
    bearerToken: options.bearerToken ?? null,
    entity: options.entity,
    asOf: options.asOf ?? null,
    asKnown: options.asKnown ?? null,
    local: options.local ?? null,
    dir: options.dir ?? null,
  });
}

export async function updateGraphFromConvo(options: {
  bearerToken: string;
  source: string;
  turns: ConvoTurnInput[];
  apiUrl?: string;
  at?: string;
  dryRun?: boolean;
}): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('knowledge_graph_update_convo', {
    apiUrl: options.apiUrl ?? null,
    bearerToken: options.bearerToken,
    source: options.source,
    turns: options.turns,
    at: options.at ?? null,
    dryRun: options.dryRun ?? null,
  });
}

export async function getGraphOntology(options?: {
  apiUrl?: string;
  bearerToken?: string;
  group?: string;
  q?: string;
  local?: boolean;
}): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('knowledge_graph_get_ontology', {
    apiUrl: options?.apiUrl ?? null,
    bearerToken: options?.bearerToken ?? null,
    group: options?.group ?? null,
    q: options?.q ?? null,
    local: options?.local ?? null,
  });
}
