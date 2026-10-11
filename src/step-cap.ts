interface MessageLike {
  role: string;
  content?: unknown;
}

/**
 * On an agent's last allowed step, OpenCode appends its "maximum steps reached"
 * instruction as a trailing assistant (prefill) turn. Gemini and current Claude
 * models reject a request that ends on an assistant turn, so the lane fails with
 * a 400 and returns nothing. Inside the agent loop the only trailing text-only
 * assistant turn is that instruction, so moving it to the user role is safe for
 * every provider. Returns true when it changed the request.
 */
export function reroleTrailingPrefill(messages: MessageLike[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant" || !Array.isArray(last.content) || last.content.length === 0) return false;
  const textOnly = last.content.every(
    (part) => typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string",
  );
  if (!textOnly) return false;
  last.role = "user";
  return true;
}