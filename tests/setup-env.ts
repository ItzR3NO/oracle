// Ensure API keys are present during tests so runOracle doesn't fail early when CI
// runs without real credentials.
process.env.OPENAI_API_KEY ||= 'sk-test';
process.env.GEMINI_API_KEY ||= 'gm-test';
process.env.ORACLE_MIN_PROMPT_CHARS ||= '1';
