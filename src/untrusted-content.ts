/**
 * Local untrusted-content wrapper. Mirrors the boundary semantics of OpenClaw's
 * bundled web-search providers (unique random marker IDs + marker spoofing and
 * LLM special-token neutralization) without importing private SDK subpaths.
 */
import { randomBytes } from "node:crypto";

const START_NAME = "EXTERNAL_UNTRUSTED_CONTENT";
const END_NAME = "END_EXTERNAL_UNTRUSTED_CONTENT";

const LLM_SPECIAL_TOKENS = [
  "<|im_start|>",
  "<|im_end|>",
  "<|endoftext|>",
  "<|begin_of_text|>",
  "<|end_of_text|>",
  "<|start_header_id|>",
  "<|end_header_id|>",
  "<|eot_id|>",
  "<|python_tag|>",
  "<|eom_id|>",
  "[INST]",
  "[/INST]",
  "<<SYS>>",
  "<</SYS>>",
  "<s>",
  "</s>",
  "<|channel|>",
  "<|message|>",
  "<|return|>",
  "<|call|>",
  "<start_of_turn>",
  "<end_of_turn>",
];

const SPECIAL_TOKEN_PATTERN = new RegExp(
  [...LLM_SPECIAL_TOKENS.map(escapeRegExp), /<\|reserved_special_token_\d+\|>/u.source].join("|"),
  "g",
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Defuse spoofed boundary markers and strip LLM special tokens from content. */
export function sanitizeUntrustedContent(content: string): string {
  const defusedMarkers = content
    .replaceAll(`${START_NAME}`, `${START_NAME}_`)
    .replaceAll(`${END_NAME}`, `${END_NAME}_`);
  return defusedMarkers.replace(SPECIAL_TOKEN_PATTERN, "[REMOVED_SPECIAL_TOKEN]");
}

/**
 * Wrap web-search content with unique boundary markers so the agent treats it
 * as data, never as instructions.
 */
export function wrapWebContent(content: string): string {
  const markerId = randomBytes(8).toString("hex");
  return [
    `<<<${START_NAME} id="${markerId}">>>`,
    "Source: Web Search",
    "---",
    sanitizeUntrustedContent(content),
    `<<<${END_NAME} id="${markerId}">>>`,
  ].join("\n");
}
