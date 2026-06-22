import OpenAI from "openai";

let client: OpenAI | null = null;

// Lazily construct the OpenAI client so the server can boot even if the AI
// integration is not yet provisioned; we only fail when a dungeon turn is run.
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    if (!apiKey || !baseURL) {
      throw new Error(
        "OpenAI AI integration is not provisioned (AI_INTEGRATIONS_OPENAI_* missing)",
      );
    }
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}
