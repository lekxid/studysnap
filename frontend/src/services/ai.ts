import { askAi } from "@/lib/api";

export async function askQuestion(
  question: string,
  context: string
) {
  return await askAi(question, context);
}
