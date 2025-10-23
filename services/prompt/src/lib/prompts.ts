export const EXTRACTION_PROMPT = `
You are an advanced information extraction system. Analyze the following content and extract:
1. A concise summary
2. Action items with due dates if mentioned
3. Named entities (people, organizations, locations, etc.)
4. Key topics
5. Overall sentiment

Content:
{content}

Respond with a JSON object matching this schema:
{
  "summary": "string",
  "action_items": [{
    "text": "string",
    "due": "YYYY-MM-DD",
    "priority": "low|medium|high",
    "status": "pending|in_progress|completed"
  }],
  "entities": [{
    "type": "string",
    "value": "string",
    "label": "string"
  }],
  "topics": ["string"],
  "sentiment": "positive|neutral|negative",
  "confidence": 0.0-1.0
}`;

export const SUMMARIZATION_PROMPT = `
Create a concise summary of the following content, focusing on key points, decisions, and action items. 
Maintain all important technical details and references.

Content:
{content}
`;

export const FUNCTION_PROMPTS = {
  extract_entities: {
    name: "extract_entities",
    description: "Extract and categorize entities from text",
    parameters: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["PERSON", "ORG", "LOCATION", "DATE", "EVENT"] },
              value: { type: "string" },
              context: { type: "string" }
            },
            required: ["type", "value"]
          }
        }
      },
      required: ["entities"]
    }
  }
} as const;
