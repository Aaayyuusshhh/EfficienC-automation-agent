/**
 * Enhancement Agent
 * 
 * Position: AFTER Input Agent, BEFORE Decision Agent
 * 
 * Responsibility: Refine Input Agent output for better downstream processing.
 * - Clean topic (remove noise, improve clarity)
 * - Improve raw_summary readability
 * - Optionally refine confidence (never inflate artificially)
 * 
 * Rules:
 * - MUST NOT add new fields or change schema
 * - MUST NOT modify intent or entities.person
 * - MUST NOT hallucinate entities
 * - Output schema is IDENTICAL to Input Agent schema
 * - When LLM is disabled, uses deterministic rules only
 * - When LLM fails, falls back to deterministic rules
 * 
 * Input:  Input Agent JSON output
 * Output: Enhanced Input JSON (same schema, improved values only)
 */

import config from "../config.js";
import { rewriteTopic, improveSummary } from "../utils/llmWrapper.js";

// Noise words that degrade topic quality
const TOPIC_NOISE = [
  /\bplease\b/gi,
  /\bkindly\b/gi,
  /\basap\b/gi,
  /\burgent(ly)?\b/gi,
  /\bcritical(ly)?\b/gi,
  /\bimmediately\b/gi,
  /\bjust\b/gi,
  /\breally\b/gi,
  /\bactually\b/gi,
  /\bbasically\b/gi,
  /\bvery\b/gi,
  /\bquite\b/gi
];

// Filler patterns in summaries
const SUMMARY_NOISE = [
  /\babout about\b/gi,
  /\bfor for\b/gi,
  /\bthe the\b/gi,
  /\bon on\b/gi,
  /\s{2,}/g
];

// Articles/prepositions that shouldn't start or end a topic
const TRIM_EDGES = /^(the|a|an|to|for|of|and|or|in|on|at|by)\s+|\s+(the|a|an|to|for|of|and|or|in|on|at|by)$/gi;

/**
 * Clean a topic string using deterministic rules.
 * Removes noise words, normalizes whitespace, trims edges.
 */
function cleanTopicDeterministic(topic) {
  if (!topic) return topic;

  let cleaned = topic;

  // Remove noise words
  for (const pattern of TOPIC_NOISE) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Remove leading/trailing articles and prepositions
  cleaned = cleaned.replace(TRIM_EDGES, "").trim();

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // If cleaning destroyed the topic, return original
  return cleaned.length >= 2 ? cleaned : topic;
}

/**
 * Improve a summary using deterministic rules.
 * Removes duplicates, fixes grammar artifacts, normalizes.
 */
function improveSummaryDeterministic(summary, intent, entities) {
  if (!summary) return summary;

  let improved = summary;

  // Remove duplicate consecutive words (e.g., "about about")
  for (const pattern of SUMMARY_NOISE) {
    improved = improved.replace(pattern, match => {
      if (/\s{2,}/.test(match)) return " ";
      return match.split(" ")[0];
    });
  }

  // Capitalize first letter
  if (improved.length > 0) {
    improved = improved.charAt(0).toUpperCase() + improved.slice(1);
  }

  // Collapse whitespace
  improved = improved.replace(/\s+/g, " ").trim();

  // Enforce 15-word max
  const words = improved.split(/\s+/);
  if (words.length > 15) {
    improved = words.slice(0, 15).join(" ");
  }

  return improved.length >= 2 ? improved : summary;
}

/**
 * Refine confidence based on entity completeness.
 * Rules:
 * - Never inflate above 0.95
 * - Never increase by more than 0.05
 * - Only increase if entities are well-populated
 * - Can decrease slightly if entities are sparse despite high confidence
 */
function refineConfidence(confidence, entities) {
  let adjustment = 0;

  // Count populated entities
  const entityValues = [entities.person, entities.topic, entities.urgency, entities.deadline];
  const populatedCount = entityValues.filter(v => v !== null && v !== undefined).length;

  // If 3+ entities populated, slight boost (max +0.03)
  if (populatedCount >= 3) {
    adjustment += 0.03;
  }

  // If 2 entities populated, tiny boost (+0.01)
  if (populatedCount === 2) {
    adjustment += 0.01;
  }

  // If only 0-1 entities and confidence is high, slight penalty
  if (populatedCount <= 1 && confidence > 0.80) {
    adjustment -= 0.02;
  }

  // Apply adjustment with hard caps
  let refined = confidence + adjustment;
  refined = Math.min(refined, 0.95);               // Never above 0.95
  refined = Math.max(refined, confidence - 0.05);   // Never drop more than 0.05
  refined = Math.max(refined, 0.10);                // Never below 0.10

  return Math.round(refined * 100) / 100;
}

/**
 * Main Enhancement Agent function.
 * 
 * Takes Input Agent output and returns enhanced version with SAME schema.
 * Uses deterministic rules first, then optionally LLM if enabled.
 * 
 * @param {object} inputAgentOutput - The validated Input Agent output
 * @returns {Promise<object>} Enhanced Input JSON (same schema)
 */
export async function enhance(inputAgentOutput) {
  // Start with a copy — never mutate the original
  const enhanced = JSON.parse(JSON.stringify(inputAgentOutput));

  // Mark which agent processed this
  enhanced.agent = "input_agent"; // Schema unchanged — stays as input_agent schema

  // ─── Step 1: Clean topic (deterministic) ───
  enhanced.entities.topic = cleanTopicDeterministic(enhanced.entities.topic);

  // ─── Step 2: Improve summary (deterministic) ───
  enhanced.raw_summary = improveSummaryDeterministic(
    enhanced.raw_summary,
    enhanced.intent,
    enhanced.entities
  );

  // ─── Step 3: Refine confidence ───
  enhanced.confidence = refineConfidence(enhanced.confidence, enhanced.entities);

  // ─── Step 4: Update status based on refined confidence ───
  enhanced.status = enhanced.confidence >= config.confidence_threshold
    ? "processed"
    : "human_review";

  // ─── Step 5: Optional LLM enhancement ───
  if (config.enable_llm) {
    try {
      // LLM topic rewriting (with fallback)
      const llmTopic = await rewriteTopic(enhanced.entities.topic, enhanced.intent);
      if (llmTopic && llmTopic.length >= 2) {
        enhanced.entities.topic = llmTopic;
      }

      // LLM summary improvement (with fallback)
      const llmSummary = await improveSummary(
        enhanced.raw_summary,
        enhanced.intent,
        enhanced.entities
      );
      if (llmSummary && llmSummary.split(/\s+/).length <= 15) {
        enhanced.raw_summary = llmSummary;
      }
    } catch {
      // LLM failed entirely — deterministic values are already in place
      // No action needed (fallback_mode is always on)
    }
  }

  return enhanced;
}
