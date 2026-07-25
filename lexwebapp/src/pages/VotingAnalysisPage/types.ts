export interface VotingAnalysisPageProps {
  onBack?: () => void;
}

export interface VotingResult {
  for: number;
  against: number;
  abstain: number;
  notVoted: number;
}

export interface FactionVoting {
  name: string;
  for: number;
  against: number;
  abstain: number;
  notVoted: number;
  total: number;
}

export interface RegionalDataItem {
  region: string;
  deputies: number;
  for: number;
  against: number;
  abstain: number;
  percentage: number;
}

export interface VotingHistoryItem {
  id: number;
  date: string;
  type: string;
  result: string;
  for: number;
  against: number;
  abstain: number;
  notVoted: number;
}

export const quickAccessBills = [
  'Державний бюджет 2026',
  'Про внесення змін до Податкового кодексу',
  'Про мобілізацію',
  'Про ратифікацію міжнародних угод',
];

export const votingResult: VotingResult = {
  for: 301,
  against: 89,
  abstain: 45,
  notVoted: 27,
};

export const factionVoting: FactionVoting[] = [
  {
    name: 'Слуга народу',
    for: 120,
    against: 5,
    abstain: 3,
    notVoted: 2,
    total: 130,
  },
  {
    name: 'Європейська солідарність',
    for: 56,
    against: 2,
    abstain: 1,
    notVoted: 0,
    total: 59,
  },
  {
    name: 'Батьківщина',
    for: 45,
    against: 3,
    abstain: 2,
    notVoted: 1,
    total: 51,
  },
  {
    name: 'Опозиційна платформа',
    for: 2,
    against: 38,
    abstain: 5,
    notVoted: 3,
    total: 48,
  },
  {
    name: 'Голос',
    for: 34,
    against: 1,
    abstain: 2,
    notVoted: 0,
    total: 37,
  },
  {
    name: 'Позафракційні',
    for: 44,
    against: 40,
    abstain: 32,
    notVoted: 21,
    total: 137,
  },
];

export const regionalData: RegionalDataItem[] = [
  {
    region: 'Київська область',
    deputies: 23,
    for: 18,
    against: 3,
    abstain: 2,
    percentage: 78,
  },
  {
    region: 'Львівська область',
    deputies: 18,
    for: 16,
    against: 1,
    abstain: 1,
    percentage: 89,
  },
  {
    region: 'Одеська область',
    deputies: 15,
    for: 9,
    against: 4,
    abstain: 2,
    percentage: 60,
  },
  {
    region: 'Харківська область',
    deputies: 20,
    for: 14,
    against: 4,
    abstain: 2,
    percentage: 70,
  },
  {
    region: 'Дніпропетровська область',
    deputies: 22,
    for: 17,
    against: 3,
    abstain: 2,
    percentage: 77,
  },
];

export const votingHistory: VotingHistoryItem[] = [
  {
    id: 1,
    date: '12.11.2025',
    type: 'Прийняття за основу',
    result: 'approved',
    for: 278,
    against: 95,
    abstain: 52,
    notVoted: 25,
  },
  {
    id: 2,
    date: '01.12.2025',
    type: '2-ге читання, 1-а спроба',
    result: 'approved',
    for: 245,
    against: 112,
    abstain: 68,
    notVoted: 25,
  },
  {
    id: 3,
    date: '10.12.2025',
    type: '2-ге читання, 2-а спроба',
    result: 'rejected',
    for: 213,
    against: 145,
    abstain: 72,
    notVoted: 20,
  },
  {
    id: 4,
    date: '15.12.2025',
    type: 'Остаточне прийняття',
    result: 'approved',
    for: 301,
    against: 89,
    abstain: 45,
    notVoted: 15,
  },
];
