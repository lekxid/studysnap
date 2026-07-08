import PremiumCard from "@/components/ui/PremiumCard";
import SectionHeader from "@/components/ui/SectionHeader";

export default function ProjectBrain() {
  const items = [
    {
      title: "Knowledge",
      value: "Ranking Engine Active",
      icon: "🧠",
    },
    {
      title: "Memory",
      value: "Coming Soon",
      icon: "💾",
    },
    {
      title: "Goal",
      value: "Not Set",
      icon: "🎯",
    },
    {
      title: "Instructions",
      value: "Default AI",
      icon: "⚙️",
    },
    {
      title: "Confidence",
      value: "--",
      icon: "📈",
    },
    {
      title: "Exam Date",
      value: "Not Added",
      icon: "📅",
    },
  ];

  return (
    <PremiumCard>
      <SectionHeader
        eyebrow="🧠 Project Brain"
        title="Your AI learning brain"
        subtitle="This project will gradually learn from your study materials and activity."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-white/10 bg-black/25 p-5 transition hover:border-yellow-400/30"
          >
            <div className="text-3xl">{item.icon}</div>

            <p className="mt-4 text-sm font-bold text-yellow-200">
              {item.title}
            </p>

            <p className="mt-2 text-base font-black text-white">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
        <p className="text-sm font-bold text-yellow-200">
          Future Vision
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          Project Brain will eventually remember your weak topics, strong topics,
          quiz history, study habits, AI conversations, goals, confidence, and
          personalized learning recommendations.
        </p>
      </div>
    </PremiumCard>
  );
}
