"use client";

import { useState } from "react";

import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

type Props = {
  onAsk: (question: string, context: string) => void;
  loading?: boolean;
};

export default function QuestionPanel({
  onAsk,
  loading = false,
}: Props) {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");

  return (
    <Card title="Ask StudySnap AI">
      <div className="space-y-4">
        <Input
          placeholder="Ask any study question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <Textarea
          rows={5}
          placeholder="Paste your notes (optional)..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />

        <Button
          loading={loading}
          onClick={() => onAsk(question, context)}
        >
          Ask AI
        </Button>
      </div>
    </Card>
  );
}
