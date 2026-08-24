import { createProvider, envApiKeyAuth, type Model } from "@earendil-works/pi-ai";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

export const BCAI_PROVIDER_ID = "bcai";
export const BCAI_API_URL = "https://bcai-openai-proxy-test.taspre-phx.apps.boeing.com/v1";
export const BCAI_MODEL_ID = "gpt-5.6-luna";
export const BCAI_API_KEY_ENV = "UDAL_PAT";

const openaiModel = openaiProvider().getModels().find((model) => model.id === BCAI_MODEL_ID);
if (!openaiModel) throw new Error(`OpenAI model metadata not found: ${BCAI_MODEL_ID}.`);

const bcaiModel: Model<"openai-responses"> = {
  ...openaiModel,
  provider: BCAI_PROVIDER_ID,
  baseUrl: BCAI_API_URL,
};

export function bcaiProvider() {
  return createProvider({
    id: BCAI_PROVIDER_ID,
    name: "BCAI",
    baseUrl: BCAI_API_URL,
    auth: { apiKey: envApiKeyAuth("BCAI API key", [BCAI_API_KEY_ENV]) },
    models: [bcaiModel],
    api: openAIResponsesApi(),
  });
}
