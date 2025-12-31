
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
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
  Trophy,
  ShieldCheck,
  BarChart3,
  RotateCcw,
  Trash2,
  TrendingUp,
  Activity as HealthIcon,
  XCircle,
  ZapOff,
  Copy,
  Check,
  Target,
  Zap as FlashIcon,
  ArrowRightLeft,
  Atom,
  Magnet,
  Flame,
  Binary,
  Image as ImageIcon,
  Loader2,
  FlaskConical,
  AlertTriangle
} from 'lucide-react';

interface ExtendedSignalState extends SignalState {
  showOverlay: boolean;
  investedInCycle: number;
  signalHealth: number; 
  isPaused: boolean; 
  abortReason?: string | null;
  vortexScore: number;
}

interface SimulationResult {
    profit: number;
    wins: number;
    losses: number;
    totalEntries: number;
    status: 'EXCELLENT' | 'GOOD' | 'BAD' | 'CRITICAL';
}

type ResultType = 'WIN' | 'LOSS' | 'ABORT' | null;

const App: React.FC = () => {
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [initialBank, setInitialBank] = useState<number>(50);
  const [selectedUnit, setSelectedUnit] = useState<number>(0.50);

  const [showResult, setShowResult] = useState<{ type: ResultType; value: number; message?: string } | null>(null);
  const [history, setHistory] = useState<SpinResult[]>([]);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<Statistics>({
    wins: 0, losses: 0, totalEntries: 0, currentBank: 50, profit: 0, dailyPercentage: 0
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
    isPaused: false,
    abortReason: null,
    vortexScore: 0
  });

  const [inputValue, setInputValue] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastProcessedSpinCount = useRef<number>(-1);

  const progressionLevels = useMemo(() => [
    selectedUnit * 1,   // G1: 1.00
    selectedUnit * 1,   // G2: 1.00
    selectedUnit * 2,   // G3: 2.00
    selectedUnit * 2.5, // G4: 2.50
    selectedUnit * 3.5  // G5: 3.50
  ], [selectedUnit]);

  const handleStartSession = () => {
    setStats({
      wins: 0, losses: 0, totalEntries: 0, currentBank: initialBank, profit: 0, dailyPercentage: 0
    });
    setIsSessionStarted(true);
  };

  const handleResetSession = () => {
    if (confirm("Deseja resetar o Vortex e recalibrar os padrões?")) {
      setIsSessionStarted(false);
      setHistory([]);
      setSimResult(null);
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
        isPaused: false,
        abortReason: null,
        vortexScore: 0
      });
    }
  };

  const copyHistory = () => {
    const nums = history.map(s => s.number).join(', ');
    navigator.clipboard.writeText(nums);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  // Função independente de análise para uso na simulação
  const analyzeSnapshot = (snapshotHistory: SpinResult[]) => {
      if (snapshotHistory.length < 5) return { isValid: false, target: null, score: 0 };
      
      const lastSpin = snapshotHistory[0];

      // Afinidade Lógica
      let count1 = 0, count2 = 0, count3 = 0, total = 0;
      for (let i = 1; i < snapshotHistory.length; i++) {
          const prevSpin = snapshotHistory[i]; 
          const resultSpin = snapshotHistory[i-1]; 
          if (prevSpin.number === lastSpin.number) {
              if (resultSpin.column === 1) count1++;
              if (resultSpin.column === 2) count2++;
              if (resultSpin.column === 3) count3++;
              total++;
          }
      }
      let bestAffinityCol = null;
      if (total > 0) {
          const p1 = (count1 / total) * 100;
          const p2 = (count2 / total) * 100;
          const p3 = (count3 / total) * 100;
          let maxP = 0;
          if (p1 > maxP) { maxP = p1; bestAffinityCol = 1; }
          if (p2 > maxP) { maxP = p2; bestAffinityCol = 2; }
          if (p3 > maxP) { maxP = p3; bestAffinityCol = 3; }
          if (maxP < 35) bestAffinityCol = null;
      }

      // Pattern Logic
      const window4 = snapshotHistory.slice(0, 4);
      let patternTarget = null;
      if (window4.length >= 2 && window4[0].column !== 0 && window4[0].column === window4[1].column) {
          patternTarget = window4[0].column;
      } else if (window4.length >= 3 && window4[0].column !== 0 && window4[1].column !== 0 && window4[0].column === window4[2].column && window4[0].column !== window4[1].column) {
          patternTarget = window4[0].column;
      }

      // Heat Logic
      let heatTarget = null;
      let maxHeat = 0;
      for (let c=1; c<=3; c++) {
          const count = snapshotHistory.slice(0, 12).filter(s => s.column === c).length;
          const perc = (count / 12) * 100;
          if (perc >= 40 && perc > maxHeat) {
             maxHeat = perc;
             heatTarget = c;
          }
      }

      const scores = { 1: 0, 2: 0, 3: 0 };
      if (bestAffinityCol) scores[bestAffinityCol as 1|2|3] += 40;
      if (patternTarget) scores[patternTarget as 1|2|3] += 35;
      if (heatTarget) scores[heatTarget as 1|2|3] += 25;

      let finalTarget = null;
      let finalScore = 0;
      for (let c=1; c<=3; c++) {
          if (scores[c as 1|2|3] > finalScore) {
              finalScore = scores[c as 1|2|3];
              finalTarget = c;
          }
      }

      const isValidEntry = finalScore >= 65;
      const lastHitIndex = snapshotHistory.findIndex(s => s.column === finalTarget);
      const gap = lastHitIndex === -1 ? 99 : lastHitIndex;
      if (gap > 12) finalScore -= 50;

      return {
        target: finalTarget,
        isValid: isValidEntry && gap <= 12,
        score: finalScore
      };
  };

  const runSimulation = () => {
    const rawNumbers = inputValue.split(/[,\s\n]+/)
      .map(n => parseInt(n.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n <= 36);

    if (rawNumbers.length < 10) {
        alert("Insira pelo menos 10 números para uma simulação precisa.");
        return;
    }

    const chronoNumbers = [...rawNumbers].reverse();

    let simProfit = 0;
    let simWins = 0;
    let simLosses = 0;
    let simTotalEntries = 0;
    
    let currentTier = 0;
    let currentTargetCol: number | null = null;
    let currentInvested = 0;

    const simHistory: SpinResult[] = [];

    for(let i=0; i<5; i++) {
        if(i < chronoNumbers.length) {
            simHistory.unshift({
                number: chronoNumbers[i],
                column: getColumn(chronoNumbers[i]),
                timestamp: '00:00'
            });
        }
    }

    for (let i = 5; i < chronoNumbers.length; i++) {
        const num = chronoNumbers[i];
        const col = getColumn(num);

        if (currentTargetCol !== null) {
            const betAmount = progressionLevels[currentTier];
            currentInvested += betAmount;

            if (col === currentTargetCol) {
                const winAmount = betAmount * 3;
                simProfit += (winAmount - currentInvested);
                simWins++;
                simTotalEntries++;
                currentTargetCol = null;
                currentTier = 0;
                currentInvested = 0;
            } else {
                if (currentTier < 4) {
                    currentTier++;
                } else {
                    simProfit -= currentInvested;
                    simLosses++;
                    simTotalEntries++;
                    currentTargetCol = null;
                    currentTier = 0;
                    currentInvested = 0;
                }
            }
        } 
        
        if (currentTargetCol === null) {
             const analysis = analyzeSnapshot(simHistory);
             if (analysis.isValid && analysis.target) {
                 currentTargetCol = analysis.target;
                 currentTier = 0; 
             }
        }

        simHistory.unshift({
            number: num,
            column: col,
            timestamp: '00:00'
        });
    }

    let status: SimulationResult['status'] = 'BAD';
    if (simProfit > 0 && simLosses === 0) status = 'EXCELLENT';
    else if (simProfit > 0) status = 'GOOD';
    else if (simProfit < -20) status = 'CRITICAL';

    setSimResult({
        profit: simProfit,
        wins: simWins,
        losses: simLosses,
        totalEntries: simTotalEntries,
        status
    });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    
    const reader = new FileReader();
    reader.onloadend = async () => {
        try {
            const base64Data = reader.result as string;
            const base64Content = base64Data.split(',')[1];

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType: file.type,
                      data: base64Content
                    }
                  },
                  {
                    text: "Identify the roulette numbers in this image. Return a single comma-separated list of the numbers found, preserving their order. Output ONLY numbers and commas."
                  }
                ]
              }
            });

            const text = response.text;
            if (text) {
              const cleanText = text.replace(/[^0-9,]/g, '');
              setInputValue(cleanText);
            }
        } catch (error) {
            console.error("OCR Error:", error);
            alert("Erro ao processar imagem. Verifique se a chave API está configurada e se a imagem é válida.");
        } finally {
            setIsAnalyzing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    reader.onerror = () => {
        console.error("File Reader Error");
        alert("Erro ao ler o arquivo de imagem.");
        setIsAnalyzing(false);
    };

    reader.readAsDataURL(file);
  };

  const getNumberAffinity = useCallback((targetNum: number) => {
    if (history.length < 5) return { col1: 0, col2: 0, col3: 0, bestCol: null, confidence: 0 };

    let count1 = 0, count2 = 0, count3 = 0, total = 0;
    
    for (let i = 1; i < history.length; i++) {
        const prevSpin = history[i]; 
        const resultSpin = history[i-1]; 
        
        if (prevSpin.number === targetNum) {
            if (resultSpin.column === 1) count1++;
            if (resultSpin.column === 2) count2++;
            if (resultSpin.column === 3) count3++;
            total++;
        }
    }

    if (total === 0) return { col1: 0, col2: 0, col3: 0, bestCol: null, confidence: 0 };

    const p1 = (count1 / total) * 100;
    const p2 = (count2 / total) * 100;
    const p3 = (count3 / total) * 100;

    let bestCol = 0;
    let maxP = 0;
    if (p1 > maxP) { maxP = p1; bestCol = 1; }
    if (p2 > maxP) { maxP = p2; bestCol = 2; }
    if (p3 > maxP) { maxP = p3; bestCol = 3; }

    return { col1: p1, col2: p2, col3: p3, bestCol: maxP >= 35 ? bestCol : null, confidence: maxP };
  }, [history]);

  const analysis = useMemo(() => {
    if (history.length < 5) return null;
    const result = analyzeSnapshot(history);
    
    const affinity = getNumberAffinity(history[0].number);
    let patternTarget = null;
    let patternType = 'Indefinido';
    const window4 = history.slice(0, 4);
    if (window4.length >= 2 && window4[0].column !== 0 && window4[0].column === window4[1].column) {
        patternTarget = window4[0].column;
        patternType = 'Repetição (Fluxo)';
    } else if (window4.length >= 3 && window4[0].column !== 0 && window4[1].column !== 0 && window4[0].column === window4[2].column && window4[0].column !== window4[1].column) {
        patternTarget = window4[0].column;
        patternType = 'Zig-Zag (Alternância)';
    }
    let heatTarget = null;
    let maxHeat = 0;
    for (let c=1; c<=3; c++) {
        const count = history.slice(0, 12).filter(s => s.column === c).length;
        const perc = (count / 12) * 100;
        if (perc >= 40 && perc > maxHeat) { maxHeat = perc; heatTarget = c; }
    }
    
    return {
        ...result,
        affinity,
        patternType,
        patternTarget,
        heatTarget
    };
  }, [history, getNumberAffinity]);

  useEffect(() => {
    if (!isSessionStarted || history.length === 0) return;
    const latest = history[0];
    const spinCount = history.length;

    if (signal.isAwaitingResult && !signal.showOverlay && !signal.isPaused && spinCount !== lastProcessedSpinCount.current) {
      lastProcessedSpinCount.current = spinCount;
      
      if (latest.column === signal.targetColumn) {
        const betValue = progressionLevels[signal.progressionStep - 1];
        const winValue = betValue * 3;
        const netWin = winValue - signal.investedInCycle;
        const newBank = stats.currentBank + winValue;
        
        setStats(prev => ({
          ...prev, wins: prev.wins + 1, totalEntries: prev.totalEntries + 1,
          currentBank: newBank, profit: newBank - initialBank,
          dailyPercentage: ((newBank - initialBank) / initialBank) * 100
        }));
        
        setSignal(prev => ({ 
            ...prev, isAwaitingResult: false, progressionStep: 0, investedInCycle: 0, 
            status: SystemStatus.NO_SIGNAL, targetColumn: null, isPaused: false, vortexScore: 0 
        }));
        setShowResult({ type: 'WIN', value: netWin });
        audioService.playWin();
        setTimeout(() => setShowResult(null), 3000);
      } else {
        if (signal.progressionStep < 5) {
          setSignal(prev => ({ ...prev, progressionStep: prev.progressionStep + 1, isPaused: true }));
          audioService.playObservation();
        } else {
          const finalLoss = signal.investedInCycle;
          setStats(prev => ({ 
            ...prev, losses: prev.losses + 1, totalEntries: prev.totalEntries + 1,
            profit: prev.currentBank - initialBank,
            dailyPercentage: ((prev.currentBank - initialBank) / initialBank) * 100
          }));
          setSignal(prev => ({ 
              ...prev, isAwaitingResult: false, progressionStep: 0, investedInCycle: 0, 
              targetColumn: null, isPaused: false, vortexScore: 0 
          }));
          setShowResult({ type: 'LOSS', value: finalLoss });
          audioService.playLoss();
          setTimeout(() => setShowResult(null), 3000);
        }
      }
      return;
    }

    if (signal.isPaused) {
        setSignal(prev => ({ 
            ...prev, isPaused: false, showOverlay: true, status: SystemStatus.AUTHORIZED 
        }));
        return;
    }

    if (!signal.isAwaitingResult && analysis?.isValid) {
      setSignal(prev => ({
        ...prev, status: SystemStatus.AUTHORIZED, targetColumn: analysis.target,
        progressionStep: 1, isAwaitingResult: true, showOverlay: true,
        signalHealth: 100, isPaused: false, vortexScore: analysis.score
      }));
      audioService.playObservation();
    } else if (!signal.isAwaitingResult) {
      setSignal(prev => ({ 
        ...prev, status: SystemStatus.OBSERVATION, vortexScore: analysis ? analysis.score : 0 
      }));
    }
  }, [history.length, isSessionStarted, analysis, signal.isAwaitingResult, signal.isPaused, signal.progressionStep, signal.targetColumn, progressionLevels, initialBank, stats.currentBank]);

  const confirmBet = () => {
    const betValue = progressionLevels[signal.progressionStep - 1];
    setStats(prev => ({ ...prev, currentBank: prev.currentBank - betValue }));
    setSignal(prev => ({ ...prev, showOverlay: false, investedInCycle: prev.investedInCycle + betValue }));
    lastProcessedSpinCount.current = history.length;
  };

  const winRate = stats.totalEntries > 0 ? (stats.wins / stats.totalEntries) * 100 : 0;
  const currentBetValue = signal.progressionStep > 0 ? progressionLevels[signal.progressionStep - 1] : 0;

  const AffinityBadge = ({ num }: { num: number }) => {
     const aff = getNumberAffinity(num);
     if (!aff.bestCol) return null;
     return (
        <div className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded text-[9px] font-black border border-slate-700">
            <Magnet size={10} className="text-purple-400" />
            <span className="text-slate-400">Puxa</span>
            <span className="text-white">C{aff.bestCol}</span>
        </div>
     );
  };

  if (!isSessionStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
        <div className="bg-card w-full max-w-md rounded-[32px] p-10 border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 via-blue-500 to-purple-600"></div>
          <div className="flex flex-col items-center text-center">
             <div className="w-24 h-24 bg-purple-500/5 rounded-full flex items-center justify-center mb-8 border border-purple-500/20 animate-pulse">
                <Atom className="text-purple-500 animate-spin-slow" size={48} />
             </div>
             <h1 className="text-3xl font-black mb-2 tracking-tight">Vortex <span className="text-purple-500">5.0</span></h1>
             <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-10">Hybrid Core Logic</p>
             <div className="w-full space-y-6 text-left">
                <div className="group">
                   <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Banca Inicial (R$)</label>
                   <input type="number" value={initialBank} onChange={e => setInitialBank(Number(e.target.value))} className="w-full bg-black border border-slate-800 group-focus-within:border-purple-500 rounded-2xl py-4 px-6 font-black text-2xl outline-none transition-all" />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 ml-1">Valor da Entrada Inicial</label>
                   <div className="grid grid-cols-4 gap-3">
                      {[0.50, 1.00, 1.50, 2.50].map(val => (
                        <button key={val} onClick={() => setSelectedUnit(val)} className={`py-4 rounded-2xl font-black text-xs transition-all ${selectedUnit === val ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>R$ {val.toFixed(2)}</button>
                      ))}
                   </div>
                </div>
                <button onClick={handleStartSession} className="w-full bg-white hover:bg-slate-200 text-black py-5 rounded-[20px] font-black text-sm uppercase transition-all shadow-xl">Inicializar Sistema</button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center max-w-7xl mx-auto pb-20">
      {/* SIMULATION RESULT MODAL */}
      {simResult && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 backdrop-blur-md bg-black/90 animate-in fade-in duration-300">
           <div className={`w-full max-w-lg rounded-[32px] border-2 p-8 relative overflow-hidden shadow-2xl ${simResult.status === 'EXCELLENT' || simResult.status === 'GOOD' ? 'bg-[#100616] border-emerald-500 shadow-emerald-500/20' : 'bg-[#160606] border-rose-500 shadow-rose-500/20'}`}>
              <button onClick={() => setSimResult(null)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><XCircle size={28} /></button>
              
              <div className="flex flex-col items-center text-center mb-8">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${simResult.status === 'EXCELLENT' || simResult.status === 'GOOD' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                     {simResult.status === 'EXCELLENT' || simResult.status === 'GOOD' ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase mb-1">Diagnóstico da Mesa</h3>
                  <p className={`text-sm font-black uppercase tracking-widest ${simResult.status === 'EXCELLENT' ? 'text-emerald-400' : simResult.status === 'GOOD' ? 'text-teal-400' : 'text-rose-500'}`}>
                      {simResult.status === 'EXCELLENT' ? 'Mesa Mágica (Alta Performance)' : simResult.status === 'GOOD' ? 'Mesa Aprovada' : 'Mesa Perigosa (Evitar)'}
                  </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                 <div className="bg-black/40 rounded-xl p-4 border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Lucro Simulado</p>
                    <p className={`text-2xl font-black ${simResult.profit >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                        R$ {simResult.profit.toFixed(2)}
                    </p>
                 </div>
                 <div className="bg-black/40 rounded-xl p-4 border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Total Entradas</p>
                    <p className="text-2xl font-black text-white">{simResult.totalEntries}</p>
                 </div>
                 <div className="bg-black/40 rounded-xl p-4 border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Greens</p>
                    <p className="text-2xl font-black text-emerald-400">{simResult.wins}</p>
                 </div>
                 <div className="bg-black/40 rounded-xl p-4 border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Reds (G5)</p>
                    <p className="text-2xl font-black text-rose-500">{simResult.losses}</p>
                 </div>
              </div>
              
              <button onClick={() => setSimResult(null)} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase text-sm transition-all">Fechar Diagnóstico</button>
           </div>
        </div>
      )}

      {showResult && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 backdrop-blur-md bg-black/80 animate-in fade-in duration-300">
          <div className={`flex flex-col items-center p-16 rounded-[48px] border-4 shadow-2xl ${showResult.type === 'WIN' ? 'bg-[#100616] border-purple-500 shadow-purple-500/20' : 'bg-[#160606] border-rose-500 shadow-rose-500/20'}`}>
            <div className={`p-6 rounded-full mb-8 ${showResult.type === 'WIN' ? 'bg-purple-500 text-white' : 'bg-rose-500 text-white'}`}>
               {showResult.type === 'WIN' ? <Trophy size={64} /> : <XCircle size={64} />}
            </div>
            <h2 className="text-5xl font-black text-white uppercase mb-4 text-center">{showResult.type === 'WIN' ? 'GREEN' : 'RED'}</h2>
            <div className="px-12 py-4 bg-black/60 rounded-3xl text-4xl font-black text-white border border-white/5">{showResult.type === 'WIN' ? '+' : '-'} R$ {Math.abs(showResult.value).toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* ÁREA DE SINAL FIXA */}
      <div className="w-full bg-card rounded-[24px] border border-slate-800 shadow-2xl mb-8 sticky top-4 z-[100] overflow-hidden backdrop-blur-xl">
        <div className="bg-card-header px-8 py-5 flex justify-between items-center">
           <div className="flex items-center gap-4">
              <div className={`w-4 h-4 rounded-full ${signal.status === SystemStatus.AUTHORIZED ? 'bg-purple-500 animate-pulse shadow-[0_0_15px_#a855f7]' : signal.status === SystemStatus.OBSERVATION ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <div className="flex flex-col">
                 <span className={`text-[12px] font-black uppercase tracking-widest ${signal.status === SystemStatus.AUTHORIZED ? 'text-neon-purple' : signal.status === SystemStatus.OBSERVATION ? 'text-neon-amber' : 'text-neon-red'}`}>{signal.status}</span>
                 <span className="text-[9px] font-bold text-slate-600 uppercase">Vortex 5.0 Hybrid Engine</span>
              </div>
           </div>
           <div className="flex gap-12">
              <HeaderMetric label="Banca Real" value={`R$ ${stats.currentBank.toFixed(2)}`} color="text-white" />
              <HeaderMetric label="Lucro/Preju" value={`R$ ${stats.profit.toFixed(2)}`} color={stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              <HeaderMetric label="Assertividade" value={`${winRate.toFixed(1)}%`} color="text-purple-400" />
           </div>
        </div>

        {/* BARRA DE DETALHES DA PROGRESSÃO */}
        <div className="px-8 py-4 bg-black/40 flex items-center justify-between border-t border-slate-800/50">
           <div className="flex items-center gap-6">
              <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                    Ciclo {signal.progressionStep > 0 ? `- Nível ${signal.progressionStep}/5` : ''}
                  </span>
                  <div className="flex gap-2">
                     {[1, 2, 3, 4, 5].map(step => (
                       <div key={step} className={`h-2 w-8 rounded-full transition-all duration-500 ${signal.progressionStep >= step ? 'bg-purple-500 shadow-[0_0_8px_#a855f7]' : 'bg-slate-800'}`} />
                     ))}
                  </div>
              </div>
              {signal.progressionStep > 0 && (
                  <div className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg animate-pulse flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500 animate-ping"></div>
                      <span className="text-purple-500 font-black text-xs">G{signal.progressionStep} ATIVO</span>
                  </div>
              )}
           </div>

           <div className="flex items-center gap-5">
              <div className="flex flex-col items-end">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      {signal.targetColumn ? 'Entrada Atual' : 'Status'}
                  </span>
                  <div className="flex items-center gap-3">
                      {signal.targetColumn ? (
                          <>
                            <span className="text-white font-black text-lg uppercase">COLUNA {signal.targetColumn}</span>
                            {signal.progressionStep > 0 && (
                                <span className="text-purple-400 font-black text-lg bg-purple-500/5 px-3 py-0.5 rounded border border-purple-500/10">
                                    R$ {currentBetValue.toFixed(2)}
                                </span>
                            )}
                          </>
                      ) : (
                          <span className="text-slate-600 font-black text-sm uppercase">Aguardando Confluência...</span>
                      )}
                  </div>
              </div>
           </div>
        </div>
      </div>

      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-8">
           <section className="bg-card rounded-[28px] p-8 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Atom size={120} />
              </div>
              <div className="flex justify-between items-center mb-6 relative z-10">
                <h3 className={`text-sm font-black uppercase tracking-tight ${analysis?.isValid ? 'text-purple-500' : 'text-slate-400'}`}>Score Vortex</h3>
                <span className={`text-2xl font-black ${analysis?.score >= 65 ? 'text-purple-400' : 'text-slate-600'}`}>
                    {analysis?.score || 0}<span className="text-xs align-top text-slate-600">/100</span>
                </span>
              </div>
              
              <div className="space-y-4 relative z-10">
                 <p className="text-[10px] font-black text-slate-500 uppercase mb-4 tracking-widest">Fatores de Entrada</p>
                 
                 <ScoreItem 
                    label="Afinidade (Puxador)" 
                    value={analysis?.affinity.bestCol ? `COL ${analysis.affinity.bestCol} (${analysis.affinity.confidence.toFixed(0)}%)` : "Sem Dados"}
                    active={!!analysis?.affinity.bestCol} 
                    score={analysis?.affinity.bestCol ? 40 : 0}
                    icon={<Magnet size={14} />}
                 />
                 <ScoreItem 
                    label="Padrão (Micro)" 
                    value={analysis?.patternTarget ? `COL ${analysis.patternTarget} (${analysis.patternType})` : "Sem Padrão"}
                    active={!!analysis?.patternTarget} 
                    score={analysis?.patternTarget ? 35 : 0}
                    icon={<Binary size={14} />}
                 />
                 <ScoreItem 
                    label="Dominância (Macro)" 
                    value={analysis?.heatTarget ? `COL ${analysis.heatTarget} (>40%)` : "Neutro"}
                    active={!!analysis?.heatTarget} 
                    score={analysis?.heatTarget ? 25 : 0}
                    icon={<Flame size={14} />}
                 />
              </div>

              {analysis?.isValid && (
                  <div className="mt-8 pt-6 border-t border-slate-800/50">
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex items-center gap-3">
                          <CheckCircle2 className="text-purple-500" />
                          <div>
                              <p className="text-purple-400 text-xs font-black uppercase">Confluência Detectada</p>
                              <p className="text-slate-400 text-[10px] font-bold">Alvo Coluna {analysis.target} confirmado por múltiplos fatores.</p>
                          </div>
                      </div>
                  </div>
              )}
           </section>
        </div>

        <div className="lg:col-span-5 space-y-8">
           <section className="bg-card rounded-[28px] p-8 border border-slate-800 shadow-xl">
              <div className="grid grid-cols-6 gap-1.5 mb-8">
                 {[0, ...Array.from({length: 36}, (_, i) => i + 1)].map(n => (
                   <button key={n} onClick={() => addNumber(n)} className={`h-11 text-[12px] font-black rounded-xl border transition-all active:scale-90 ${n === 0 ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>{n}</button>
                 ))}
              </div>
              <textarea className="w-full bg-black border border-slate-800 rounded-2xl p-6 text-[13px] font-mono text-white focus:border-purple-500 outline-none h-40 mb-6 custom-scroll" placeholder="Ex: 21, 9, 10, 19..." value={inputValue} onChange={e => setInputValue(e.target.value)} />
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button onClick={pasteNumbers} className="bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-2xl font-black text-xs uppercase transition-all shadow-xl active:scale-95">Injetar Dados</button>
                <button onClick={runSimulation} className="bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-black text-xs uppercase transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
                    <FlaskConical size={16} /> Simular Backtest
                </button>
              </div>
              <div className="flex gap-4">
                 <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="flex-1 px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed h-12"
                 >
                    {isAnalyzing ? <Loader2 size={20} className="animate-spin text-purple-500" /> : <ImageIcon size={20} />}
                    {isAnalyzing ? 'Lendo...' : 'Ler Print'}
                 </button>
                 <button onClick={() => setHistory(prev => prev.slice(1))} className="w-20 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-500 hover:text-rose-500 transition-all h-12"><Trash2 size={22}/></button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
           </section>

           <section className="bg-card rounded-[28px] p-8 border border-slate-800 shadow-xl">
              <h3 className="text-[11px] font-black text-slate-400 uppercase mb-8 flex items-center gap-3 tracking-widest"><BarChart3 size={18} className="text-purple-500" /> Estatísticas Financeiras</h3>
              <div className="grid grid-cols-2 gap-5">
                 <MetricBox label="Lucro Líquido" value={`R$ ${stats.profit.toFixed(2)}`} color={stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
                 <MetricBox label="Banca em Conta" value={`R$ ${stats.currentBank.toFixed(2)}`} />
                 <MetricBox label="Ciclos Green" value={stats.wins} color="text-emerald-400" />
                 <MetricBox label="Ciclos Red" value={stats.losses} color="text-rose-400" />
              </div>
           </section>
        </div>

        <div className="lg:col-span-3">
           <section className="bg-card rounded-[28px] p-8 border border-slate-800 h-full flex flex-col shadow-xl">
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3"><HistoryIcon size={18} className="text-purple-500" /> Histórico</h3>
                 <button onClick={copyHistory} className="text-slate-500 hover:text-purple-400 transition-all flex items-center gap-2">
                    {copied ? <Check size={16} className="text-purple-500" /> : <Copy size={16} />}
                    <span className="text-[10px] font-black uppercase">{copied ? 'Copiado' : 'Exportar'}</span>
                 </button>
              </div>
              <div className="space-y-3 overflow-y-auto max-h-[780px] pr-3 custom-scroll flex-1">
                 {history.map((spin, i) => (
                   <div key={i} className="flex items-center justify-between p-4 bg-black/40 border border-slate-900 rounded-2xl hover:border-slate-800 transition-all">
                      <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border-2 ${spin.number === 0 ? 'bg-purple-600 border-purple-400/50 text-white' : [1,4,7,10,13,16,19,22,25,28,31,34].includes(spin.number) ? 'bg-rose-600 border-rose-400/50 text-white' : 'bg-slate-900 border-slate-800 text-white'}`}>{spin.number}</span>
                        <div className="flex flex-col gap-1">
                           <div className="flex items-center gap-2">
                               <span className="text-[11px] font-black text-slate-300 uppercase tracking-tight">COLUNA {spin.column || 'ZERO'}</span>
                               <AffinityBadge num={spin.number} />
                           </div>
                           <span className="text-[9px] font-bold text-slate-600">{spin.timestamp}</span>
                        </div>
                      </div>
                   </div>
                 ))}
              </div>
           </section>
        </div>
      </div>

      {signal.showOverlay && (
        <div className="fixed inset-0 z-[500] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-8 animate-in zoom-in-95 duration-300">
           <div className={`bg-card border-2 border-purple-500 rounded-[56px] p-12 max-w-xl w-full text-center relative overflow-hidden shadow-[0_0_100px_rgba(168,85,247,0.15)]`}>
              <div className="w-24 h-24 bg-purple-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 mt-6 border border-purple-500/20 shadow-inner">
                 <Target size={48} className="text-purple-500" />
              </div>
              <h2 className="text-3xl font-black text-white uppercase mb-2 tracking-tighter">Entrada Vortex</h2>
              <div className="max-w-[300px] mx-auto mb-10">
                 <div className="flex justify-between items-center mb-2.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Score de Confiança</span>
                    <span className="text-[11px] font-black text-purple-400">{signal.vortexScore}/100</span>
                 </div>
                 <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: `${signal.vortexScore}%` }} />
                 </div>
              </div>
              <div className="bg-black/50 border border-slate-800 rounded-[40px] p-12 mb-10">
                 <p className="text-[12px] font-black text-purple-500 uppercase mb-4 tracking-widest opacity-80">Apostar na Coluna</p>
                 <h1 className="text-[180px] font-black text-white leading-none tracking-tighter">{signal.targetColumn}</h1>
              </div>
              <div className="grid grid-cols-2 gap-5 mb-10 text-left">
                 <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Valor Atual (G{signal.progressionStep})</p>
                    <p className="text-2xl font-black text-white">R$ {progressionLevels[signal.progressionStep - 1].toFixed(2)}</p>
                 </div>
                 <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Total no Ciclo</p>
                    <p className="text-2xl font-black text-rose-400">R$ {(signal.investedInCycle + progressionLevels[signal.progressionStep - 1]).toFixed(2)}</p>
                 </div>
              </div>
              <button onClick={confirmBet} className="w-full py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-[24px] font-black text-lg uppercase transition-all shadow-2xl active:scale-95 shadow-purple-500/20">Confirmar</button>
           </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="w-full mt-12 grid grid-cols-1 md:grid-cols-4 gap-5">
         <FooterCard icon={<TrendingUp size={20} className="text-purple-500" />} label="Padrão Ativo" value={analysis?.patternType || "NENHUM"} />
         <FooterCard icon={<Magnet size={20} className="text-sky-500" />} label="Puxador (Afinidade)" value={analysis?.affinity.bestCol ? `COLUNA ${analysis.affinity.bestCol}` : "N/A"} />
         <FooterCard icon={<Atom size={20} className="text-purple-400" />} label="Hybrid Score" value={analysis ? `${analysis.score}/100` : "--"} />
         <button onClick={handleResetSession} className="bg-slate-900/40 hover:bg-rose-500/10 border border-slate-800 text-slate-600 hover:text-rose-500 p-6 rounded-[24px] transition-all flex items-center justify-center gap-4 font-black text-[11px] uppercase tracking-widest">
            <RotateCcw size={18} /> Zerar Sistema
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

const ScoreItem: React.FC<{ label: string; value: string; active: boolean; score: number; icon: React.ReactNode }> = ({ label, value, active, score, icon }) => (
  <div className={`flex items-center justify-between py-2 transition-all ${active ? 'text-white' : 'text-slate-700 opacity-40'}`}>
     <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${active ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'border-slate-800 bg-black/40'}`}>
           {icon}
        </div>
        <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{label}</span>
            <span className={`text-[11px] font-bold uppercase tracking-tight ${active ? 'opacity-100' : 'opacity-40'}`}>{value}</span>
        </div>
     </div>
     <div className={`px-2 py-1 rounded text-[10px] font-black ${active ? 'bg-purple-500 text-white' : 'bg-slate-900 text-slate-700'}`}>
         +{score} pts
     </div>
  </div>
);

export default App;
