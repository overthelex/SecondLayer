/**
 * Lawyers Page
 * Wrapper for LawyersPage component with routing logic
 */

import { useNavigate } from 'react-router-dom';
import { LawyersPage as LawyersPageComponent } from '../../components/LawyersPage';
import { generateRoute } from '../../router/routes';
import { ERAULawyer } from '../../services/api/ERAUService';

export function LawyersPage() {
  const navigate = useNavigate();

  const handleSelectLawyer = (lawyer: ERAULawyer) => {
    const name = [lawyer.surname, lawyer.firstname, lawyer.middlename].filter(Boolean).join(' ');
    navigate(generateRoute.lawyerDetail(String(lawyer.id)), {
      state: {
        person: {
          type: 'lawyer',
          data: {
            id: String(lawyer.id),
            name,
            region: lawyer.racalc,
            certnum: lawyer.certnum,
            certat: lawyer.certat,
          },
        },
      },
    });
  };

  return <LawyersPageComponent onSelectLawyer={handleSelectLawyer} />;
}
