
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  SystemStatus, 
  TriggerType, 
  SpinResult, 
  BankConfig, 
  Statistics, 
  SignalState 
} from './types';
import { getColumn } from './constants';
import { audioService } from './services/audioService';
import { 
  Target, 
  Zap, 
  TrendingUp, 
  DollarSign, 
  History as HistoryIcon, 
  CheckCircle2,
  XCircle,
  Activity,
  Flame,
  LayoutGrid,
  Trophy,
  Clock,
  Timer,
  Wallet,
  Rocket,
  ShieldCheck,
  Star,
  BellRing,
  AlertTriangle,
  ShieldAlert,
  ZapOff,
  PauseCircle,
  PlayCircle,
  ShieldQuestion,
  Search,
  RefreshCw,
  ArrowRightLeft,
  ChevronRight
} from 'lucide-react';

// Extended Signal State for UI
interface ExtendedSignalState extends SignalState {
  confidence: number;
  showOverlay: boolean;
  lastSignalId: string | null;
  safetyScore: number;
  warningMessage: string | null;
  isPaused: boolean; 
  consecutiveMisses: number;
}

type ResultType = 'WIN' | 'LOSS' | null;

const App: React.FC = () => {
  // Session State
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [showResult, setShowResult] = useState<{ type: ResultType; value: number } | null>(null);

  // Management State
  const [bankInput, setBankInput] = useState<number>(100);
  const [riskTarget, setRiskTarget] = useState<number>(10);

  // App Logic State
  const [history, setHistory] = useState<SpinResult[]>([]);
  const [bankConfig, setBankConfig] = useState<BankConfig>({
    initialBank: 100,
    entryPercentage: 10,
    minToken: 0.50
  });
  const [stats, setStats] = useState<Statistics>({
    wins: 0, losses: 0, totalEntries: 0, currentBank: 100, profit: 0, dailyPercentage: 0
  });

  const [signal, setSignal] = useState<ExtendedSignalState>({
    status: SystemStatus.NO_SIGNAL,
    targetColumn: null,
    activeTrigger: TriggerType.NONE,
    progressionStep: 0,
    isAwaitingResult: false,
    cooldownCounter: 0,
    confidence: 0,
    showOverlay: false,
    lastSignalId: null,
    safetyScore: 100,
    warningMessage: null,
    isPaused: false,
    consecutiveMisses: 0
  });

  const [inputValue, setInputValue] = useState('');
  
  // Ref para controlar processamento de giros únicos para não validar vitória no mesmo giro do sinal
  const lastProcessedSpinRef = useRef<number>(-1);

  // Derived Values
  const unitValue = useMemo(() => {
    return Math.max(0.50, (bankInput * (riskTarget / 100)) / 20);
  }, [bankInput, riskTarget]);

  const progressionLevels = useMemo(() => [
    unitValue,
    unitValue,
    unitValue * 2,
    unitValue * 3,
    unitValue * 5
  ], [unitValue]);

  const maxLoss = useMemo(() => progressionLevels.reduce((a, b) => a + b, 0), [progressionLevels]);

  const handleStartSession = () => {
    setBankConfig({ initialBank: bankInput, entryPercentage: riskTarget, minToken: 0.50 });
    setStats({
      wins: 0, losses: 0, totalEntries: 0, currentBank: bankInput, profit: 0, dailyPercentage: 0
    });
    setIsSessionStarted(true);
  };

  const addNumber = useCallback((num: number) => {
    const newSpin: SpinResult = {
      number: num,
      column: getColumn(num),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    setHistory(prev => [newSpin, ...prev].slice(0, 1000));
  }, []);

  const pasteNumbers = useCallback(() => {
    const numbers = inputValue.split(/[,\s]+/)
      .map(n => parseInt(n.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n <= 36);
    if (numbers.length === 0) return;
    
    const newHistory = [...history];
    numbers.forEach(num => {
      const newSpin: SpinResult = {
        number: num,
        column: getColumn(num),
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
      newHistory.unshift(newSpin);
    });
    
    setHistory(newHistory.slice(0, 1000));
    setInputValue('');
  }, [inputValue, history]);

  const criteria = useMemo(() => {
    if (history.length < 10) return null;
    const window20 = history.slice(0, 20);
    const counts = [0, 0, 0, 0];
    window20.forEach(s => counts[s.column]++);
    
    let target = 1;
    if (counts[2] > counts[1] && counts[2] > counts[3]) target = 2;
    if (counts[3] > counts[1] && counts[3] > counts[2]) target = 3;

    const percentage = (counts[target] / Math.max(1, window20.length)) * 100;
    const last3 = history.slice(0, 3);
    const last5 = history.slice(0, 5);
    const last7 = history.slice(0, 7);

    // Bloqueios Lógicos
    const opponentStreak = last3.length === 3 && last3.every(s => s.column !== target && s.column !== 0 && s.column === last3[0].column);
    const exhaustion = last7.filter(s => s.column === target).length >= 5;
    const columnCold = last5.every(s => s.column !== target); 
    // Regra: Zero sair 1 vez em 5 giros (Bloqueio)
    const recentZero = last5.some(s => s.column === 0);

    return {
      target,
      dominance: percentage >= 35,
      pressure: last7.filter(s => s.column === target).length >= 4,
      continuity: history.slice(0, 4).filter(s => s.column === target).length >= 2,
      momentum: last3.filter(s => s.column === target).length >= 2,
      percentage,
      isOpponentStrong: opponentStreak,
      isExhausted: exhaustion,
      isCold: columnCold,
      isZeroRecent: recentZero
    };
  }, [history]);

  const getColPercentage = useCallback((col: number) => {
    if (history.length === 0) return 0;
    const window20 = history.slice(0, 20);
    const count = window20.filter(s => s.column === col).length;
    return (count / Math.max(1, window20.length)) * 100;
  }, [history]);

  // Motor de Inteligência Dinâmico
  useEffect(() => {
    if (history.length === 0 || !isSessionStarted) return;
    const latest = history[0];
    const spinId = history.length;

    // 1. GERENCIAMENTO DE RESULTADOS (Quando a aposta está CONFIRMADA)
    if (signal.isAwaitingResult && !signal.showOverlay) {
      if (spinId !== lastProcessedSpinRef.current) {
        lastProcessedSpinRef.current = spinId;
        
        if (latest.column === signal.targetColumn) {
          // VITÓRIA
          const spentInCycle = progressionLevels.slice(0, signal.progressionStep).reduce((a, b) => a + b, 0);
          const winAmount = (progressionLevels[signal.progressionStep - 1] * 3);
          const winProfit = winAmount - spentInCycle;
          
          setStats(prev => ({
            ...prev, wins: prev.wins + 1, totalEntries: prev.totalEntries + 1,
            currentBank: prev.currentBank + winProfit, profit: prev.profit + winProfit,
            dailyPercentage: ((prev.currentBank + winProfit - bankConfig.initialBank) / bankConfig.initialBank) * 100
          }));
          
          setSignal(prev => ({
            ...prev, isAwaitingResult: false, progressionStep: 0, status: SystemStatus.NO_SIGNAL,
            targetColumn: null, showOverlay: false, isPaused: false, consecutiveMisses: 0
          }));

          setShowResult({ type: 'WIN', value: winProfit });
          audioService.playWin();
          setTimeout(() => setShowResult(null), 3000);
          return;
        } else {
          // MISS (ERRO NO GIRO)
          const currentMisses = signal.consecutiveMisses + 1;
          
          if (signal.progressionStep < 5) {
            // Se houver bloqueio lógico ou perda de força durante a progressão, entra em modo Recovery
            const hasSafetyBlock = criteria && (criteria.isZeroRecent || criteria.isOpponentStrong || criteria.isCold || !criteria.dominance);
            
            if (hasSafetyBlock || currentMisses >= 2) {
              setSignal(prev => ({
                ...prev, isPaused: true, showOverlay: true, consecutiveMisses: currentMisses,
                safetyScore: 20, warningMessage: criteria?.isZeroRecent ? "FIREWALL: ZERO DETECTADO (1/5)" : "ALVO PERDEU DOMINÂNCIA. RECALIBRANDO..."
              }));
            } else {
              // AVANÇA NÍVEL NO MESMO ALVO
              setSignal(prev => ({
                ...prev, progressionStep: prev.progressionStep + 1, consecutiveMisses: currentMisses,
                isPaused: false, showOverlay: true, safetyScore: Math.max(10, 100 - (prev.progressionStep * 20)),
                warningMessage: null
              }));
              audioService.playObservation();
            }
          } else {
            // RED FINAL (STOP)
            setStats(prev => ({
              ...prev, losses: prev.losses + 1, totalEntries: prev.totalEntries + 1,
              currentBank: prev.currentBank - maxLoss, profit: prev.profit - maxLoss,
              dailyPercentage: ((prev.currentBank - maxLoss - bankConfig.initialBank) / bankConfig.initialBank) * 100
            }));
            setSignal(prev => ({ ...prev, isAwaitingResult: false, progressionStep: 0, showOverlay: false, isPaused: false }));
            setShowResult({ type: 'LOSS', value: maxLoss });
            audioService.playLoss();
            setTimeout(() => setShowResult(null), 3000);
          }
        }
      }
    }

    // 2. MONITORAMENTO EM TEMPO REAL DURANTE A "AGUARDANDO CONFIRMAÇÃO"
    if (signal.showOverlay && !signal.isPaused) {
       if (criteria) {
          // Bloqueio de Zero tem prioridade total
          if (criteria.isZeroRecent) {
             setSignal(prev => ({
                ...prev,
                isPaused: true,
                warningMessage: "FIREWALL: ZERO DETECTADO NO HISTÓRICO (1/5 GIROS)"
             }));
             return;
          }

          if (criteria.target !== signal.targetColumn || !criteria.dominance || !criteria.pressure || criteria.isOpponentStrong || criteria.isCold) {
             if (criteria.dominance && criteria.pressure && !criteria.isOpponentStrong && !criteria.isCold) {
                setSignal(prev => ({
                   ...prev,
                   targetColumn: criteria.target,
                   warningMessage: `MUDANÇA DE FLUXO: NOVO ALVO C${criteria.target}`,
                   confidence: 96
                }));
                audioService.playObservation();
             } else {
                setSignal(prev => ({
                   ...prev,
                   isPaused: true,
                   warningMessage: "AGUARDANDO GATILHO ESTÁVEL (FIREWALL ATIVO)..."
                }));
             }
          }
       }
    }

    // 3. ATUALIZAÇÃO DO MODO BUSCA (RECOVERY)
    if (signal.isPaused && signal.showOverlay) {
       if (criteria && criteria.dominance && criteria.pressure && !criteria.isCold && !criteria.isZeroRecent && !criteria.isOpponentStrong) {
          setSignal(prev => ({
             ...prev,
             targetColumn: criteria.target,
             isPaused: false,
             warningMessage: `ALVO ENCONTRADO EM C${criteria.target}!`,
             confidence: 92,
             safetyScore: 100
          }));
          audioService.playObservation();
       }
    }

    // 4. INÍCIO DE NOVO CICLO (SCANNER LIMPO)
    if (!signal.isAwaitingResult && !signal.showOverlay && criteria) {
      // Bloqueio total se houver Zero ou Pressão Oposta
      const canSignal = criteria.dominance && criteria.pressure && !criteria.isCold && !criteria.isZeroRecent && !criteria.isOpponentStrong;
      
      if (canSignal) {
        setSignal(prev => ({
          ...prev, status: SystemStatus.AUTHORIZED, targetColumn: criteria.target,
          progressionStep: 1, isAwaitingResult: true, showOverlay: true, confidence: 98,
          isPaused: false, consecutiveMisses: 0, safetyScore: 100, warningMessage: null
        }));
        audioService.playObservation();
        lastProcessedSpinRef.current = history.length;
      } else {
        setSignal(prev => ({ ...prev, status: SystemStatus.OBSERVATION }));
      }
    }
  }, [history, isSessionStarted, criteria, signal.showOverlay, signal.isAwaitingResult, signal.isPaused]);

  if (!isSessionStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#06090f]">
        <div className="bg-[#0f1624] w-full max-w-md rounded-[40px] p-10 border border-[#1e293b] shadow-2xl">
          <div className="flex flex-col items-center text-center">
             <div className="w-20 h-20 bg-[#1a4431] rounded-[30px] flex items-center justify-center mb-6 shadow-neon-green">
                <ShieldCheck className="text-[#00ff88]" size={40} />
             </div>
             <h1 className="text-3xl font-black text-white mb-2 italic">Sniper <span className="text-sky-400">Recovery 2.8</span></h1>
             <p className="text-slate-400 text-sm mb-10 leading-relaxed uppercase tracking-widest font-black text-[9px] opacity-60">IA Antirred v5.4 - Zero Block</p>
             <div className="w-full space-y-8">
                <div className="bg-[#06090f] border border-[#1e293b] rounded-3xl p-6">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">Banca Inicial (R$)</label>
                   <input type="number" value={bankInput} onChange={(e) => setBankInput(Number(e.target.value))} className="w-full bg-transparent border-none text-center text-white font-black text-4xl outline-none" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                   {[5, 10, 15, 20].map(p => (
                     <button key={p} onClick={() => setRiskTarget(p)} className={`py-4 rounded-2xl font-black text-xs border ${riskTarget === p ? 'bg-sky-500 border-sky-400 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)]' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>{p}%</button>
                   ))}
                </div>
                <button onClick={handleStartSession} className="w-full bg-[#00ff88] hover:bg-[#00cc6e] text-slate-950 py-5 rounded-2xl font-black text-lg transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3">
                   <Rocket size={20} /> Iniciar Firewall Sniper
                </button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center max-w-[1400px] mx-auto overflow-x-hidden relative pb-10">
      
      {/* RESULT OVERLAY (WIN/LOSS) */}
      {showResult && (
        <div className={`fixed inset-0 z-[300] flex flex-col items-center justify-center p-4 backdrop-blur-2xl animate-in fade-in duration-500 ${showResult.type === 'WIN' ? 'bg-emerald-950/80' : 'bg-red-950/80'}`}>
          <div className={`relative flex flex-col items-center justify-center rounded-[60px] p-16 shadow-2xl border-4 scale-up-animation ${showResult.type === 'WIN' ? 'bg-[#0a2318] border-emerald-500 shadow-emerald-500/40' : 'bg-[#230a0a] border-red-500 shadow-red-500/40'}`}>
            <div className={`mb-10 w-36 h-36 rounded-full flex items-center justify-center ${showResult.type === 'WIN' ? 'bg-emerald-500 text-slate-950 shadow-[0_0_60px_#10b981]' : 'bg-red-500 text-white shadow-[0_0_60px_#ef4444]'}`}>
              {showResult.type === 'WIN' ? <Trophy size={80} /> : <XCircle size={80} />}
            </div>
            <h1 className={`text-8xl font-black uppercase tracking-tighter mb-4 italic ${showResult.type === 'WIN' ? 'text-emerald-400' : 'text-red-400'}`}>
              {showResult.type === 'WIN' ? 'VITÓRIA!' : 'DERROTA'}
            </h1>
            <div className={`px-14 py-6 rounded-full text-5xl font-black shadow-2xl ${showResult.type === 'WIN' ? 'bg-emerald-500 text-slate-950' : 'bg-red-500 text-white'}`}>
              {showResult.type === 'WIN' ? '+' : '-'} R$ {showResult.value.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="w-full flex items-center justify-between mb-8 gap-4 px-2 mt-4">
        <div className="flex items-center gap-3">
           <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 shadow-inner"><Activity className="text-sky-500" size={24} /></div>
           <div><h4 className="text-white font-black text-base uppercase tracking-tighter">Sniper Recovery</h4><p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">v5.4 FIREWALL LIVE</p></div>
        </div>
        <div className={`px-12 py-3.5 rounded-[22px] font-black text-xs border shadow-2xl transition-all duration-700 flex items-center gap-4 ${
          signal.isPaused || criteria?.isZeroRecent ? 'bg-amber-500/10 border-amber-500 text-amber-500' :
          signal.status === SystemStatus.AUTHORIZED ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' :
          'bg-slate-900 border-slate-800 text-slate-600'
        }`}>
           <div className={`w-3 h-3 rounded-full ${signal.isPaused || criteria?.isZeroRecent ? 'bg-amber-500 animate-pulse' : signal.status === SystemStatus.AUTHORIZED ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
           {criteria?.isZeroRecent ? 'BLOQUEIO: ZERO DETECTADO' : signal.isPaused ? 'MODO RECOVERY: BUSCANDO ALVO' : signal.status}
        </div>
        <div className="flex items-center gap-4 bg-slate-900/50 p-2 pr-6 rounded-2xl border border-slate-800">
           <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20"><Wallet className="text-emerald-400" size={24} /></div>
           <div><p className="text-[10px] text-slate-500 font-black uppercase">Banca</p><p className="text-xl font-black text-white">R$ {stats.currentBank.toFixed(2)}</p></div>
        </div>
      </div>

      {/* DASHBOARD CARDS */}
      <div className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <StatusCard label="Alvo Atual" value={signal.targetColumn ? `COLUNA ${signal.targetColumn}` : '--'} icon={<Target size={14}/>} valueColor={signal.isPaused ? "text-amber-500" : "text-sky-400"} />
        <StatusCard label="Progresso" value={signal.progressionStep > 0 ? `NÍVEL ${signal.progressionStep}` : '---'} icon={<TrendingUp size={14}/>} valueColor={signal.progressionStep > 0 && !signal.isPaused ? 'animate-blink text-white' : 'text-slate-600'} />
        <StatusCard label="Valor Bet" value={`R$ ${signal.progressionStep > 0 ? progressionLevels[signal.progressionStep-1].toFixed(2) : '0.00'}`} icon={<DollarSign size={14}/>} />
        <StatusCard label="Gatilho" value={signal.activeTrigger || 'Análise...'} icon={<Zap size={14}/>} valueColor="text-yellow-400" />
        <StatusCard label="Firewall" value={`${signal.safetyScore}%`} icon={<ShieldCheck size={14}/>} valueColor={signal.safetyScore > 70 ? "text-emerald-400" : "text-amber-500"} />
        <StatusCard label="Lucro P/L" value={`R$ ${stats.profit.toFixed(2)}`} icon={<TrendingUp size={14}/>} valueColor={stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      </div>

      {/* OPERATION OVERLAY (INTEGRATED & REACTIVE) */}
      {signal.showOverlay && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-3xl p-4 animate-in fade-in zoom-in duration-300">
           <div className={`border-[4px] rounded-[60px] p-10 max-w-4xl w-full relative grid grid-cols-1 lg:grid-cols-2 gap-10 overflow-hidden transition-all duration-700 shadow-[0_0_100px_rgba(0,0,0,0.8)] ${signal.isPaused ? 'bg-[#1a140a] border-amber-500/30' : 'bg-[#061610] border-emerald-500/30'}`}>
              
              <div className="flex flex-col items-center text-center justify-center border-b lg:border-b-0 lg:border-r border-slate-800/50 pb-10 lg:pb-0 lg:pr-10">
                 <div className="flex items-center gap-6 mb-8">
                    <div className={`p-6 rounded-[35px] shadow-2xl transition-all ${signal.isPaused ? 'bg-amber-500 text-slate-900' : 'bg-emerald-500 text-slate-950'}`}>
                       {signal.isPaused ? <RefreshCw className="animate-spin" size={40} /> : <PlayCircle size={40} />}
                    </div>
                    <div className="text-left">
                       <h2 className={`text-5xl font-black uppercase tracking-tighter italic ${signal.isPaused ? 'text-amber-500' : 'text-white'}`}>
                         {signal.isPaused ? 'Recovery' : `Sniper N${signal.progressionStep}`}
                       </h2>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{signal.isPaused ? 'Firewall: Proteção Ativa' : 'Confirmado: Gatilho Sniper'}</p>
                    </div>
                 </div>

                 {signal.warningMessage && (
                   <div className={`w-full border-2 rounded-3xl p-5 mb-8 flex items-center gap-5 animate-pulse ${signal.isPaused ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                      <AlertTriangle className={signal.isPaused ? 'text-amber-500' : 'text-emerald-500'} size={32} />
                      <span className={`text-xs font-black uppercase leading-tight ${signal.isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>{signal.warningMessage}</span>
                   </div>
                 )}

                 <div className="flex flex-col mb-10 transition-all duration-500 transform scale-100 hover:scale-110">
                    <span className="text-slate-600 text-xs font-black uppercase tracking-[0.5em] mb-4">Coluna</span>
                    <h1 className="text-[12rem] font-black text-white uppercase tracking-tighter leading-none animate-in slide-in-from-top-4 duration-300">{signal.isPaused ? '--' : `C${signal.targetColumn}`}</h1>
                 </div>

                 <div className="grid grid-cols-2 gap-6 w-full mb-10">
                    <div className="bg-black/50 border border-slate-800 rounded-[35px] p-8 flex flex-col items-center">
                       <p className="text-[10px] text-slate-500 font-black uppercase mb-2">Aposta (R$)</p>
                       <p className="text-4xl font-black text-white">{progressionLevels[signal.progressionStep-1]?.toFixed(2)}</p>
                    </div>
                    <div className="bg-black/50 border border-slate-800 rounded-[35px] p-8 flex flex-col items-center">
                       <p className="text-[10px] text-slate-500 font-black uppercase mb-2">Progresso</p>
                       <p className="text-4xl font-black text-emerald-400">N{signal.progressionStep}</p>
                    </div>
                 </div>

                 {!signal.isPaused ? (
                   <button 
                    onClick={() => {
                      setSignal(prev => ({ ...prev, showOverlay: false }));
                      lastProcessedSpinRef.current = history.length;
                    }} 
                    className="w-full py-8 rounded-[35px] font-black text-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-[0_20px_50px_rgba(16,185,129,0.4)] uppercase tracking-tighter"
                   >
                      CONFIRMAR ENTRADA
                   </button>
                 ) : (
                   <div className="w-full bg-slate-900/60 border-2 border-slate-800 py-8 rounded-[35px] flex items-center justify-center gap-6 text-slate-400">
                      <Clock size={32} className="animate-spin text-amber-500" />
                      <span className="text-xl font-black uppercase tracking-tighter">Buscando Nova Brecha...</span>
                   </div>
                 )}
              </div>

              <div className="flex flex-col">
                 <div className="flex items-center justify-between mb-8">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                       <Search size={20} className="text-sky-500" /> Scanner Biométrico Ativo
                    </h4>
                    <span className="text-[10px] font-black text-slate-600 uppercase animate-pulse">Atualizando em tempo real...</span>
                 </div>

                 <div className="grid grid-cols-5 gap-2.5 mb-10">
                    {[0, ...Array.from({length: 36}, (_, i) => i + 1)].map(n => (
                      <button key={n} onClick={() => addNumber(n)} className={`aspect-square text-[10px] font-black rounded-xl border-2 transition-all flex items-center justify-center ${n === 0 ? 'bg-emerald-600 border-emerald-400 text-white' : [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n) ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-900 border-slate-800 text-white'} hover:scale-110 active:scale-95`}>{n}</button>
                    ))}
                 </div>

                 <div className="bg-black/40 rounded-[40px] p-8 border border-slate-800/50">
                    <div className="grid grid-cols-3 gap-6">
                       {[1, 2, 3].map(col => (
                         <div key={col} className="flex flex-col items-center">
                            <div className="w-full h-24 bg-slate-950/80 rounded-full overflow-hidden flex flex-col justify-end p-1 border border-slate-800/50">
                               <div className={`w-full rounded-full transition-all duration-1000 ${col === signal.targetColumn ? (signal.isPaused ? 'bg-amber-500' : 'bg-sky-500 shadow-[0_0_15px_#0ea5e9]') : 'bg-slate-800'}`} style={{height: `${getColPercentage(col)}%`}} />
                            </div>
                            <span className="text-sm font-black text-white mt-4 font-mono">{getColPercentage(col).toFixed(0)}%</span>
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1">Coluna {col}</span>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MAIN UI PANELS */}
      <div className={`w-full grid grid-cols-1 lg:grid-cols-12 gap-8 ${signal.showOverlay ? 'opacity-20 pointer-events-none blur-md' : ''} transition-all duration-500`}>
         
         {/* REGISTRATION PANEL */}
         <div className="lg:col-span-4 space-y-8">
            <section className="bg-card border border-accent rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-5"><LayoutGrid size={80} /></div>
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3"><LayoutGrid size={20} className="text-sky-500" /> Registrar Giros</h3>
               <div className="grid grid-cols-10 gap-2.5 mb-8">
                  {[0, ...Array.from({length: 36}, (_, i) => i + 1)].map(n => (
                    <button key={n} onClick={() => addNumber(n)} className={`aspect-square text-[10px] font-black rounded-xl border-2 transition-all flex items-center justify-center ${n === 0 ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-slate-800 text-white'} hover:border-sky-500`}>{n}</button>
                  ))}
               </div>
               <div className="flex gap-3">
                  <input className="flex-1 bg-slate-950 border-2 border-slate-800 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-sky-500 transition-all font-bold" placeholder="Ex: 1, 32, 14, 0..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pasteNumbers()}/>
                  <button onClick={pasteNumbers} className="bg-sky-600 hover:bg-sky-500 px-8 rounded-2xl text-xs font-black transition-colors uppercase text-white shadow-xl">Analisar</button>
               </div>
            </section>

            <section className="bg-card border border-accent rounded-[40px] p-8 shadow-2xl">
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-3 mb-6"><HistoryIcon size={20} className="text-sky-500" /> Fluxo de Mesa</h3>
               <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scroll">
                  {history.slice(0, 10).map((spin, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-slate-800/40">
                       <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border-2 ${spin.number === 0 ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-slate-700 text-white'}`}>{spin.number}</span>
                       <span className="text-[11px] font-black text-sky-400 uppercase font-mono tracking-tighter">C{spin.column}</span>
                       <span className="text-[9px] text-slate-600 font-mono">{spin.timestamp}</span>
                    </div>
                  ))}
               </div>
            </section>
         </div>

         {/* SCANNER AND RESULTS */}
         <div className="lg:col-span-5 space-y-8">
            <section className="bg-card border border-accent rounded-[40px] p-8 shadow-2xl">
               <div className="flex justify-between items-center mb-10">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-3"><ShieldCheck size={20} className="text-emerald-500" /> Scanner Biométrico da Mesa</h4>
               </div>
               <div className="grid grid-cols-3 gap-8">
                  {[1, 2, 3].map(col => (
                    <div key={col} className={`bg-black/30 rounded-[35px] p-6 border-2 transition-all duration-700 ${signal.targetColumn === col ? 'border-sky-500/50 bg-sky-500/5 shadow-inner' : 'border-slate-800/50'}`}>
                       <p className="text-[11px] font-black text-slate-500 uppercase mb-6 text-center">Coluna {col}</p>
                       <div className="flex items-end gap-2.5 h-24 mb-6">
                          {Array.from({length: 8}).map((_, i) => (
                            <div key={i} className={`flex-1 rounded-full transition-all duration-1000 ${getColPercentage(col) > (i * 12.5) ? (col === 1 ? 'bg-sky-500' : col === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-800/20'}`} style={{height: `${Math.min(100, (i + 1) * 12.5)}%`}} />
                          ))}
                       </div>
                       <p className="text-3xl font-black text-white font-mono text-center">{getColPercentage(col).toFixed(0)}%</p>
                    </div>
                  ))}
               </div>
            </section>

            <section className="bg-card border border-accent rounded-[40px] p-10 shadow-2xl">
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-10 flex items-center gap-4"><Trophy className="text-emerald-500" size={24} /> Performance Estratégica</h3>
               <div className="grid grid-cols-2 gap-6">
                  <ResultStat label="Saldo Atual" value={`R$ ${stats.currentBank.toFixed(2)}`} />
                  <ResultStat label="Lucro P/L" value={`R$ ${stats.profit.toFixed(2)}`} isPositive={stats.profit >= 0} />
                  <ResultStat label="Taxa de Green" value={`${stats.totalEntries > 0 ? ((stats.wins / stats.totalEntries) * 100).toFixed(0) : '0'}%`} isPositive />
                  <ResultStat label="Operações" value={stats.totalEntries} />
               </div>
               <div className="mt-12 pt-10 border-t border-slate-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-600 font-black uppercase mb-3 tracking-widest block">Consistência Histórica</span>
                    <div className="flex gap-2.5 h-12 items-end">
                       {Array.from({length: 15}).map((_, i) => (
                         <div key={i} className={`flex-1 rounded-sm transition-all duration-1000 ${i < (stats.wins / Math.max(1, stats.totalEntries) * 15) ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-slate-800'}`} style={{height: `${40 + (i * 4)}%`}} />
                       ))}
                    </div>
                  </div>
                  <div className="text-right"><p className="text-5xl font-black text-white italic tracking-tighter">SNIPER <span className="text-sky-500">PRO</span></p></div>
               </div>
            </section>
         </div>

         {/* CHECKLIST SIDEBAR */}
         <div className="lg:col-span-3 space-y-8">
            <section className="bg-card border border-accent rounded-[40px] p-10 h-full flex flex-col shadow-2xl relative overflow-hidden">
               <div className="absolute -top-10 -right-10 w-40 h-40 bg-sky-500/10 blur-[100px]" />
               
               <div className="mb-12">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-4 mb-6"><ShieldCheck size={24} className="text-emerald-500" /> Firewall Antirred</h3>
                  <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 shadow-inner">
                     <div className="h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_20px_#10b981]" style={{width: `${signal.safetyScore}%`}} />
                  </div>
               </div>

               <div className="space-y-8 flex-1">
                  <div className="space-y-5">
                     <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-4"><ShieldCheck size={16} /> Sensores da Mesa</p>
                     <CheckItem label="Fluxo de Coluna" active={!criteria?.isCold} safety />
                     <CheckItem label="Fadiga de Coluna" active={!criteria?.isExhausted} safety />
                     <CheckItem label="Zona de Seq. Oposta" active={!criteria?.isOpponentStrong} safety />
                     {/* Regra: Zero sair 1 vez em 5 giros */}
                     <CheckItem label="Mesa Limpa (Zero 1/5)" active={!criteria?.isZeroRecent} safety />
                  </div>
                  <div className="space-y-5">
                     <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] flex items-center gap-4"><Zap size={16} /> Gatilhos Sniper</p>
                     <CheckItem label="Dominância > 35%" active={!!criteria?.dominance} />
                     <CheckItem label="Gatilho de Pressão" active={!!criteria?.pressure} />
                     <CheckItem label="Assertividade IA" active={signal.confidence > 80} />
                  </div>
               </div>

               <div className="mt-12 pt-10 border-t border-slate-800">
                  {signal.isPaused || criteria?.isZeroRecent ? (
                     <div className="bg-amber-500/10 border-2 border-amber-500/20 p-6 rounded-[30px] mb-8 flex items-start gap-5">
                        <ArrowRightLeft size={30} className="text-amber-500 mt-1 animate-pulse" />
                        <div className="flex flex-col">
                           <span className="text-[11px] font-black text-amber-500 uppercase mb-2 tracking-widest italic">{criteria?.isZeroRecent ? 'Bloqueio de Zero' : 'Troca de Alvo'}</span>
                           <span className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">{criteria?.isZeroRecent ? 'Firewall bloqueou novas entradas por detecção de Zero recente.' : `Sinal Instável. Aguardando nova coluna para N${signal.progressionStep}.`}</span>
                        </div>
                     </div>
                  ) : (
                     <div className="bg-emerald-500/5 border-2 border-emerald-500/10 p-6 rounded-[30px] mb-8 flex items-start gap-5">
                        <CheckCircle2 size={30} className="text-emerald-500 mt-1" />
                        <div className="flex flex-col">
                           <span className="text-[11px] font-black text-emerald-400 uppercase mb-2 tracking-widest italic">Análise Estável</span>
                           <span className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">Padrão de assertividade IA confirmado pelo Firewall.</span>
                        </div>
                     </div>
                  )}
                  <div className={`w-full py-7 rounded-[35px] font-black text-center text-sm transition-all border-2 shadow-2xl ${criteria?.isZeroRecent || signal.isPaused ? 'bg-amber-500 text-slate-950 border-amber-400' : signal.isAwaitingResult ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>
                     {criteria?.isZeroRecent ? 'BLOQUEIO POR ZERO' : signal.isPaused ? 'SCANNER EM RECOVERY' : signal.isAwaitingResult ? 'OPERANDO NÍVEL ' + signal.progressionStep : 'AGUARDANDO GATILHO'}
                  </div>
               </div>
            </section>
         </div>
      </div>
    </div>
  );
};

const StatusCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; valueColor?: string }> = ({ label, value, icon, valueColor = 'text-white' }) => (
  <div className="bg-card border border-accent p-6 rounded-[35px] flex flex-col justify-between shadow-2xl h-36 hover:border-slate-600 transition-all group relative overflow-hidden">
    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-[50px] -z-10" />
    <div className="flex items-center gap-3 text-slate-500 group-hover:text-slate-400 transition-colors">
      {icon}
      <span className="text-[11px] font-black uppercase tracking-[0.2em]">{label}</span>
    </div>
    <div className={`text-3xl font-black truncate leading-none tracking-tighter ${valueColor}`}>
      {value}
    </div>
  </div>
);

const CheckItem: React.FC<{ label: string; active: boolean; safety?: boolean }> = ({ label, active, safety }) => (
  <div className={`flex items-center justify-between transition-all p-4 rounded-2xl border-2 ${active ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400 shadow-inner' : 'border-transparent text-slate-700'}`}>
     <div className="flex items-center gap-5">
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center border-2 transition-all ${active ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-transparent border-slate-800'}`}>
           {active && <CheckCircle2 size={16} className="text-slate-950 stroke-[3px]" />}
        </div>
        <span className="text-xs font-black tracking-tight uppercase">{label}</span>
     </div>
     {safety && active && <div className="px-3 py-1 rounded-lg text-[9px] font-black bg-emerald-500/20 text-emerald-400 uppercase tracking-tighter">OK</div>}
     {safety && !active && <div className="px-3 py-1 rounded-lg text-[9px] font-black bg-red-500/10 text-red-500/40 uppercase tracking-tighter">WAIT</div>}
  </div>
);

const ResultStat: React.FC<{ label: string; value: string | number; isPositive?: boolean }> = ({ label, value, isPositive }) => (
  <div className="bg-black/30 rounded-[30px] p-6 border-2 border-slate-800/40 hover:border-slate-700 transition-colors shadow-inner">
     <p className="text-[10px] text-slate-600 font-black uppercase mb-3 tracking-widest">{label}</p>
     <p className={`text-2xl font-black ${isPositive === undefined ? 'text-white' : isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{value}</p>
  </div>
);

export default App;
