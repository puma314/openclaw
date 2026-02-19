use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cmp::{max, min};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryChunk {
    pub start_line: usize,
    pub end_line: usize,
    pub text: String,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RankCandidateInput {
    pub id: String,
    pub embedding: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RankedCandidate {
    pub id: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryBenchResult {
    pub chunk_ms: f64,
    pub rank_ms: f64,
    pub total_ms: f64,
    pub chunk_count: usize,
    pub rank_count: usize,
}

pub struct BenchMemoryParams<'a> {
    pub chunk_iters: usize,
    pub rank_iters: usize,
    pub content: &'a str,
    pub tokens: usize,
    pub overlap: usize,
    pub query: &'a [f64],
    pub candidates: &'a [RankCandidateInput],
    pub limit: usize,
}

pub fn hash_text(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

fn split_utf16_segments(line: &str, max_units: usize) -> Vec<String> {
    let units: Vec<u16> = line.encode_utf16().collect();
    if units.is_empty() {
        return vec![String::new()];
    }
    let mut out = Vec::new();
    for chunk in units.chunks(max_units) {
        out.push(String::from_utf16_lossy(chunk));
    }
    out
}

pub fn chunk_markdown(content: &str, tokens: usize, overlap: usize) -> Vec<MemoryChunk> {
    let lines: Vec<&str> = content.split('\n').collect();
    if lines.is_empty() {
        return Vec::new();
    }

    let max_chars = max(32, tokens.saturating_mul(4));
    let overlap_chars = overlap.saturating_mul(4);
    let mut chunks: Vec<MemoryChunk> = Vec::new();
    let mut current: Vec<(String, usize)> = Vec::new();
    let mut current_chars = 0usize;

    let flush = |current: &[(String, usize)], chunks: &mut Vec<MemoryChunk>| {
        if current.is_empty() {
            return;
        }
        let start_line = current.first().map(|entry| entry.1).unwrap_or(1);
        let end_line = current.last().map(|entry| entry.1).unwrap_or(start_line);
        let text = current
            .iter()
            .map(|entry| entry.0.as_str())
            .collect::<Vec<&str>>()
            .join("\n");
        chunks.push(MemoryChunk {
            start_line,
            end_line,
            hash: hash_text(&text),
            text,
        });
    };

    let carry_overlap = |current: &mut Vec<(String, usize)>, current_chars: &mut usize| {
        if overlap_chars == 0 || current.is_empty() {
            current.clear();
            *current_chars = 0;
            return;
        }
        let mut acc = 0usize;
        let mut kept: Vec<(String, usize)> = Vec::new();
        for entry in current.iter().rev() {
            acc = acc.saturating_add(entry.0.len() + 1);
            kept.push(entry.clone());
            if acc >= overlap_chars {
                break;
            }
        }
        kept.reverse();
        *current_chars = kept.iter().map(|entry| entry.0.len() + 1).sum();
        *current = kept;
    };

    for (idx, line) in lines.iter().enumerate() {
        let line_no = idx + 1;
        let segments = split_utf16_segments(line, max_chars);
        for segment in segments {
            let line_size = segment.len() + 1;
            if current_chars + line_size > max_chars && !current.is_empty() {
                flush(&current, &mut chunks);
                carry_overlap(&mut current, &mut current_chars);
            }
            current_chars += line_size;
            current.push((segment, line_no));
        }
    }

    flush(&current, &mut chunks);
    chunks
}

pub fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let len = min(a.len(), b.len());
    if len == 0 {
        return 0.0;
    }
    let mut dot = 0.0_f64;
    let mut norm_a = 0.0_f64;
    let mut norm_b = 0.0_f64;
    for i in 0..len {
        let av = a[i];
        let bv = b[i];
        dot += av * bv;
        norm_a += av * av;
        norm_b += bv * bv;
    }
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a.sqrt() * norm_b.sqrt())
}

pub fn rank_cosine(
    query: &[f64],
    candidates: &[RankCandidateInput],
    limit: usize,
) -> Vec<RankedCandidate> {
    if query.is_empty() || limit == 0 {
        return Vec::new();
    }

    let mut scored: Vec<RankedCandidate> = candidates
        .iter()
        .filter_map(|candidate| {
            let score = cosine_similarity(query, candidate.embedding.as_slice());
            if !score.is_finite() {
                return None;
            }
            Some(RankedCandidate {
                id: candidate.id.clone(),
                score,
            })
        })
        .collect();

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(limit);
    scored
}

pub fn bench_memory(params: BenchMemoryParams<'_>) -> MemoryBenchResult {
    let total_started = Instant::now();

    let chunk_started = Instant::now();
    let mut chunk_count = 0usize;
    for _ in 0..params.chunk_iters {
        chunk_count = chunk_markdown(params.content, params.tokens, params.overlap).len();
    }
    let chunk_ms = chunk_started.elapsed().as_secs_f64() * 1000.0;

    let rank_started = Instant::now();
    let mut rank_count = 0usize;
    for _ in 0..params.rank_iters {
        rank_count = rank_cosine(params.query, params.candidates, params.limit).len();
    }
    let rank_ms = rank_started.elapsed().as_secs_f64() * 1000.0;

    let total_ms = total_started.elapsed().as_secs_f64() * 1000.0;
    MemoryBenchResult {
        chunk_ms,
        rank_ms,
        total_ms,
        chunk_count,
        rank_count,
    }
}

#[cfg(test)]
mod tests {
    use super::{chunk_markdown, cosine_similarity, rank_cosine, RankCandidateInput};

    #[test]
    fn chunk_markdown_splits_long_lines() {
        let content = "a".repeat(400 * 4 * 3 + 10);
        let chunks = chunk_markdown(content.as_str(), 400, 0);
        assert!(chunks.len() > 1);
        for chunk in chunks {
            assert!(chunk.text.len() <= 1600);
        }
    }

    #[test]
    fn cosine_similarity_matches_expected() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let score = cosine_similarity(a.as_slice(), b.as_slice());
        assert!((score - 1.0).abs() < 1e-12);
    }

    #[test]
    fn rank_cosine_returns_top_scores() {
        let query = vec![1.0, 0.0];
        let candidates = vec![
            RankCandidateInput {
                id: "a".to_string(),
                embedding: vec![1.0, 0.0],
            },
            RankCandidateInput {
                id: "b".to_string(),
                embedding: vec![0.0, 1.0],
            },
        ];
        let ranked = rank_cosine(query.as_slice(), candidates.as_slice(), 1);
        assert_eq!(ranked.len(), 1);
        assert_eq!(ranked[0].id, "a");
    }
}
