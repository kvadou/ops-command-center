import { useCompanyName } from '../contexts/CompanyNameContext';
import KnowledgeQuestions from './KnowledgeQuestions';

/**
 * KnowledgeQuestionsPage - Standalone page for viewing/asking questions
 */
export default function KnowledgeQuestionsPage() {
  const { isMainBranch } = useCompanyName();

  return (
      <div className="max-w-4xl mx-auto w-full">
        <KnowledgeQuestions isMainBranch={isMainBranch} />
      </div>
  );
}

