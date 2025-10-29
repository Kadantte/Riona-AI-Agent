import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "../config/logger";
import { geminiApiKeys } from "../secret";
import { handleError } from "../utils";
import { InstagramCommentSchema } from "./schema";
import fs from "fs";
import path from "path";
import * as readlineSync from "readline-sync";

// Track API key state across requests
let currentAgentApiKeyIndex = 0;
const triedAgentApiKeys = new Set<number>();

// Function to get the next API key specifically for the agent
const getNextAgentApiKey = () => {
  triedAgentApiKeys.add(currentAgentApiKeyIndex);

  // Move to next key
  currentAgentApiKeyIndex = (currentAgentApiKeyIndex + 1) % geminiApiKeys.length;

  // Check if we've tried all keys
  if (triedAgentApiKeys.size >= geminiApiKeys.length) {
    triedAgentApiKeys.clear();
    throw new Error(
      "All API keys have reached their rate limits. Please try again later."
    );
  }

  return geminiApiKeys[currentAgentApiKeyIndex];
};

export async function runAgent(
  schema: InstagramCommentSchema,
  prompt: string,
  apiKeyIndex: number = currentAgentApiKeyIndex
): Promise<any> {
  let geminiApiKey = geminiApiKeys[apiKeyIndex];

  if (!geminiApiKey) {
    logger.error("No Gemini API key available.");
    return "No API key available.";
  }

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: schema,
  };

  const googleAI = new GoogleGenerativeAI(geminiApiKey);
  const model = googleAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig,
  });

  try {
    const result = await model.generateContent(prompt);

    if (!result || !result.response) {
      logger.info("No response received from the AI model. || Service Unavailable");
      return "Service unavailable!";
    }

    const responseText = result.response.text();
    const data = JSON.parse(responseText);
    return data;
  } catch (error: any) {
    // Rotate API key on 429
    if (error instanceof Error && error.message.includes("429")) {
      logger.error(
        `---GEMINI_API_KEY_${apiKeyIndex + 1} limit exhausted, switching to the next API key...`
      );
      try {
        geminiApiKey = getNextAgentApiKey();
        return runAgent(schema, prompt, currentAgentApiKeyIndex);
      } catch (keyError) {
        if (keyError instanceof Error) {
          logger.error("API key error:", keyError.message);
          return `Error: ${keyError.message}`;
        } else {
          logger.error("Unknown error when trying to get next API key");
          return "Error: All API keys have reached their rate limits. Please try again later.";
        }
      }
    }
    return handleError(error, apiKeyIndex, schema, prompt, runAgent);
  }
}

// ===== ZMIENIONE: Ładowanie Adrian's Style =====
export function chooseCharacter(): any {
  // Try to load Adrian's custom style first
  try {
    const adrianStylePath = path.join(process.cwd(), "src", "config", "adrian-style");
    logger.info(`Loading Adrian's custom style configuration...`);
    const adrianStyle = require(adrianStylePath).default || require(adrianStylePath).adrianStyleConfig;
    logger.info(`✅ Adrian's style loaded successfully!`);
    return adrianStyle;
  } catch (adrianError) {
    logger.warn(`Could not load adrian-style.ts, falling back to JSON characters`);
    
    // Fallback to JSON characters
    const charactersDir = (() => {
      const buildPath = path.join(__dirname, "characters");
      return fs.existsSync(buildPath)
        ? buildPath
        : path.join(process.cwd(), "src", "Agent", "characters");
    })();

    const files = fs.readdirSync(charactersDir);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    if (jsonFiles.length === 0) {
      throw new Error("No character JSON files found and no adrian-style.ts available");
    }

    const chosenFile = path.join(charactersDir, jsonFiles[0]);
    logger.info(`Automatically selected character: ${jsonFiles[0]}`);
    const data = fs.readFileSync(chosenFile, "utf8");
    return JSON.parse(data);
  }
}

export function initAgent(): any {
  try {
    const character = chooseCharacter();
    console.log("Character/Style selected:", character);
    return character;
  } catch (error) {
    console.error("Error selecting character:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  (() => {
    initAgent();
  })();
}
