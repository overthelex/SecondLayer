import { BaseService } from '../base/BaseService';

export interface ERAULawyer {
  id: number;
  surname: string;
  firstname: string;
  middlename: string;
  racalc: string;
  certnum: string;
  certat: string;
  certcalc: string;
}

export interface ERAUProfile {
  id: string;
  fullName: string;
  council: string | null;
  certificate: {
    number: string | null;
    date: string | null;
    issuedBy: string | null;
    decisionNumber: string | null;
    decisionDate: string | null;
  };
  experience: string | null;
  contacts: {
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  practiceForm: {
    type: string | null;
    address: string | null;
    phone: string | null;
  };
  qualification: Array<{ year: string; status: string }>;
}

export class ERAUService extends BaseService {
  async searchLawyers(surname: string): Promise<ERAULawyer[]> {
    try {
      const response = await this.client.get<ERAULawyer[]>('/api/erau/search', {
        params: { surname },
      });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getProfile(id: string): Promise<ERAUProfile> {
    try {
      const response = await this.client.get<ERAUProfile>(`/api/erau/profile/${id}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

export const erauService = new ERAUService();
