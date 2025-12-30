
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  SystemStatus, 
  TriggerType, 
  SpinResult, 
  Statistics, 
  SignalState 
} from './types.ts';
import { getColumn } from './constants.ts';
import { audioService } from './services/audioService.ts';
import { 
  History as HistoryIcon, 
  CheckCircle2,
  LayoutGrid,
  Trophy,
  ShieldCheck,
  BarChart3,
  RotateCcw,
  Trash2,
  TrendingUp,
  Activity as HealthIcon,
  ShieldAlert,
  Zap,
  Star,
  Timer,
  AlertTriangle,
  XCircle,
  TrendingDown,
  Flame,
  ZapOff
} from 'lucide-react';

interface ExtendedSignalState extends SignalState {
  showOverlay: boolean;
  investedInCycle: number;
  signalHealth: number; 
  dynamicWarning: string | null;
  cautionLevel: 'NORMAL' | 'CAUTION' | 'DANGER';
  isStrongSignal: boolean;
  lastSignalSpinCount: number;
  isPaused: boolean; 
}

type ResultType = 'WIN' | 'LOSS' | null;

const App: React.FC = () => {
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [initialBank, setInitialBank] = useState<number>(30);
  const [entryPercent, setEntryPercent] = useState<number>(5);

  const [showResult, setShowResult] = useState<{ type: ResultType; value: number } | null>(null);
  const [history, setHistory] = useState<SpinResult[]>([]);
  const [stats, setStats] = useState<Statistics>({
    wins: 0, losses: 0, totalEntries: 0, currentBank: 30, profit: 0, dailyPercentage: 0
  });
  
  const [signal, setSignal] = useState<ExtendedSignalState>({
    status: SystemStatus.NO_SIGNAL,
    targetColumn: null,
    activeTrigger: TriggerType.NONE,
    progressionStep: 0,
    isAwaitingResult: false,
    cooldownCounter: 0,
    showOverlay: false,
    investedInCycle: 0,
    signalHealth: 0,
    dynamicWarning: null,
    cautionLevel: 'NORMAL',
    isStrongSignal: false,
    lastSignalSpinCount: 0,
    isPaused: false
  });

  const [inputValue, setInputValue] = useState('');
  const lastProcessedSpinCount = useRef<number>(-1);

  const unitValue = useMemo(() => {
    const totalRiskAmount = initialBank * (entryPercent / 100);
    const calculatedUnit = totalRiskAmount / 12;
    return Math.max(0.50, Math.round(calculatedUnit * 100) / 100);
  }, [initialBank, entryPercent]);

  const progressionLevels = useMemo(() => [
    unitValue * 1, // G1
    unitValue * 1, // G2
    unitValue * 2, // G3
    unitValue * 3, // G4
    unitValue * 5  // G5
  ], [unitValue]);

  const handleStartSession = () => {
    setStats({
      wins: 0, losses: 0, totalEntries: 0, currentBank: initialBank, profit: 0, dailyPercentage: 0
    });
    setIsSessionStarted(true);
  };

  const handleResetSession = () => {
    if (confirm("Deseja resetar a análise e zerar o histórico?")) {
      setIsSessionStarted(false);
      setHistory([]);
      setSignal({
        status: SystemStatus.NO_SIGNAL,
        targetColumn: null,
        activeTrigger: TriggerType.NONE,
        progressionStep: 0,
        isAwaitingResult: false,
        cooldownCounter: 0,
        showOverlay: false,
        investedInCycle: 0,
        signalHealth: 0,
        dynamicWarning: null,
        cautionLevel: 'NORMAL',
        isStrongSignal: false,
        lastSignalSpinCount: 0,
        isPaused: false
      });
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

  const pasteNumbers = useCallback(() => {
    const numbers = inputValue.split(/[,\s\n]+/)
      .map(n => parseInt(n.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n <= 36);
    if (numbers.length === 0) return;
    const newHistory = [...history];
    const reversedNumbers = [...numbers].reverse();
    reversedNumbers.forEach(num => {
      newHistory.unshift({
        number: num,
        column: getColumn(num),
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });
    });
    setHistory(newHistory.slice(0, 1000));
    setInputValue('');
  }, [inputValue, history]);

  const getColPercentage = useCallback((col: number, limit = 20) => {
    if (history.length === 0) return 0;
    const window = history.slice(0, Math.min(limit, history.length));
    const count = window.filter(s => s.column === col).length;
    return (count / window.length) * 100;
  }, [history]);

  const analysis = useMemo(() => {
    if (history.length < 10) return null;

    // Detecta a melhor coluna em tempo real, sem travar na anterior
    let target = 1;
    const p1 = getColPercentage(1, 20);
    const p2 = getColPercentage(2, 20);
    const p3 = getColPercentage(3, 20);
    if (p2 > p1 && p2 > p3) target = 2;
    if (p3 > p1 && p3 > p2) target = 3;

    const window3 = history.slice(0, 3);
    const window4 = history.slice(0, 4);
    const window5 = history.slice(0, 5);
    const window7 = history.slice(0, 7);

    // GATILHOS CONFORME TABELA
    const C1_Dominance = getColPercentage(target, 20) >= 35; 
    const G_Pressure = window7.filter(s => s.column === target).length >= 4; 
    
    const G_Continuity = window4.filter(s => s.column === target).length >= 2; 
    const G_Momentum = window3.filter(s => s.column === target).length >= 2; 
    const G_Streak = history[0].column === target && history[1].column === target; 
    const G_HotZone = getColPercentage(target, 10) >= 40; 
    const G_Eco = window5.filter(s => s.column === target).length >= 2; 

    // BLOQUEIOS
    const otherColStreak = [1, 2, 3].filter(c => c !== target).some(c => window3.every(s => s.column === c));
    const zeroCount = window5.filter(s => s.column === 0).length;
    const zeroBloq = zeroCount >= 2;
    let absenceCount = 0;
    for (let i = 0; i < Math.min(history.length, 10); i++) {
      if (history[i].column === target) break;
      absenceCount++;
    }
    const absenceBloq = absenceCount >= 5;

    // CHECKLIST STATUS
    const spinsSinceLastSignal = history.length - signal.lastSignalSpinCount;
    // Se estiver em pausa, o cooldown de 20 spins não se aplica (pois é continuação do mesmo ciclo)
    const cooldownOK = signal.isPaused || signal.isAwaitingResult || signal.lastSignalSpinCount === 0 || spinsSinceLastSignal >= 20;
    
    const noBlocks = !otherColStreak && !zeroBloq && !absenceBloq;
    
    // REGRA DE OURO
    const mandatoryOK = C1_Dominance && G_Pressure && noBlocks && cooldownOK;
    const optionalOK = G_Continuity || G_Momentum || G_Streak || G_HotZone || G_Eco;

    const isValid = mandatoryOK && optionalOK;

    // Feedback Visual
    const perc10 = getColPercentage(target, 10);
    const perc20 = getColPercentage(target, 20);
    const trend = perc10 > perc20 ? 'Subindo' : perc10 < perc20 ? 'Descendo' : 'Estável';
    const patternStrength = Math.min(100, (perc20 * 1.5) + (G_Pressure ? 20 : 0));

    return {
      target, isValid, trend, patternStrength, zeroCount, absenceCount,
      triggers: { 
        C1_Dominance, G_Pressure, G_Continuity, G_Momentum, G_Streak, G_HotZone, G_Eco 
      },
      blocks: { otherColStreak, zeroBloq, absenceBloq, cooldownOK, noBlocks },
      spinsToNext: Math.max(0, 20 - spinsSinceLastSignal)
    };
  }, [history, signal.lastSignalSpinCount, signal.isPaused, signal.isAwaitingResult]);

  useEffect(() => {
    if (!isSessionStarted || history.length === 0) return;
    const latest = history[0];
    const spinCount = history.length;

    // 1. Processa o resultado do giro anterior
    if (signal.isAwaitingResult && !signal.showOverlay && !signal.isPaused && spinCount !== lastProcessedSpinCount.current) {
      lastProcessedSpinCount.current = spinCount;
      
      if (latest.column === signal.targetColumn) {
        // WIN -> Reseta ciclo
        const betValue = progressionLevels[signal.progressionStep - 1];
        const winValue = betValue * 3;
        const profit = winValue - signal.investedInCycle;
        setStats(prev => ({
          ...prev, wins: prev.wins + 1, totalEntries: prev.totalEntries + 1,
          currentBank: prev.currentBank + winValue, profit: prev.profit + profit,
          dailyPercentage: ((prev.currentBank + winValue - initialBank) / initialBank) * 100
        }));
        setSignal(prev => ({ ...prev, isAwaitingResult: false, progressionStep: 0, investedInCycle: 0, status: SystemStatus.NO_SIGNAL, targetColumn: null, lastSignalSpinCount: history.length, isPaused: false }));
        setShowResult({ type: 'WIN', value: profit });
        audioService.playWin();
        setTimeout(() => setShowResult(null), 3000);
      } else {
        // LOSS -> Pausa ciclo para aguardar nova análise (pode ser outra coluna)
        if (signal.progressionStep < 5) {
          setSignal(prev => ({ ...prev, progressionStep: prev.progressionStep + 1, isPaused: true }));
          audioService.playObservation();
        } else {
          // RED FINAL
          setStats(prev => ({ ...prev, losses: prev.losses + 1, totalEntries: prev.totalEntries + 1, dailyPercentage: ((prev.currentBank - initialBank) / initialBank) * 100 }));
          setSignal(prev => ({ ...prev, isAwaitingResult: false, progressionStep: 0, investedInCycle: 0, targetColumn: null, lastSignalSpinCount: history.length, isPaused: false }));
          setShowResult({ type: 'LOSS', value: signal.investedInCycle });
          audioService.playLoss();
          setTimeout(() => setShowResult(null), 3000);
        }
      }
      return;
    }

    // 2. Retomada de Ciclo Pausado (Adaptação de Coluna)
    // Se o ciclo está em pausa e QUALQUER coluna (detectada no analysis.target) satisfizer a checklist, retoma.
    if (signal.isPaused && analysis?.isValid) {
      setSignal(prev => ({ 
        ...prev, 
        isPaused: false, 
        showOverlay: true, 
        status: SystemStatus.AUTHORIZED,
        targetColumn: analysis.target, // Atualiza para a nova coluna detectada
        signalHealth: Math.round(analysis.patternStrength)
      }));
    }

    // 3. Emissão de Novo Sinal (Início de Ciclo)
    if (!signal.isAwaitingResult && !signal.isPaused && analysis?.isValid) {
      setSignal(prev => ({
        ...prev, status: SystemStatus.AUTHORIZED, targetColumn: analysis.target,
        progressionStep: 1, isAwaitingResult: true, showOverlay: true,
        signalHealth: Math.round(analysis.patternStrength), isPaused: false
      }));
      audioService.playObservation();
    } else if (!signal.isAwaitingResult && !signal.isPaused) {
      const hasBlock = analysis?.blocks.zeroBloq || analysis?.blocks.otherColStreak || analysis?.blocks.absenceBloq || !analysis?.blocks.cooldownOK;
      setSignal(prev => ({ 
        ...prev, status: hasBlock ? SystemStatus.OBSERVATION : SystemStatus.NO_SIGNAL 
      }));
    }
  }, [history.length, isSessionStarted, analysis, signal.isAwaitingResult, signal.isPaused, signal.progressionStep, signal.targetColumn, progressionLevels, initialBank]);

  const confirmBet = () => {
    const betValue = progressionLevels[signal.progressionStep - 1];
    setStats(prev => ({ ...prev, currentBank: prev.currentBank - betValue }));
    setSignal(prev => ({ ...prev, showOverlay: false, investedInCycle: prev.investedInCycle + betValue }));
    lastProcessedSpinCount.current = history.length;
  };

  if (!isSessionStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
        <div className="bg-card w-full max-w-md rounded-[32px] p-10 border border-slate-800 shadow-2xl">
          <div className="flex flex-col items-center text-center">
             <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-8 border border-emerald-500/20">
                <ShieldCheck className="text-emerald-500" size={40} />
             </div>
             <h1 className="text-3xl font-black mb-2 tracking-tight">MelloBetas <span className="text-emerald-500">3.0</span></h1>
             <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-10">Advanced Sniper Engine</p>
             <div className="w-full space-y-6 text-left">
                <div className="group">
                   <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Banca Inicial (R$)</label>
                   <input type="number" value={initialBank} onChange={e => setInitialBank(Number(e.target.value))} className="w-full bg-black border border-slate-800 group-focus-within:border-emerald-500 rounded-2xl py-4 px-6 font-black text-2xl outline-none transition-all" />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 ml-1">Exposição p/ Sinal (% Banca)</label>
                   <div className="grid grid-cols-4 gap-3">
                      {[1, 2, 5, 10].map(p => (
                        <button key={p} onClick={() => setEntryPercent(p)} className={`py-4 rounded-2xl font-black text-xs transition-all ${entryPercent === p ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>{p}%</button>
                      ))}
                   </div>
                </div>
                <div className="bg-slate-900/40 rounded-3xl p-6 border border-slate-800/50 space-y-4 text-[11px] font-black uppercase">
                   <div className="flex justify-between items-center"><span>Ficha Base:</span><span className="text-emerald-500">R$ {unitValue.toFixed(2)}</span></div>
                   <div className="flex justify-between items-center"><span>Ciclo Total (G5):</span><span className="text-rose-500">R$ {(unitValue * 12).toFixed(2)}</span></div>
                </div>
                <button onClick={handleStartSession} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-5 rounded-[20px] font-black text-sm uppercase transition-all shadow-xl">Ativar Analisador</button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center max-w-7xl mx-auto pb-20">
      {showResult && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 backdrop-blur-md bg-black/80 animate-in fade-in duration-300">
          <div className={`flex flex-col items-center p-16 rounded-[48px] border-4 shadow-2xl ${showResult.type === 'WIN' ? 'bg-[#061610] border-emerald-500' : 'bg-[#160606] border-rose-500'}`}>
            <div className={`p-6 rounded-full mb-8 ${showResult.type === 'WIN' ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'}`}>
               <Trophy size={64} />
            </div>
            <h2 className="text-6xl font-black text-white uppercase mb-4">{showResult.type === 'WIN' ? 'VITÓRIA' : 'LOSS'}</h2>
            <div className="px-12 py-4 bg-black/60 rounded-3xl text-4xl font-black text-white border border-white/5">{showResult.type === 'WIN' ? '+' : '-'} R$ {showResult.value.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* STATUS HEADER FIXO */}
      <div className="w-full bg-card rounded-[24px] border border-slate-800 shadow-2xl mb-8 sticky top-4 z-[100] overflow-hidden backdrop-blur-xl">
        <div className="bg-card-header px-8 py-5 flex justify-between items-center">
           <div className="flex items-center gap-4">
              <div className={`w-4 h-4 rounded-full ${signal.status === SystemStatus.AUTHORIZED ? 'bg-emerald-500 animate-pulse shadow-[0_0_15px_#10b981]' : signal.status === SystemStatus.OBSERVATION ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <div className="flex flex-col">
                 <span className={`text-[12px] font-black uppercase tracking-widest ${signal.status === SystemStatus.AUTHORIZED ? 'text-neon-green' : signal.status === SystemStatus.OBSERVATION ? 'text-neon-amber' : 'text-neon-red'}`}>{signal.status}</span>
                 <span className="text-[9px] font-bold text-slate-600 uppercase">Sistema de Monitoramento</span>
              </div>
           </div>
           <div className="flex gap-12">
              <HeaderMetric label="Alvo Ativo" value={signal.targetColumn ? `COLUNA ${signal.targetColumn}` : '--'} color="text-emerald-400" />
              <HeaderMetric label="Banca Real" value={`R$ ${stats.currentBank.toFixed(2)}`} color="text-white" />
              <HeaderMetric label="Lucro / Preju" value={`R$ ${stats.profit.toFixed(2)}`} color={stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
           </div>
        </div>
        <div className="px-8 py-4 bg-black/40 flex items-center justify-between border-t border-slate-800/50">
           <div className="flex items-center gap-5">
              <span className="text-[10px] font-black text-slate-500 uppercase">Progressão</span>
              <div className="flex gap-2">
                 {[1, 2, 3, 4, 5].map(step => (
                   <div key={step} className={`h-2 w-10 rounded-full transition-all duration-500 ${signal.progressionStep >= step ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-800'}`} />
                 ))}
              </div>
              {signal.isPaused && <span className="text-amber-500 text-[10px] font-black animate-pulse uppercase ml-2">Ciclo Pausado</span>}
           </div>
           <div className="flex items-center gap-5">
              <span className="text-[10px] font-black text-slate-500 uppercase">Valor Atual</span>
              <span className="text-emerald-500 font-black text-lg">R$ {signal.progressionStep > 0 ? progressionLevels[signal.progressionStep - 1].toFixed(2) : '0,00'}</span>
           </div>
        </div>
      </div>

      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-8">
           <section className="bg-card rounded-[28px] p-8 border border-slate-800 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className={`text-sm font-black uppercase tracking-tight ${analysis?.isValid ? 'text-emerald-500' : 'text-slate-400'}`}>Coluna {analysis?.target} {analysis?.isValid ? '🎯 ALVO' : 'EM ANÁLISE'}</h3>
                <span className="text-sm font-black text-emerald-400">{getColPercentage(analysis?.target || 1, 20).toFixed(1)}% ({history.slice(0, 20).filter(s => s.column === analysis?.target).length})</span>
              </div>
              <div className="h-2 w-full bg-slate-900 rounded-full mb-8 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${getColPercentage(analysis?.target || 1, 20)}%` }} />
              </div>

              <div className="space-y-6">
                 <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-4 tracking-widest">Critérios Obrigatórios</p>
                    <ValidationItem label="Dominante ≥35%" active={!!analysis?.triggers.C1_Dominance} mandatory />
                    <ValidationItem label="Pressão (4 de 7)" active={!!analysis?.triggers.G_Pressure} mandatory />
                    <ValidationItem label="Sem bloqueios ativos" active={!!analysis?.blocks.noBlocks} mandatory />
                    <ValidationItem label="Intervalo OK" active={!!analysis?.blocks.cooldownOK} mandatory />
                 </div>
                 
                 <div className="pt-6 border-t border-slate-800/50">
                    <p className="text-[10px] font-black text-slate-500 mb-4 tracking-widest flex justify-between uppercase">
                       <span>Gatilhos Opcionais</span>
                       <span className="text-[8px] opacity-40">(Pelo menos 1)</span>
                    </p>
                    <ValidationItem label="Continuidade (2 de 4)" active={!!analysis?.triggers.G_Continuity} />
                    <ValidationItem label="Momentum (2 de 3)" active={!!analysis?.triggers.G_Momentum} />
                    <ValidationItem label="Sequência (Streak)" active={!!analysis?.triggers.G_Streak} />
                    <ValidationItem label="Zona Quente (>40%)" active={!!analysis?.triggers.G_HotZone} />
                    <ValidationItem label="Eco Reaparece" active={!!analysis?.triggers.G_Eco} />
                 </div>

                 <div className="pt-6 border-t border-slate-800/50 space-y-2">
                    <div className="flex justify-between text-[11px] font-bold"><span className="text-slate-500">Força do padrão:</span><span className="text-emerald-400">{analysis?.patternStrength.toFixed(0)}%</span></div>
                    <div className="flex justify-between text-[11px] font-bold">
                       <span className="text-slate-500">Tendência:</span>
                       <span className={`flex items-center gap-1 ${analysis?.trend === 'Subindo' ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {analysis?.trend === 'Subindo' ? <TrendingUp size={12}/> : <TrendingDown size={12}/>} {analysis?.trend}
                       </span>
                    </div>
                 </div>
              </div>
           </section>

           {signal.isPaused && (
             <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-[28px] p-6 animate-in fade-in zoom-in duration-300">
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-3 text-amber-500">
                      <AlertTriangle size={24} />
                      <h3 className="text-base font-black uppercase">Ciclo em Andamento</h3>
                   </div>
                   <div className="bg-amber-500/20 text-amber-500 px-3 py-1 rounded-xl text-xs font-black">{signal.progressionStep}u/5u</div>
                </div>
                <p className="text-slate-400 text-xs font-bold leading-relaxed">
                   Aguardando nova análise para continuar progressão G{signal.progressionStep}. 
                   <span className="block mt-2 text-white/80 italic">O sistema irá captar o próximo sinal em qualquer coluna disponível.</span>
                </p>
             </div>
           )}
        </div>

        <div className="lg:col-span-5 space-y-8">
           <section className="bg-card rounded-[28px] p-8 border border-slate-800 shadow-xl">
              <div className="grid grid-cols-6 gap-1.5 mb-8">
                 {[0, ...Array.from({length: 36}, (_, i) => i + 1)].map(n => (
                   <button key={n} onClick={() => addNumber(n)} className={`h-11 text-[12px] font-black rounded-xl border transition-all active:scale-90 ${n === 0 ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>{n}</button>
                 ))}
              </div>
              <textarea className="w-full bg-black border border-slate-800 rounded-2xl p-6 text-[13px] font-mono text-white focus:border-emerald-500 outline-none h-40 mb-6 custom-scroll" placeholder="Cole os números aqui..." value={inputValue} onChange={e => setInputValue(e.target.value)} />
              <div className="flex gap-4">
                 <button onClick={pasteNumbers} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black py-5 rounded-2xl font-black text-xs uppercase transition-all shadow-xl active:scale-95">Colar Números</button>
                 <button onClick={() => setHistory(prev => prev.slice(1))} className="w-20 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-500 hover:text-rose-500 transition-all"><Trash2 size={22}/></button>
              </div>
           </section>

           <section className="bg-card rounded-[28px] p-8 border border-slate-800 shadow-xl">
              <h3 className="text-[11px] font-black text-slate-400 uppercase mb-8 flex items-center gap-3 tracking-widest"><BarChart3 size={18} className="text-emerald-500" /> Resultados Sessão</h3>
              <div className="grid grid-cols-2 gap-5">
                 <MetricBox label="Banca Inicial" value={`R$ ${initialBank.toFixed(2)}`} />
                 <MetricBox label="Banca Atual" value={`R$ ${stats.currentBank.toFixed(2)}`} color="text-emerald-400" />
                 <MetricBox label="Lucro Líquido" value={`R$ ${stats.profit.toFixed(2)}`} color={stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
                 <MetricBox label="Performance" value={`${stats.dailyPercentage.toFixed(1)}%`} />
                 <MetricBox label="Wins" value={stats.wins} color="text-emerald-400" />
                 <MetricBox label="Losses" value={stats.losses} color="text-rose-400" />
              </div>
           </section>
        </div>

        <div className="lg:col-span-3">
           <section className="bg-card rounded-[28px] p-8 border border-slate-800 h-full flex flex-col shadow-xl">
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3"><HistoryIcon size={18} className="text-emerald-500" /> Fluxo de Dados</h3>
                 <span className="text-[10px] font-black text-slate-700 bg-black px-3 py-1 rounded-lg border border-slate-900">{history.length}</span>
              </div>
              <div className="space-y-3 overflow-y-auto max-h-[780px] pr-3 custom-scroll flex-1">
                 {history.map((spin, i) => (
                   <div key={i} className="flex items-center justify-between p-4 bg-black/40 border border-slate-900 rounded-2xl hover:border-slate-800 transition-all">
                      <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border-2 ${spin.number === 0 ? 'bg-emerald-600 border-emerald-400/50 text-white' : [1,4,7,10,13,16,19,22,25,28,31,34].includes(spin.number) ? 'bg-rose-600 border-rose-400/50 text-white' : 'bg-slate-900 border-slate-800 text-white'}`}>{spin.number}</span>
                        <div className="flex flex-col">
                           <span className="text-[11px] font-black text-slate-300 uppercase tracking-tight">COLUNA {spin.column || 'ZERO'}</span>
                           <span className="text-[9px] font-bold text-slate-600">{spin.timestamp}</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-black text-slate-900 opacity-30">#{history.length - i}</span>
                   </div>
                 ))}
              </div>
           </section>
        </div>
      </div>

      {signal.showOverlay && (
        <div className="fixed inset-0 z-[500] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-8 animate-in zoom-in-95 duration-300">
           <div className={`bg-card border-2 border-emerald-500 rounded-[56px] p-12 max-w-xl w-full text-center relative overflow-hidden shadow-[0_0_100px_rgba(16,185,129,0.1)]`}>
              <div className="w-24 h-24 bg-emerald-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 mt-6 border border-emerald-500/20 shadow-inner">
                 <ShieldCheck size={48} className="text-emerald-500" />
              </div>
              <h2 className="text-3xl font-black text-white uppercase mb-2 tracking-tighter">Entrada Autorizada</h2>
              <div className="max-w-[300px] mx-auto mb-10">
                 <div className="flex justify-between items-center mb-2.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Saúde do Padrão</span>
                    <span className="text-[11px] font-black text-emerald-400">{signal.signalHealth}%</span>
                 </div>
                 <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${signal.signalHealth}%` }} />
                 </div>
              </div>
              <div className="bg-black/50 border border-slate-800 rounded-[40px] p-12 mb-10">
                 <p className="text-[12px] font-black text-emerald-500 uppercase mb-4 tracking-widest opacity-80">Apostar na Coluna</p>
                 <h1 className="text-[180px] font-black text-white leading-none tracking-tighter">{signal.targetColumn}</h1>
              </div>
              <div className="grid grid-cols-2 gap-5 mb-10 text-left">
                 <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Aposta (G{signal.progressionStep})</p>
                    <p className="text-2xl font-black text-white">R$ {progressionLevels[signal.progressionStep - 1].toFixed(2)}</p>
                 </div>
                 <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Alvo Analítico</p>
                    <p className="text-2xl font-black text-emerald-500 uppercase">COLUNA {signal.targetColumn}</p>
                 </div>
              </div>
              <button onClick={confirmBet} className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-black rounded-[24px] font-black text-lg uppercase transition-all shadow-2xl active:scale-95 shadow-emerald-500/20">Confirmar e Operar</button>
           </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="w-full mt-12 grid grid-cols-1 md:grid-cols-4 gap-5">
         <FooterCard icon={<TrendingUp size={20} className="text-emerald-500" />} label="Tendência" value={analysis?.trend || "ANALISANDO"} />
         <FooterCard icon={<ShieldCheck size={20} className="text-sky-500" />} label="Bloqueios" value={analysis?.blocks.noBlocks ? "LIMPO" : "ATIVO"} />
         <FooterCard icon={<HealthIcon size={20} className="text-emerald-400" />} label="Motor Sniper" value={analysis?.isValid ? "PRONTO" : "ANALISANDO"} />
         <button onClick={handleResetSession} className="bg-slate-900/40 hover:bg-rose-500/10 border border-slate-800 text-slate-600 hover:text-rose-500 p-6 rounded-[24px] transition-all flex items-center justify-center gap-4 font-black text-[11px] uppercase tracking-widest">
            <RotateCcw size={18} /> Limpar Tudo
         </button>
      </div>
    </div>
  );
};

const HeaderMetric: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color = 'text-slate-400' }) => (
  <div className="flex flex-col items-end">
    <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.1em] mb-1">{label}</p>
    <span className={`text-sm font-black truncate ${color}`}>{value}</span>
  </div>
);

const MetricBox: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color = 'text-white' }) => (
  <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/50 shadow-sm">
     <p className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{label}</p>
     <p className={`text-base font-black truncate ${color}`}>{value}</p>
  </div>
);

const FooterCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
  <div className="bg-card border border-slate-800 p-6 rounded-[24px] flex items-center gap-5 shadow-xl hover:border-slate-700 transition-all">
     <div className="w-14 h-14 rounded-2xl bg-black flex items-center justify-center border border-slate-800">{icon}</div>
     <div>
        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-xs font-black text-white">{value}</p>
     </div>
  </div>
);

const ValidationItem: React.FC<{ label: string; active: boolean; mandatory?: boolean }> = ({ label, active, mandatory }) => (
  <div className={`flex items-center justify-between py-1.5 transition-all ${active ? 'text-emerald-400' : 'text-slate-700 opacity-40'}`}>
     <div className="flex items-center gap-4">
        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${active ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'border-slate-800 bg-black/40'}`}>
           {active ? (mandatory ? <ShieldCheck size={14} className="stroke-[3px]" /> : <CheckCircle2 size={14} className="stroke-[3px]" />) : (mandatory ? <ZapOff size={14} className="opacity-50" /> : <XCircle size={14} className="opacity-50" />)}
        </div>
        <span className={`text-[11px] font-bold uppercase tracking-tight ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
     </div>
     <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${mandatory ? (active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500') : 'bg-slate-900 text-slate-700'}`}>
       {mandatory ? 'OBRIG' : 'OPC'}
     </span>
  </div>
);

export default App;
