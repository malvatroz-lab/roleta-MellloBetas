
export enum SystemStatus {
  AUTHORIZED = 'ENTRADA AUTORIZADA',
  OBSERVATION = 'OBSERVAÇÃO',
  NO_SIGNAL = 'SEM SINAL'
}

export enum TriggerType {
  CONTINUITY = 'Continuidade',
  PERSISTENT_ECHO = 'Eco Persistente',
  PRESSURE = 'Pressão',
  NONE = 'Nenhum'
}

export interface SpinResult {
  number: number;
  column: number; // 0, 1, 2, or 3
  timestamp: string;
}

export interface BankConfig {
  initialBank: number;
  entryPercentage: number;
  minToken: number; // R$ 0.50
}

export interface Statistics {
  wins: number;
  losses: number;
  totalEntries: number;
  currentBank: number;
  profit: number;
  dailyPercentage: number;
}

export interface SignalState {
  status: SystemStatus;
  targetColumn: number | null;
  activeTrigger: TriggerType;
  progressionStep: number; // 0 (none), 1, 2, 3, 4, 5
  isAwaitingResult: boolean;
  cooldownCounter: number; // 20 spins cooldown
}
