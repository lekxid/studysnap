import { generateLesson } from "@/lib/api";
import { Lesson } from "../types/lesson";

export async function createLesson(
  question: string,
  context: string
): Promise<Lesson> {
  return generateLesson(question, context);
}
