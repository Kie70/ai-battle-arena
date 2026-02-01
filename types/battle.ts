export type AttackType = 'A' | 'B' | 'C';

export type BattleStatus = 'ongoing' | 'pro_win' | 'con_win';

export interface HPState {
  pro: number;
  con: number;
}

export interface JudgeResult {
  damage: number;
  isCritical: boolean;
  isOffTopic?: boolean;
  critReason?: string;
  offTopicReason?: string;
  logicScore: number;
  rhetoricScore: number;
  counterScore: number;
  currentHP: HPState;
  totalScore: number;
  comboCount: number;
  battleStatus: BattleStatus;
  commentary: string;
  nextRoundType?: AttackType;
}

export interface DebateLogEntry {
  side: 'pro' | 'con';
  content: string;
  damage?: number;
  isCritical?: boolean;
  isOffTopic?: boolean;
  commentary?: string;
}

export interface CurrentState {
  proHP: number;
  conHP: number;
  combo: number;
  totalScore?: number;
}

export interface HistoryEntry {
  role: 'pro' | 'con';
  content: string;
}

export interface DebateRequestBody {
  topic: string;
  round: number;
  userChoice: AttackType | string;
  currentState: CurrentState;
  history: HistoryEntry[];
  userSide?: 'pro' | 'con';
  phase?: 'full' | 'kimi_only' | 'deepseek_only';
}

export interface DebateResponseKimiOrDeepSeek {
  content: string;
  damage: number;
  isCritical: boolean;
  isOffTopic?: boolean;
  currentHP: HPState;
  totalScore: number;
  comboCount: number;
  battleStatus: BattleStatus;
  commentary: string;
}

export interface DebateResponse {
  kimi: DebateResponseKimiOrDeepSeek;
  deepseek?: DebateResponseKimiOrDeepSeek;
  state?: JudgeResult;
  winner?: 'pro' | 'con';
  finalData?: JudgeResult;
}
