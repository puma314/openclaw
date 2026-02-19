import type { DatabaseSync } from "node:sqlite";
import { truncateUtf16Safe } from "../utils.js";
import { cosineSimilarity, parseEmbedding } from "./internal.js";
import { runNativeRankCosine } from "./native/bridge.js";
import { resolveMemoryEngine } from "./native/flags.js";
import { recordShadowComparison } from "./native/shadow-metrics.js";

const vectorToBlob = (embedding: number[]): Buffer =>
  Buffer.from(new Float32Array(embedding).buffer);

export type SearchSource = string;

export type SearchRowResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: SearchSource;
};

export async function searchVector(params: {
  db: DatabaseSync;
  vectorTable: string;
  providerModel: string;
  queryVec: number[];
  limit: number;
  snippetMaxChars: number;
  ensureVectorReady: (dimensions: number) => Promise<boolean>;
  sourceFilterVec: { sql: string; params: SearchSource[] };
  sourceFilterChunks: { sql: string; params: SearchSource[] };
}): Promise<SearchRowResult[]> {
  if (params.queryVec.length === 0 || params.limit <= 0) {
    return [];
  }
  if (await params.ensureVectorReady(params.queryVec.length)) {
    const rows = params.db
      .prepare(
        `SELECT c.id, c.path, c.start_line, c.end_line, c.text,\n` +
          `       c.source,\n` +
          `       vec_distance_cosine(v.embedding, ?) AS dist\n` +
          `  FROM ${params.vectorTable} v\n` +
          `  JOIN chunks c ON c.id = v.id\n` +
          ` WHERE c.model = ?${params.sourceFilterVec.sql}\n` +
          ` ORDER BY dist ASC\n` +
          ` LIMIT ?`,
      )
      .all(
        vectorToBlob(params.queryVec),
        params.providerModel,
        ...params.sourceFilterVec.params,
        params.limit,
      ) as Array<{
      id: string;
      path: string;
      start_line: number;
      end_line: number;
      text: string;
      source: SearchSource;
      dist: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: 1 - row.dist,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    }));
  }

  const candidates = listChunks({
    db: params.db,
    providerModel: params.providerModel,
    sourceFilter: params.sourceFilterChunks,
  });
  const engine = resolveMemoryEngine();
  const tsRanked = rankChunksWithTs(
    params.queryVec,
    candidates,
    params.limit,
    params.snippetMaxChars,
  );
  if (engine === "ts") {
    return tsRanked;
  }
  try {
    const nativeRanked = runNativeRankCosine({
      query: params.queryVec,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        embedding: candidate.embedding,
      })),
      limit: params.limit,
    });
    const chunkById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const mapped = nativeRanked
      .map((entry) => {
        const chunk = chunkById.get(entry.id);
        if (!chunk) {
          return null;
        }
        return {
          id: chunk.id,
          path: chunk.path,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          score: entry.score,
          snippet: truncateUtf16Safe(chunk.text, params.snippetMaxChars),
          source: chunk.source,
        } satisfies SearchRowResult;
      })
      .filter((entry): entry is SearchRowResult => entry !== null);
    if (engine === "shadow") {
      recordShadowComparison({
        key: "rank_cosine",
        matched: areRankingsEquivalent(tsRanked, mapped),
        detail: describeRankingMismatch(tsRanked, mapped),
      });
      return tsRanked;
    }
    return mapped;
  } catch {
    return tsRanked;
  }
}

function rankChunksWithTs(
  queryVec: number[],
  candidates: Array<{
    id: string;
    path: string;
    startLine: number;
    endLine: number;
    text: string;
    embedding: number[];
    source: SearchSource;
  }>,
  limit: number,
  snippetMaxChars: number,
) {
  const scored = candidates
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryVec, chunk.embedding),
    }))
    .filter((entry) => Number.isFinite(entry.score));
  return scored
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      id: entry.chunk.id,
      path: entry.chunk.path,
      startLine: entry.chunk.startLine,
      endLine: entry.chunk.endLine,
      score: entry.score,
      snippet: truncateUtf16Safe(entry.chunk.text, snippetMaxChars),
      source: entry.chunk.source,
    }));
}

function areRankingsEquivalent(a: SearchRowResult[], b: SearchRowResult[]) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) {
      return false;
    }
    if (left.id !== right.id) {
      return false;
    }
    if (Math.abs(left.score - right.score) > 1e-9) {
      return false;
    }
  }
  return true;
}

function describeRankingMismatch(a: SearchRowResult[], b: SearchRowResult[]) {
  if (a.length !== b.length) {
    return `length ts=${a.length} native=${b.length}`;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) {
      return `missing rank entry index=${i}`;
    }
    if (left.id !== right.id) {
      return `id index=${i} ts=${left.id} native=${right.id}`;
    }
    if (Math.abs(left.score - right.score) > 1e-9) {
      return `score index=${i} ts=${left.score.toFixed(6)} native=${right.score.toFixed(6)}`;
    }
  }
  return undefined;
}

export function listChunks(params: {
  db: DatabaseSync;
  providerModel: string;
  sourceFilter: { sql: string; params: SearchSource[] };
}): Array<{
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  embedding: number[];
  source: SearchSource;
}> {
  const rows = params.db
    .prepare(
      `SELECT id, path, start_line, end_line, text, embedding, source\n` +
        `  FROM chunks\n` +
        ` WHERE model = ?${params.sourceFilter.sql}`,
    )
    .all(params.providerModel, ...params.sourceFilter.params) as Array<{
    id: string;
    path: string;
    start_line: number;
    end_line: number;
    text: string;
    embedding: string;
    source: SearchSource;
  }>;

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    startLine: row.start_line,
    endLine: row.end_line,
    text: row.text,
    embedding: parseEmbedding(row.embedding),
    source: row.source,
  }));
}

export async function searchKeyword(params: {
  db: DatabaseSync;
  ftsTable: string;
  providerModel: string | undefined;
  query: string;
  limit: number;
  snippetMaxChars: number;
  sourceFilter: { sql: string; params: SearchSource[] };
  buildFtsQuery: (raw: string) => string | null;
  bm25RankToScore: (rank: number) => number;
}): Promise<Array<SearchRowResult & { textScore: number }>> {
  if (params.limit <= 0) {
    return [];
  }
  const ftsQuery = params.buildFtsQuery(params.query);
  if (!ftsQuery) {
    return [];
  }

  // When providerModel is undefined (FTS-only mode), search all models
  const modelClause = params.providerModel ? " AND model = ?" : "";
  const modelParams = params.providerModel ? [params.providerModel] : [];

  const rows = params.db
    .prepare(
      `SELECT id, path, source, start_line, end_line, text,\n` +
        `       bm25(${params.ftsTable}) AS rank\n` +
        `  FROM ${params.ftsTable}\n` +
        ` WHERE ${params.ftsTable} MATCH ?${modelClause}${params.sourceFilter.sql}\n` +
        ` ORDER BY rank ASC\n` +
        ` LIMIT ?`,
    )
    .all(ftsQuery, ...modelParams, ...params.sourceFilter.params, params.limit) as Array<{
    id: string;
    path: string;
    source: SearchSource;
    start_line: number;
    end_line: number;
    text: string;
    rank: number;
  }>;

  return rows.map((row) => {
    const textScore = params.bm25RankToScore(row.rank);
    return {
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: textScore,
      textScore,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    };
  });
}
