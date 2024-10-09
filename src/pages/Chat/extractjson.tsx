export interface SendResponseFunction {
    request_url: string;
    method: string;
}

export interface ExtractedJson {
    send_response_function: SendResponseFunction[];
}

export function extractJsonFromMessage(message: string): ExtractedJson | string {
    const regex = /```\s*(\{[\s\S]*?\})\s*```/;
    const match = message.match(regex);

    if (!match) {
        console.error("No JSON-like content found in the message");
        return "none";
    }

    const jsonLikeString = match[1];

    // Clean up the extracted string to make it valid JSON
    const cleanedJsonString = jsonLikeString
        .replace(/'/g, '"')  // Replace single quotes with double quotes
        .replace(/(\w+):/g, '"$1":');  // Add quotes to keys

    try {
        const parsedJson = JSON.parse(cleanedJsonString) as ExtractedJson;

        // Validate the structure of the parsed JSON
        if (!Array.isArray(parsedJson.send_response_function)) {
            throw new Error("Invalid structure: send_response_function is not an array");
        }

        return parsedJson;
    } catch (error) {
        console.error("Failed to parse or validate JSON:", error);
        return "none";
    }
}