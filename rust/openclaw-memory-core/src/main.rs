use openclaw_memory_core::{bench_memory, chunk_markdown, cosine_similarity, rank_cosine};
use openclaw_memory_core::{BenchMemoryParams, MemoryBenchResult, RankCandidateInput};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{self, Read};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum MemoryCliRequest {
    ChunkMarkdown {
        content: String,
        tokens: usize,
        overlap: usize,
    },
    CosineSimilarity {
        a: Vec<f64>,
        b: Vec<f64>,
    },
    RankCosine {
        query: Vec<f64>,
        candidates: Vec<RankCandidateInput>,
        limit: usize,
    },
    BenchMemory {
        chunk_iters: usize,
        rank_iters: usize,
        content: String,
        tokens: usize,
        overlap: usize,
        query: Vec<f64>,
        candidates: Vec<RankCandidateInput>,
        limit: usize,
    },
}

#[derive(Debug, Serialize)]
struct MemoryCliResponse<T: Serialize> {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn ok<T: Serialize>(result: T) -> MemoryCliResponse<T> {
    MemoryCliResponse {
        ok: true,
        result: Some(result),
        error: None,
    }
}

fn error_response(message: String) -> MemoryCliResponse<serde_json::Value> {
    MemoryCliResponse {
        ok: false,
        result: None,
        error: Some(message),
    }
}

fn handle_request(request: MemoryCliRequest) -> serde_json::Value {
    match request {
        MemoryCliRequest::ChunkMarkdown {
            content,
            tokens,
            overlap,
        } => json!(ok(chunk_markdown(content.as_str(), tokens, overlap))),
        MemoryCliRequest::CosineSimilarity { a, b } => {
            json!(ok(
                json!({ "score": cosine_similarity(a.as_slice(), b.as_slice()) })
            ))
        }
        MemoryCliRequest::RankCosine {
            query,
            candidates,
            limit,
        } => json!(ok(rank_cosine(
            query.as_slice(),
            candidates.as_slice(),
            limit
        ))),
        MemoryCliRequest::BenchMemory {
            chunk_iters,
            rank_iters,
            content,
            tokens,
            overlap,
            query,
            candidates,
            limit,
        } => {
            let result: MemoryBenchResult = bench_memory(BenchMemoryParams {
                chunk_iters,
                rank_iters,
                content: content.as_str(),
                tokens,
                overlap,
                query: query.as_slice(),
                candidates: candidates.as_slice(),
                limit,
            });
            json!(ok(result))
        }
    }
}

fn main() {
    let mut input = String::new();
    if let Err(read_err) = io::stdin().read_to_string(&mut input) {
        println!(
            "{}",
            serde_json::to_string(&error_response(format!("failed to read stdin: {read_err}")))
                .unwrap_or_default()
        );
        std::process::exit(1);
    }
    let request: MemoryCliRequest = match serde_json::from_str(input.as_str()) {
        Ok(request) => request,
        Err(parse_err) => {
            println!(
                "{}",
                serde_json::to_string(&error_response(format!(
                    "failed to parse request JSON: {parse_err}"
                )))
                .unwrap_or_default()
            );
            std::process::exit(1);
        }
    };
    let response = handle_request(request);
    println!("{response}");
}
