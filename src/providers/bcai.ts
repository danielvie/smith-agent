import { createProvider, envApiKeyAuth, type Model } from "@earendil-works/pi-ai";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

export const BCAI_PROVIDER_ID = "bcai";
export const BCAI_API_URL = "https://bcai-openai-proxy-test.taspre-phx.apps.boeing.com/v1";
export const BCAI_MODEL_ID = "gpt-5.6-luna";
export const BCAI_API_KEY_ENV = "UDAL_PAT";
export const BCAI_CONTEXT_WINDOW = 922_000;
const BCAI_MODEL_IDS = ["gpt-5.6-sol", "gpt-5.6-terra", BCAI_MODEL_ID] as const;

const bcaiModels: Model<"openai-responses">[] = BCAI_MODEL_IDS.map((id) => {
  const openaiModel = openaiProvider().getModels().find((model) => model.id === id);
  if (!openaiModel) throw new Error(`OpenAI model metadata not found: ${id}.`);
  return {
    ...openaiModel,
    provider: BCAI_PROVIDER_ID,
    baseUrl: BCAI_API_URL,
    contextWindow: BCAI_CONTEXT_WINDOW,
  };
});

export function bcaiProvider() {
  return createProvider({
    id: BCAI_PROVIDER_ID,
    name: "BCAI",
    baseUrl: BCAI_API_URL,
    auth: { apiKey: envApiKeyAuth("BCAI API key", [BCAI_API_KEY_ENV]) },
    models: bcaiModels,
    api: openAIResponsesApi(),
  });
}
