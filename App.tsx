
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  SystemStatus, 
  TriggerType, 
  SpinResult, 
  BankConfig, 
  Statistics, 
  SignalState 
} from './types.ts';
import { getColumn } from './constants.ts';
import { audioService } from './services/audioService.ts';
import { 
  Target, 
  Zap, 
  TrendingUp, 
  DollarSign, 
  History as HistoryIcon, 
  CheckCircle2,
  XCircle,
  Activity,
  LayoutGrid,
  Trophy,
  Clock,
  Wallet,
  Rocket,
  ShieldCheck,
  Search,
  RefreshCw,
  ArrowRightLeft,
  PlayCircle,
  AlertTriangle,
  Trash2,
  RotateCcw
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
  
  const lastProcessedSpinRef = useRef<number>(-1);

  const unitValue = useMemo(() => {
    return Math.max(0.50, (bankInput * (riskTarget / 100)) / 24);
  }, [bankInput, riskTarget]);

  const progressionLevels = useMemo(() => [
    unitValue,
    unitValue * 2,
    unitValue * 3,
    unitValue * 6,
    unitValue * 12
  ], [unitValue]);

  const maxLoss = useMemo(() => progressionLevels.reduce((a, b) => a + b, 0), [progressionLevels]);

  const handleStartSession = () => {
    setBankConfig({ initialBank: bankInput, entryPercentage: riskTarget, minToken: 0.50 });
    setStats({
      wins: 0, losses: 0, totalEntries: 0, currentBank: bankInput, profit: 0, dailyPercentage: 0
    });
    setIsSessionStarted(true);
  };

  const handleResetSession = () => {
    if (confirm("Deseja realmente resetar toda a sessão? Isso limpará o histórico e voltará para a tela inicial.")) {
      setIsSessionStarted(false);
      setHistory([]);
      setStats({
        wins: 0, losses: 0, totalEntries: 0, currentBank: bankInput, profit: 0, dailyPercentage: 0
      });
      setSignal({
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
      lastProcessedSpinRef.current = -1;
    }
  };

  const addNumber = useCallback((num: number) => {
    const newSpin: SpinResult = {
      number: num,
      column: getColumn(num),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    setHistory(prev => [newSpin, ...prev].slice(0, 1000));
  }, []);

  const deleteLastNumber = () => {
    setHistory(prev => prev.slice(1));
  };

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
    if (history.length < 5) return null;
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

    const opponentStreak = last3.length === 3 && last3.every(s => s.column !== target && s.column !== 0 && s.column === last3[0].column);
    const exhaustion = last7.filter(s => s.column === target).length >= 5;
    const recentZero = last5.some(s => s.column === 0);

    return {
      target,
      dominance: percentage >= 35,
      pressure: last7.filter(s => s.column === target).length >= 4,
      percentage,
      isOpponentStrong: opponentStreak,
      isExhausted: exhaustion,
      isZeroRecent: recentZero
    };
  }, [history]);

  const getColPercentage = useCallback((col: number) => {
    if (history.length === 0) return 0;
    const window20 = history.slice(0, 20);
    const count = window20.filter(s => s.column === col).length;
    return (count / Math.max(1, window20.length)) * 100;
  }, [history]);

  useEffect(() => {
    if (history.length === 0 || !isSessionStarted) return;
    const latest = history[0];
    const spinId = history.length;

    if (signal.isAwaitingResult && !signal.showOverlay) {
      if (spinId !== lastProcessedSpinRef.current) {
        lastProcessedSpinRef.current = spinId;
        
        if (latest.column === signal.targetColumn) {
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
          const currentMisses = signal.consecutiveMisses + 1;
          
          if (signal.progressionStep < 5) {
            const criticalBlock = criteria && (criteria.isZeroRecent || criteria.isOpponentStrong);
            
            if (criticalBlock) {
              setSignal(prev => ({
                ...prev, isPaused: true, showOverlay: true, consecutiveMisses: currentMisses,
                safetyScore: 20, warningMessage: criteria?.isZeroRecent ? "FIREWALL: ZERO DETECTADO. AGUARDE SCANNER." : "PRESSÃO OPONENTE ALTA. RECALIBRANDO..."
              }));
            } else {
              setSignal(prev => ({
                ...prev, progressionStep: prev.progressionStep + 1, consecutiveMisses: currentMisses,
                isPaused: false, showOverlay: true, safetyScore: Math.max(10, 100 - (prev.progressionStep * 15)),
                warningMessage: null
              }));
              audioService.playObservation();
            }
          } else {
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

    if (signal.showOverlay && !signal.isPaused) {
       if (criteria) {
          if (criteria.isZeroRecent) {
             setSignal(prev => ({ ...prev, isPaused: true, warningMessage: "BLOQUEIO: ZERO DETECTADO NO HISTÓRICO" }));
             return;
          }
          if (criteria.target !== signal.targetColumn && criteria.dominance && criteria.pressure) {
             setSignal(prev => ({ ...prev, targetColumn: criteria.target, warningMessage: `FLUXO ALTERADO: NOVO ALVO C${criteria.target}` }));
          }
       }
    }

    if (signal.isPaused && signal.showOverlay) {
       if (criteria && !criteria.isZeroRecent && !criteria.isOpponentStrong && criteria.dominance) {
          setSignal(prev => ({
             ...prev,
             targetColumn: criteria.target,
             isPaused: false,
             warningMessage: `SINAL REESTABELECIDO EM C${criteria.target}`,
             safetyScore: 90
          }));
          audioService.playObservation();
       }
    }

    if (!signal.isAwaitingResult && !signal.showOverlay && criteria) {
      const canSignal = criteria.dominance && criteria.pressure && !criteria.isZeroRecent && !criteria.isOpponentStrong;
      
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
  }, [history, isSessionStarted, criteria, signal.showOverlay, signal.isAwaitingResult, signal.isPaused, progressionLevels, maxLoss, bankConfig.initialBank]);

  if (!isSessionStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-card w-full max-w-md rounded-[40px] p-10 border border-accent shadow-2xl relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-60 h-60 bg-emerald-500/10 blur-[100px]" />
          <div className="flex flex-col items-center text-center relative z-10">
             <div className="w-20 h-20 bg-emerald-500/20 rounded-[30px] flex items-center justify-center mb-6 border border-emerald-500/30 shadow-neon-green">
                <ShieldCheck className="text-emerald-400" size={40} />
             </div>
             <h1 className="text-2xl font-black text-white mb-2 italic leading-tight uppercase tracking-tighter">MelloBetas <span className="text-sky-400">Analise 3,0</span></h1>
             <p className="text-slate-400 text-sm mb-10 leading-relaxed uppercase tracking-widest font-black text-[9px] opacity-60">Professional Roulette AI Engine</p>
             <div className="w-full space-y-8">
                <div className="bg-black/40 border border-accent rounded-3xl p-6">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">Banca Inicial (R$)</label>
                   <input type="number" value={bankInput} onChange={(e) => setBankInput(Number(e.target.value))} className="w-full bg-transparent border-none text-center text-white font-black text-4xl outline-none" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                   {[5, 10, 15, 20].map(p => (
                     <button key={p} onClick={() => setRiskTarget(p)} className={`py-4 rounded-2xl font-black text-xs border transition-all ${riskTarget === p ? 'bg-sky-500 border-sky-400 text-white shadow-neon-sky' : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-600'}`}>{p}%</button>
                   ))}
                </div>
                <div className="bg-sky-500/5 p-4 rounded-2xl border border-sky-500/20">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Unidade Estimada</p>
                  <p className="text-white font-black text-lg">R$ {unitValue.toFixed(2)}</p>
                </div>
                <button onClick={handleStartSession} className="w-full bg-neon-green hover:bg-emerald-400 text-slate-950 py-5 rounded-2xl font-black text-lg transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3">
                   <Rocket size={20} /> Ativar MelloBetas PRO
                </button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center max-w-[1400px] mx-auto overflow-x-hidden relative pb-10">
      
      {showResult && (
        <div className={`fixed inset-0 z-[300] flex flex-col items-center justify-center p-4 backdrop-blur-2xl animate-in fade-in duration-500 ${showResult.type === 'WIN' ? 'bg-emerald-950/80' : 'bg-red-950/80'}`}>
          <div className={`relative flex flex-col items-center justify-center rounded-[60px] p-16 shadow-2xl border-4 scale-up-animation ${showResult.type === 'WIN' ? 'bg-[#0a2318] border-emerald-500 shadow-emerald-500/40' : 'bg-[#230a0a] border-red-500 shadow-red-500/40'}`}>
            <div className={`mb-10 w-36 h-36 rounded-full flex items-center justify-center ${showResult.type === 'WIN' ? 'bg-emerald-500 text-slate-950 shadow-[0_0_60px_#10b981]' : 'bg-red-500 text-white shadow-[0_0_60px_#ef4444]'}`}>
              {showResult.type === 'WIN' ? <Trophy size={80} /> : <XCircle size={80} />}
            </div>
            <h1 className={`text-7xl font-black uppercase tracking-tighter mb-4 italic ${showResult.type === 'WIN' ? 'text-emerald-400' : 'text-red-400'}`}>
              {showResult.type === 'WIN' ? 'VITÓRIA!' : 'DERROTA'}
            </h1>
            <div className={`px-14 py-6 rounded-full text-5xl font-black shadow-2xl ${showResult.type === 'WIN' ? 'bg-emerald-500 text-slate-950' : 'bg-red-500 text-white'}`}>
              {showResult.type === 'WIN' ? '+' : '-'} R$ {showResult.value.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <div className="w-full flex items-center justify-between mb-8 gap-4 px-2 mt-4 bg-card p-4 rounded-[30px] border border-accent">
        <div className="flex items-center gap-3">
           <div className="w-12 h-12 bg-sky-500/10 rounded-2xl flex items-center justify-center border border-sky-500/20 shadow-inner"><Activity className="text-sky-500" size={24} /></div>
           <div><h4 className="text-white font-black text-base uppercase tracking-tighter leading-none">MelloBetas</h4><p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-1 opacity-60">v3.0 COLUNA UNICA</p></div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`px-8 py-3.5 rounded-[22px] font-black text-xs border shadow-2xl transition-all duration-700 flex items-center gap-4 ${
            signal.isPaused || criteria?.isZeroRecent ? 'bg-amber-500/10 border-amber-500 text-amber-500' :
            signal.status === SystemStatus.AUTHORIZED ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' :
            'bg-black/40 border-slate-800 text-slate-600'
          }`}>
            <div className={`w-3 h-3 rounded-full ${signal.isPaused || criteria?.isZeroRecent ? 'bg-amber-500 animate-pulse' : signal.status === SystemStatus.AUTHORIZED ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
            {criteria?.isZeroRecent ? 'BLOQUEIO: ZERO' : signal.isPaused ? 'RECOVERY' : signal.status}
          </div>
          
          <button onClick={handleResetSession} className="w-12 h-12 bg-red-500/10 hover:bg-red-500 hover:text-white transition-all rounded-2xl flex items-center justify-center border border-red-500/20 text-red-500 shadow-lg group">
            <RotateCcw size={20} className="group-active:rotate-180 transition-transform" />
          </button>
        </div>

        <div className="flex items-center gap-4 bg-emerald-500/5 p-2 pr-6 rounded-2xl border border-emerald-500/10">
           <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20"><Wallet className="text-emerald-400" size={24} /></div>
           <div><p className="text-[10px] text-slate-500 font-black uppercase leading-none mb-1">Banca</p><p className="text-xl font-black text-white">R$ {stats.currentBank.toFixed(2)}</p></div>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <StatusCard label="Alvo Atual" value={signal.targetColumn ? `COLUNA ${signal.targetColumn}` : '--'} icon={<Target size={14}/>} valueColor={signal.isPaused ? "text-amber-500" : "text-sky-400"} />
        <StatusCard label="Progresso" value={signal.progressionStep > 0 ? `NÍVEL ${signal.progressionStep}` : '---'} icon={<TrendingUp size={14}/>} valueColor={signal.progressionStep > 0 && !signal.isPaused ? 'animate-blink text-white' : 'text-slate-600'} />
        <StatusCard label="Aposta" value={`R$ ${signal.progressionStep > 0 ? progressionLevels[signal.progressionStep-1].toFixed(2) : '0.00'}`} icon={<DollarSign size={14}/>} />
        <StatusCard label="Gatilho" value={signal.activeTrigger || 'Scanner...'} icon={<Zap size={14}/>} valueColor="text-yellow-400" />
        <StatusCard label="Firewall" value={`${signal.safetyScore}%`} icon={<ShieldCheck size={14}/>} valueColor={signal.safetyScore > 70 ? "text-emerald-400" : "text-amber-500"} />
        <StatusCard label="Lucro Líquido" value={`R$ ${stats.profit.toFixed(2)}`} icon={<TrendingUp size={14}/>} valueColor={stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      </div>

      {signal.showOverlay && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-3xl p-4 animate-in fade-in zoom-in duration-300">
           <div className={`border-[3px] rounded-[60px] p-10 max-w-4xl w-full relative grid grid-cols-1 lg:grid-cols-2 gap-10 overflow-hidden transition-all duration-700 shadow-[0_0_100px_rgba(0,0,0,0.8)] ${signal.isPaused ? 'bg-[#1a140a] border-amber-500/20' : 'bg-[#061610] border-emerald-500/20'}`}>
              
              <div className="flex flex-col items-center text-center justify-center border-b lg:border-b-0 lg:border-r border-slate-800/50 pb-10 lg:pb-0 lg:pr-10">
                 <div className="flex items-center gap-6 mb-8">
                    <div className={`p-6 rounded-[35px] shadow-2xl transition-all ${signal.isPaused ? 'bg-amber-500 text-slate-900 shadow-neon-amber' : 'bg-emerald-500 text-slate-950 shadow-neon-green'}`}>
                       {signal.isPaused ? <RefreshCw className="animate-spin" size={40} /> : <PlayCircle size={40} />}
                    </div>
                    <div className="text-left">
                       <h2 className={`text-4xl font-black uppercase tracking-tighter italic ${signal.isPaused ? 'text-amber-500' : 'text-white'}`}>
                         {signal.isPaused ? 'Recovery' : `MelloBetas N${signal.progressionStep}`}
                       </h2>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{signal.isPaused ? 'Proteção Ativa' : 'Scanner Confirmado'}</p>
                    </div>
                 </div>

                 {signal.warningMessage && (
                   <div className={`w-full border-2 rounded-3xl p-5 mb-8 flex items-center gap-5 animate-pulse ${signal.isPaused ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                      <AlertTriangle className={signal.isPaused ? 'text-amber-500' : 'text-emerald-500'} size={32} />
                      <span className={`text-xs font-black uppercase leading-tight ${signal.isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>{signal.warningMessage}</span>
                   </div>
                 )}

                 <div className="flex flex-col mb-10">
                    <span className="text-slate-600 text-xs font-black uppercase tracking-[0.5em] mb-4">Aposta na Coluna</span>
                    <h1 className="text-[10rem] font-black text-white uppercase tracking-tighter leading-none animate-in slide-in-from-top-4 duration-300">{signal.isPaused ? '--' : `${signal.targetColumn}`}</h1>
                 </div>

                 <div className="grid grid-cols-2 gap-4 w-full mb-8">
                    <div className="bg-black/50 border border-slate-800 rounded-[30px] p-6 flex flex-col items-center">
                       <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Aposta</p>
                       <p className="text-3xl font-black text-white">R$ {progressionLevels[signal.progressionStep-1]?.toFixed(2)}</p>
                    </div>
                    <div className="bg-black/50 border border-slate-800 rounded-[30px] p-6 flex flex-col items-center">
                       <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Ganhos</p>
                       <p className="text-3xl font-black text-neon-green">
                          R$ {(progressionLevels[signal.progressionStep-1] * 2).toFixed(2)}
                       </p>
                    </div>
                 </div>

                 {!signal.isPaused ? (
                   <button 
                    onClick={() => {
                      setSignal(prev => ({ ...prev, showOverlay: false }));
                      lastProcessedSpinRef.current = history.length;
                    }} 
                    className="w-full py-8 rounded-[35px] font-black text-2xl bg-neon-green hover:bg-emerald-400 text-slate-950 transition-all shadow-[0_20px_50px_rgba(0,255,136,0.3)] uppercase tracking-tighter"
                   >
                      CONFIRMAR ENTRADA
                   </button>
                 ) : (
                   <div className="w-full bg-slate-900/40 border-2 border-slate-800 py-8 rounded-[35px] flex items-center justify-center gap-6 text-slate-400">
                      <Clock size={32} className="animate-spin text-amber-500" />
                      <span className="text-xl font-black uppercase tracking-tighter">Buscando Brecha...</span>
                   </div>
                 )}
              </div>

              <div className="flex flex-col">
                 <div className="flex items-center justify-between mb-8">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                       <Search size={20} className="text-sky-500" /> Scanner Biométrico Ativo
                    </h4>
                 </div>

                 <div className="grid grid-cols-5 gap-2 mb-10 overflow-y-auto max-h-[300px] pr-2 custom-scroll">
                    {[0, ...Array.from({length: 36}, (_, i) => i + 1)].map(n => (
                      <button key={n} onClick={() => addNumber(n)} className={`aspect-square text-[10px] font-black rounded-xl border-2 transition-all flex items-center justify-center ${n === 0 ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900/80 border-slate-800 text-white'} hover:scale-105 active:scale-95`}>{n}</button>
                    ))}
                 </div>

                 <div className="bg-black/40 rounded-[40px] p-8 border border-slate-800/50">
                    <div className="grid grid-cols-3 gap-6">
                       {[1, 2, 3].map(col => (
                         <div key={col} className="flex flex-col items-center">
                            <div className="w-full h-24 bg-slate-950/60 rounded-full overflow-hidden flex flex-col justify-end p-1 border border-slate-800/30">
                               <div className={`w-full rounded-full transition-all duration-1000 ${col === signal.targetColumn ? (signal.isPaused ? 'bg-amber-500' : 'bg-sky-500 shadow-neon-sky') : 'bg-slate-800'}`} style={{height: `${getColPercentage(col)}%`}} />
                            </div>
                            <span className="text-sm font-black text-white mt-4 font-mono">{getColPercentage(col).toFixed(0)}%</span>
                            <span className="text-[9px] font-black text-slate-600 uppercase mt-1">Col {col}</span>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      <div className={`w-full grid grid-cols-1 lg:grid-cols-12 gap-8 ${signal.showOverlay ? 'opacity-20 pointer-events-none blur-md' : ''} transition-all duration-500`}>
         
         <div className="lg:col-span-4 space-y-8">
            <section className="bg-card border border-accent rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-3"><LayoutGrid size={20} className="text-sky-500" /> Registrar Giros</h3>
               <div className="grid grid-cols-10 gap-2.5 mb-8">
                  {[0, ...Array.from({length: 36}, (_, i) => i + 1)].map(n => (
                    <button key={n} onClick={() => addNumber(n)} className={`aspect-square text-[10px] font-black rounded-xl border-2 transition-all flex items-center justify-center ${n === 0 ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900/50 border-slate-800 text-white'} hover:border-sky-500 active:scale-90`}>{n}</button>
                  ))}
               </div>
               <div className="flex flex-col gap-4">
                  <div className="flex gap-3">
                    <input className="flex-1 bg-black/40 border-2 border-slate-800 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-sky-500 transition-all font-bold" placeholder="Digite os números..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pasteNumbers()}/>
                    <button onClick={pasteNumbers} className="bg-sky-600 hover:bg-sky-500 px-6 rounded-2xl text-xs font-black transition-colors uppercase text-white shadow-xl">Processar</button>
                  </div>
                  <button onClick={deleteLastNumber} disabled={history.length === 0} className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all disabled:opacity-30">
                    <Trash2 size={16} /> Corrigir Último
                  </button>
               </div>
            </section>

            <section className="bg-card border border-accent rounded-[40px] p-8 shadow-2xl">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-3 mb-6"><HistoryIcon size={20} className="text-sky-500" /> Fluxo de Mesa</h3>
               <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scroll">
                  {history.slice(0, 10).map((spin, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-black/20 rounded-2xl border border-slate-800/40">
                       <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs border-2 ${spin.number === 0 ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-slate-700 text-white'}`}>{spin.number}</span>
                       <span className="text-[10px] font-black text-sky-400 uppercase tracking-tighter">COLUNA {spin.column}</span>
                       <span className="text-[9px] text-slate-600 font-mono opacity-50">{spin.timestamp}</span>
                    </div>
                  ))}
               </div>
            </section>
         </div>

         <div className="lg:col-span-5 space-y-8">
            <section className="bg-card border border-accent rounded-[40px] p-8 shadow-2xl">
               <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-3 mb-10"><ShieldCheck size={20} className="text-emerald-500" /> Estatística de Colunas</h4>
               <div className="grid grid-cols-3 gap-6">
                  {[1, 2, 3].map(col => (
                    <div key={col} className={`bg-black/30 rounded-[35px] p-6 border-2 transition-all duration-700 ${signal.targetColumn === col ? 'border-sky-500/50 bg-sky-500/5 shadow-inner' : 'border-slate-800/30'}`}>
                       <p className="text-[10px] font-black text-slate-500 uppercase mb-6 text-center">Col {col}</p>
                       <div className="flex items-end gap-2 h-20 mb-6 px-2">
                          {Array.from({length: 5}).map((_, i) => (
                            <div key={i} className={`flex-1 rounded-full transition-all duration-1000 ${getColPercentage(col) > (i * 20) ? (col === 1 ? 'bg-sky-500' : col === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-800/20'}`} style={{height: `${Math.min(100, (i + 1) * 20)}%`}} />
                          ))}
                       </div>
                       <p className="text-2xl font-black text-white font-mono text-center leading-none">{getColPercentage(col).toFixed(0)}%</p>
                    </div>
                  ))}
               </div>
            </section>

            <section className="bg-card border border-accent rounded-[40px] p-10 shadow-2xl">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-10 flex items-center gap-4"><Trophy className="text-neon-green" size={24} /> Performance Global</h3>
               <div className="grid grid-cols-2 gap-4">
                  <ResultStat label="Saldo em Conta" value={`R$ ${stats.currentBank.toFixed(2)}`} />
                  <ResultStat label="P/L do Dia" value={`R$ ${stats.profit.toFixed(2)}`} isPositive={stats.profit >= 0} />
                  <ResultStat label="Taxa de Assertividade" value={`${stats.totalEntries > 0 ? ((stats.wins / stats.totalEntries) * 100).toFixed(0) : '0'}%`} isPositive />
                  <ResultStat label="Operações" value={stats.totalEntries} />
               </div>
            </section>
         </div>

         <div className="lg:col-span-3 space-y-8">
            <section className="bg-card border border-accent rounded-[40px] p-10 h-full flex flex-col shadow-2xl relative overflow-hidden">
               <div className="mb-12">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-4 mb-6"><ShieldCheck size={24} className="text-neon-green" /> Firewall v3.0</h3>
                  <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-slate-800 shadow-inner">
                     <div className="h-full bg-neon-green transition-all duration-1000 shadow-neon-green" style={{width: `${signal.safetyScore}%`}} />
                  </div>
               </div>

               <div className="space-y-6 flex-1">
                  <div className="space-y-4">
                     <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] flex items-center gap-4">Sensores da IA</p>
                     <CheckItem label="Fluxo Estável" active={!criteria?.isCold} safety />
                     <CheckItem label="Mesa Limpa" active={!criteria?.isZeroRecent} safety />
                     <CheckItem label="Volume Dominante" active={!!criteria?.dominance} safety />
                  </div>
               </div>

               <div className="mt-12 pt-10 border-t border-slate-800/50">
                  <div className={`w-full py-6 rounded-[30px] font-black text-center text-[11px] transition-all border-2 shadow-2xl uppercase tracking-widest ${criteria?.isZeroRecent || signal.isPaused ? 'bg-amber-500 text-slate-950 border-amber-400' : signal.isAwaitingResult ? 'bg-neon-green text-slate-950 border-emerald-400' : 'bg-black/40 border-slate-800 text-slate-600'}`}>
                     {criteria?.isZeroRecent ? 'BLOQUEIO ZERO' : signal.isPaused ? 'RECOVERY MODE' : signal.isAwaitingResult ? 'OPERANDO N' + signal.progressionStep : 'SCANNER ATIVO'}
                  </div>
               </div>
            </section>
         </div>
      </div>
    </div>
  );
};

const StatusCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; valueColor?: string }> = ({ label, value, icon, valueColor = 'text-white' }) => (
  <div className="bg-card border border-accent p-6 rounded-[35px] flex flex-col justify-between shadow-2xl h-36 hover:border-slate-700 transition-all group relative overflow-hidden">
    <div className="flex items-center gap-3 text-slate-500 group-hover:text-slate-400 transition-colors">
      {icon}
      <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
    </div>
    <div className={`text-2xl font-black truncate leading-tight tracking-tighter ${valueColor}`}>
      {value}
    </div>
  </div>
);

const CheckItem: React.FC<{ label: string; active: boolean; safety?: boolean }> = ({ label, active, safety }) => (
  <div className={`flex items-center justify-between transition-all p-3 rounded-2xl border ${active ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400 shadow-inner' : 'border-transparent text-slate-700'}`}>
     <div className="flex items-center gap-4">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${active ? 'bg-neon-green border-emerald-500' : 'bg-transparent border-slate-800'}`}>
           {active && <CheckCircle2 size={14} className="text-slate-950 stroke-[3px]" />}
        </div>
        <span className="text-[11px] font-black uppercase tracking-tight">{label}</span>
     </div>
     {safety && active && <div className="w-2 h-2 rounded-full bg-neon-green shadow-neon-green" />}
  </div>
);

const ResultStat: React.FC<{ label: string; value: string | number; isPositive?: boolean }> = ({ label, value, isPositive }) => (
  <div className="bg-black/30 rounded-[25px] p-5 border border-slate-800/40 hover:border-slate-700 transition-colors shadow-inner">
     <p className="text-[9px] text-slate-600 font-black uppercase mb-2 tracking-widest">{label}</p>
     <p className={`text-xl font-black truncate ${isPositive === undefined ? 'text-white' : isPositive ? 'text-neon-green' : 'text-red-400'}`}>{value}</p>
  </div>
);

export default App;
