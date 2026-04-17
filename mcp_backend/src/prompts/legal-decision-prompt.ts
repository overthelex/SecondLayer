// Proprietary implementation: @secondlayer/core (private repo)
// Real prompt with the composite-score formula and LDP schema lives in core.
// The stub ships a minimal placeholder so the open-source build stays functional.

export const DECISION_SYSTEM_PROMPT = `You are a Legal Decision Protocol (LDP) engine. Given search results and case data, produce a structured legal decision as valid JSON with: positions, scores, decision_tree, risk_map, reasoning, primary_recommendation, alternative_recommendation, next_steps, confidence, limitations. All text in Ukrainian.`;
