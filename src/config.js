/**
 * Configuration
 * 
 * Central config for the AI Operations Co-Pilot.
 * Controls feature flags and system behavior.
 */

const config = {
  /**
   * Enable LLM-powered enhancement.
   * When false (default), Enhancement Agent uses only deterministic rules.
   * When true, Enhancement Agent attempts LLM calls with fallback to deterministic.
   */
  enable_llm: true,

  /**
   * Fallback mode — always enabled, cannot be disabled.
   * If LLM fails or returns invalid output, original values are preserved.
   */
  fallback_mode: true,

  /**
   * Confidence threshold for pipeline to proceed.
   * Below this value → routed to human_review.
   */
  confidence_threshold: 0.70,

  /**
   * LLM configuration (only used when enable_llm is true).
   */
  llm: {
    /** LLM provider: "gemini" | "openai" | "claude" */
    provider: "gemini",

    /** API key — read from environment variable */
    api_key: process.env.LLM_API_KEY || "",

    /** Max timeout for LLM calls in milliseconds */
    timeout_ms: 5000,

    /** Max tokens for LLM response */
    max_tokens: 150
  }
};

export default config;
