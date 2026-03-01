/**
 * Judges Page
 * Wrapper for JudgesPage component with routing logic
 */

import { useNavigate } from 'react-router-dom';
import { JudgesPage as JudgesPageComponent } from '../../components/JudgesPage';
import { generateRoute } from '../../router/routes';

export function JudgesPage() {
  const navigate = useNavigate();

  const handleSelectJudge = (judge: any) => {
    navigate(generateRoute.judgeDetail(judge.dossier_number || judge.id), {
      state: {
        person: {
          type: 'judge',
          data: {
            id: judge.id,
            name: judge.full_name,
            position: judge.court_name,
            dossier_number: judge.dossier_number,
          },
        },
      },
    });
  };

  return <JudgesPageComponent onSelectJudge={handleSelectJudge} />;
}
