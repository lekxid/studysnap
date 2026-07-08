import { ReactNode } from "react";

import ContinueLearning from "./ContinueLearning";
import ProjectBrain from "./ProjectBrain";
import ProjectHero from "./ProjectHero";
import ProjectProgress from "./ProjectProgress";
import ProjectQuickActions from "./ProjectQuickActions";
import ProjectSearch from "./ProjectSearch";

type ContinueItem = {
  id: number;
  title: string;
  subtitle: string;
  icon?: string;
  onOpen: () => void;
};

type Action = {
  title: string;
  description: string;
  icon: string;
  href?: string;
  onClick?: () => void;
};

type Props = {
  title: string;
  subject: string;
  description?: string | null;

  pdfCount: number;
  progress: number;

  continueItems: ContinueItem[];
  quickActions: Action[];

  onBack: () => void;
  onAskAI: () => void;
  onUploadPDF: () => void;
  onSearch: (query: string) => void;
  onViewAll: () => void;

  children?: ReactNode;
};

export default function ProjectWorkspace({
  title,
  subject,
  description,
  pdfCount,
  progress,
  continueItems,
  quickActions,
  onBack,
  onAskAI,
  onUploadPDF,
  onSearch,
  onViewAll,
  children,
}: Props) {
  return (
    <div className="space-y-6">

      <ProjectHero
        title={title}
        subject={subject}
        description={description}
        pdfCount={pdfCount}
        onBack={onBack}
        onAskAI={onAskAI}
        onUploadPDF={onUploadPDF}
      />

      <ProjectSearch
        onSearch={onSearch}
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">

        <ContinueLearning
          items={continueItems}
          onViewAll={onViewAll}
        />

        <ProjectProgress
          percent={progress}
          pdfCount={pdfCount}
        />

      </div>

      <ProjectQuickActions
        actions={quickActions}
      />

      <ProjectBrain />

      {children}

    </div>
  );
}
