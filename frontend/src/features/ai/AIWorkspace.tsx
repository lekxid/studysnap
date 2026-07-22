"use client";

import { useState } from "react";
import SectionHeader from "@/components/ui/SectionHeader";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import QuestionPanel from "./QuestionPanel";
import { createLesson } from "./services/lessonService";
import { Lesson } from "./types/lesson";

export default function AIWorkspace() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAsk(question: string, context: string) {
    if (!question.trim()) return;

    setLoading(true);
    setError("");

    try {
      const data = await createLesson(question, context);
      setLesson(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 text-white">
      <SectionHeader
        title="StudySnap AI Workspace"
        subtitle="Ask questions and turn answers into structured study lessons."
      />

      <QuestionPanel onAsk={handleAsk} loading={loading} />

      {loading && (
        <Card>
          <Spinner />
        </Card>
      )}

      {error && (
        <Card title="Error">
          <p className="text-red-400">{error}</p>
        </Card>
      )}

      {!lesson && !loading && !error && (
        <EmptyState
          title="No lesson yet"
          description="Ask StudySnap AI a question to generate your first structured lesson."
        />
      )}

      {lesson && (
        <div className="grid gap-6">
          <Card title={lesson.title}>
            <p className="text-slate-300">
              Difficulty: {lesson.difficulty} • {lesson.estimated_time}
            </p>
          </Card>

          <Card title="Summary">
            <p className="leading-7 text-slate-300">{lesson.summary}</p>
          </Card>

          <Card title="Key Points">
            <ul className="list-disc space-y-2 pl-6 text-slate-300">
              {lesson.key_points.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          </Card>

          <Card title="Example">
            <p className="leading-7 text-slate-300">{lesson.example}</p>
          </Card>

          <Card title="Common Mistakes">
            <ul className="list-disc space-y-2 pl-6 text-slate-300">
              {lesson.common_mistakes.map((mistake, index) => (
                <li key={index}>{mistake}</li>
              ))}
            </ul>
          </Card>

          <Card title="Practice Question">
            <p className="leading-7 text-slate-300">
              {lesson.practice_question}
            </p>
          </Card>

          <Card title="Related Topics">
            <div className="flex flex-wrap gap-2">
              {lesson.related_topics.map((topic, index) => (
                <span
                  key={index}
                  className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-sm text-amber-200"
                >
                  {topic}
                </span>
              ))}
            </div>
          </Card>

          <Card title="Next Step">
            <p className="leading-7 text-slate-300">{lesson.next_step}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
