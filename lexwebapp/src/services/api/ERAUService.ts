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
}

export const erauService = new ERAUService();
