"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Check, X, ExternalLink, Repeat, Play, ChevronLeft, ChevronRight, Bug, Undo2, Clock, RotateCcw, Brain, Loader2, AlertCircle } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, updateTask, handleApiCall, reopenTask, updateTaskDeadline } from "@/lib/todoistApi";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, formatDateForDisplay } from "@/lib/utils";
import SetDeadlineDialog from "@/components/SetDeadlineDialog";
import { SEITON_PROGRESS_KEY, SEITON_LAST_RANKING_KEY, SEITON_MODE_KEY, SEITON_COMPARISON_HISTORY_PROFESSIONAL_KEY, SEITON_COMPARISON_HISTORY_PERSONAL_KEY } from "@/lib/constants";
import { classifyTaskContext } from "@/lib/aiUtils"; // Importar do novo utilitário

const RANKING_SIZE = 24; // P1 (4) + P2 (20)

type SeitonStep = 'loading' | 'modeSelection' | 'tournamentComparison' | 'result'; // Added 'modeSelection'

interface ComparisonEntry {
  challengerId: string;
  opponentId: string;
  challengerContent: string;
  opponentContent: string;
  winner: 'challenger' | 'opponent' | 'N/A';
  action: string;
  timestamp: string;
}

// A interface SeitonProgress agora não inclui comparisonHistory, pois será salvo separadamente
interface SeitonProgress {
  tournamentQueue: TodoistTask[];
  rankedTasks: TodoistTask[];
  p3Tasks: TodoistTask[];
  currentStep: Exclude<SeitonStep, 'modeSelection'>; // Exclude modeSelection from saved progress
  currentChallenger: TodoistTask | null;
  currentOpponentIndex: number | null;
  seitonMode: 'professional' | 'personal' | null; // Save the mode with progress
}

interface UndoState {
  type: 'compare' | 'cancel';
  snapshotTournamentQueue: TodoistTask[];
  snapshotRankedTasks: TodoistTask[];
  snapshotP3Tasks: TodoistTask[];
  snapshotCurrentChallenger: TodoistTask | null;
  snapshotCurrentOpponentIndex: number | null;
  cancelledTaskId?: string;
}

const SEITONPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<SeitonStep>('loading');
  const [tournamentQueue, setTournamentQueue] = useState<TodoistTask[]>([]);
  const [rankedTasks, setRankedTasks] = useState<TodoistTask[]>([]);
  const [p3Tasks, setP3Tasks] = useState<TodoistTask[]>([]);
  
  const [currentChallenger, setCurrentChallenger] = useState<TodoistTask | null>(null);
  const [currentOpponentIndex, setCurrentOpponentIndex] = useState<number | null>(null);
  
  const [seitonMode, setSeitonMode] = useState<'professional' | 'personal' | null>(null); // New state for mode
  
  // comparisonHistory now depends on seitonMode
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonEntry[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const [lastUndoableAction, setLastUndoableAction] = useState<UndoState | null>(null);

  const [showSetDeadlineDialog, setShowSetDeadlineDialog] = useState(false);
  const [taskToSetDeadline, setTaskToSetDeadline] = useState<TodoistTask | null>(null);

  // Novo estado para armazenar o vencedor do último embate entre as tarefas atuais
  const [lastWinnerInCurrentComparison, setLastWinnerInCurrentComparison] = useState<'challenger' | 'opponent' | null>(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; // Para verificar se a chave está configurada
  const [aiClassificationQuotaExceeded, setAiClassificationQuotaExceeded] = useState(false); // Novo estado para quota

  useEffect(() => {
    console.log("SEITONPage mounted.");
    return () => console.log("SEITONPage unmounted.");
  }, []);

  useEffect(() => {
    console.log("SEITONPage - currentStep changed to:", currentStep);
    console.log("SEITONPage - currentChallenger:", currentChallenger?.content || "Nenhum");
    console.log("SEITONPage - currentOpponentIndex:", currentOpponentIndex);
    console.log("SEITONPage - rankedTasks length:", rankedTasks.length, "Contents:", rankedTasks.map(t => `${t.content} (Prio: ${t.priority})`));
    console.log("SEITONPage - p3Tasks length:", p3Tasks.length, "Contents:", p3Tasks.map(t => `${t.content} (Prio: ${t.priority})`));
    console.log("SEITONPage - tournamentQueue length:", tournamentQueue.length, "Contents:", tournamentQueue.map(t => `${t.content} (Prio: ${t.priority})`));
    console.log("SEITONPage - seitonMode:", seitonMode);
  }, [currentStep, currentChallenger, currentOpponentIndex, rankedTasks, p3Tasks, tournamentQueue, seitonMode]);

  const getComparisonHistoryKey = useCallback((mode: 'professional' | 'personal') => {
    return mode === 'professional' ? SEITON_COMPARISON_HISTORY_PROFESSIONAL_KEY : SEITON_COMPARISON_HISTORY_PERSONAL_KEY;
  }, []);

  const saveProgress = useCallback(() => {
    if (!seitonMode) return; // Don't save if mode is not set

    const progress: SeitonProgress = {
      tournamentQueue,
      rankedTasks,
      p3Tasks,
      currentStep: currentStep === 'modeSelection' ? 'loading' : currentStep, // Don't save modeSelection as a step
      currentChallenger,
      currentOpponentIndex,
      seitonMode, // Save the current mode
    };
    localStorage.setItem(SEITON_PROGRESS_KEY, JSON.stringify(progress));
    localStorage.setItem(getComparisonHistoryKey(seitonMode), JSON.stringify(comparisonHistory)); // Save the specific history
    console.log("SEITONPage - Progress saved:", progress);
    console.log(`SEITONPage - Comparison history for ${seitonMode} mode saved:`, comparisonHistory);
  }, [tournamentQueue, rankedTasks, p3Tasks, currentStep, currentChallenger, currentOpponentIndex, seitonMode, comparisonHistory, getComparisonHistoryKey]);

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 4: return "text-red-600";
      case 3: return "text-yellow-600";
      case 2: return "text-blue-600";
      case 1: return "text-gray-600";
      default: return "text-gray-600";
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 4: return "P1 (Urgente)";
      case 3: return "P2 (Alta)";
      case 2: return "P3 (Média)";
      case 1: return "P4 (Baixa)";
      default: return "Sem Prioridade";
    }
  };

  const updateTaskAndReturn = useCallback(async (task: TodoistTask, newPriority: number): Promise<TodoistTask> => {
    if (task.priority === newPriority) {
      return task; // No update needed
    }
    try {
      const updatedTask = await updateTask(task.id, { priority: newPriority });
      return { ...task, priority: updatedTask.priority };
    } catch (error) {
      console.error(`Failed to update priority for task ${task.id}:`, error);
      showError(`Falha ao atualizar prioridade da tarefa "${task.content}".`);
      return task; // Return original task on error
    }
  }, []);

  const fetchAndSetupTasks = useCallback(async (mode: 'professional' | 'personal') => {
    setLoading(true);
    setAiClassificationQuotaExceeded(false); // Resetar o estado da quota
    console.log(`SEITONPage - fetchAndSetupTasks: Starting API call to get ALL eligible tasks for ${mode} mode.`);
    
    if (!GEMINI_API_KEY) {
      showError("Chave da API do Gemini não configurada. Não é possível classificar tarefas.");
      setLoading(false);
      setCurrentStep('modeSelection'); // Voltar para seleção de modo ou mostrar erro
      return;
    }

    try {
      // Buscar TODAS as tarefas elegíveis, sem filtro de #pessoal ou #profissional
      const fetchedTasks = await handleApiCall(() => getTasks("(today | overdue | no due date)"), `Carregando tarefas para o modo ${mode === 'professional' ? 'Profissional' : 'Pessoal'}...`);
      
      if (!fetchedTasks) {
        showError("Não foi possível carregar as tarefas do Todoist.");
        navigate("/main-menu");
        return;
      }
      console.log(`SEITONPage - Fetched ${fetchedTasks.length} raw tasks.`);

      // Classificar cada tarefa usando a IA
      const tasksWithContextPromises = fetchedTasks.map(async task => {
        const contextType = await classifyTaskContext(task);
        console.log(`SEITONPage - Task "${task.content}" classified as: ${contextType}`);
        return { ...task, contextType };
      });
      const classifiedTasks = await Promise.all(tasksWithContextPromises);
      console.log(`SEITONPage - Classified ${classifiedTasks.length} tasks.`);
      
      const contextCounts = classifiedTasks.reduce((acc, task) => {
        acc[task.contextType || 'indefinido'] = (acc[task.contextType || 'indefinido'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log("SEITONPage - Context classification distribution:", contextCounts);

      // Verificar se houve falhas na classificação da IA (retornou 'indefinido' e a chave está presente)
      const anyIndefinidoDueToAI = classifiedTasks.some(task => task.contextType === 'indefinido');
      if (anyIndefinidoDueToAI && GEMINI_API_KEY) {
        setAiClassificationQuotaExceeded(true);
        showError("Algumas tarefas não puderam ser classificadas pela IA (possível limite de quota da API Gemini).");
      }


      // Filtrar tarefas ativas e relevantes para o modo selecionado
      const activeTasksForMode = classifiedTasks
        .filter((task: TodoistTask) => {
          const excludedByTriage = shouldExcludeTaskFromTriage(task);
          if (excludedByTriage) {
            console.log(`SEITONPage - Excluded by triage: ${task.content}`);
          }
          return !excludedByTriage;
        })
        .filter((task: TodoistTask) => {
          const isCompleted = task.is_completed || (task as any).completed;
          if (isCompleted) {
            console.log(`SEITONPage - Excluded by completion: ${task.content}`);
          }
          return !isCompleted;
        })
        .filter((task: TodoistTask) => {
          const matchesMode = task.contextType === mode;
          if (!matchesMode) {
            console.log(`SEITONPage - Excluded by mode mismatch: ${task.content} (Context: ${task.contextType}, Mode: ${mode})`);
          }
          return matchesMode;
        })
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          const deadlineA = a.deadline?.date ? parseISO(a.deadline.date) : null;
          const deadlineB = b.deadline?.date ? parseISO(b.deadline.date) : null;
          const isValidDeadlineA = deadlineA && isValid(deadlineA);
          const isValidDeadlineB = deadlineB && isValid(deadlineB);
          if (isValidDeadlineA && isValidDeadlineB) return deadlineA!.getTime() - deadlineB!.getTime();
          if (isValidDeadlineA) return -1;
          if (isValidDeadlineB) return 1;
          const dateA = a.due?.date ? parseISO(a.due.date) : null;
          const dateB = b.due?.date ? parseISO(b.due.date) : null;
          const isValidDateA = dateA && isValid(dateA);
          const isValidDateB = dateB && isValid(dateB);
          if (isValidDateA && isValidDateB) return dateA!.getTime() - dateB!.getTime();
          if (isValidDateA) return -1;
          if (isValidDateB) return 1;
          return 0;
        });
      console.log(`SEITONPage - Filtered to ${activeTasksForMode.length} active tasks for ${mode} mode.`);

      const savedProgressRaw = localStorage.getItem(SEITON_PROGRESS_KEY);
      const comparisonHistoryKey = getComparisonHistoryKey(mode);
      const savedComparisonHistoryRaw = localStorage.getItem(comparisonHistoryKey);

      if (savedProgressRaw) {
        const loaded: SeitonProgress = JSON.parse(savedProgressRaw);
        // Only load if the saved mode matches the current mode
        if (loaded.seitonMode === mode) {
          const currentTournamentQueue = loaded.tournamentQueue.filter((task: TodoistTask) => activeTasksForMode.some(at => at.id === task.id));
          const currentRankedTasks = loaded.rankedTasks.filter((task: TodoistTask) => activeTasksForMode.some(at => at.id === task.id));
          const currentP3Tasks = loaded.p3Tasks.filter((task: TodoistTask) => activeTasksForMode.some(at => at.id === task.id));
          const currentChallenger = loaded.currentChallenger && activeTasksForMode.some(at => at.id === loaded.currentChallenger.id) ? loaded.currentChallenger : null;
          
          setTournamentQueue(currentTournamentQueue);
          setRankedTasks(currentRankedTasks);
          setP3Tasks(currentP3Tasks);
          setCurrentChallenger(currentChallenger);
          setCurrentOpponentIndex(loaded.currentOpponentIndex);
          setCurrentStep(loaded.currentStep);
          setSeitonMode(loaded.seitonMode); // Ensure mode is set from loaded progress
          setLastUndoableAction(null);

          if (savedComparisonHistoryRaw) {
            try {
              setComparisonHistory(JSON.parse(savedComparisonHistoryRaw));
            } catch (e) {
              console.error(`Error parsing comparison history for ${mode} mode from localStorage:`, e);
              setComparisonHistory([]);
            }
          } else {
            setComparisonHistory([]);
          }

          if (currentTournamentQueue.length === 0 && currentRankedTasks.length === 0 && currentP3Tasks.length === 0 && !currentChallenger) {
            showSuccess("Nenhuma tarefa ativa para planejar hoje. Bom trabalho!");
            setCurrentStep('result');
            localStorage.removeItem(SEITON_PROGRESS_KEY);
          } else if (loaded.currentStep === 'tournamentComparison' && currentChallenger && currentRankedTasks.length > 0) {
            // Ensure opponent index is valid if we're resuming a comparison
            setCurrentOpponentIndex(Math.min(RANKING_SIZE - 1, currentRankedTasks.length - 1));
          }
          console.log("SEITONPage - Loaded saved progress and resumed.");
          return; // Exit after loading saved progress
        } else {
          console.log("SEITONPage - Saved progress found but mode mismatch. Starting new tournament for selected mode.");
          // Fall through to new tournament setup if mode doesn't match
        }
      }
      
      // No saved progress for this mode, or mode mismatch, start a new tournament
      console.log(`SEITONPage - Starting new tournament for ${mode} mode.`);
      setTournamentQueue(activeTasksForMode);
      setRankedTasks([]);
      setP3Tasks([]);
      setCurrentChallenger(null);
      setCurrentOpponentIndex(null);
      setComparisonHistory([]); // Reset history for new session
      setLastUndoableAction(null);
      setCurrentStep('tournamentComparison');
      setSeitonMode(mode); // Set the mode for the new session
      if (activeTasksForMode.length === 0) {
        showSuccess("Nenhuma tarefa ativa para planejar hoje. Bom trabalho!");
        setCurrentStep('result');
      }
    } catch (error) {
      console.error("SEITONPage - Uncaught error in fetchAndSetupTasks:", error);
      showError("Ocorreu um erro inesperado ao carregar as tarefas.");
      navigate("/main-menu");
    } finally {
      setLoading(false);
    }
  }, [navigate, getComparisonHistoryKey, updateTaskAndReturn, classifyTaskContext, GEMINI_API_KEY]);

  useEffect(() => {
    // Initial load: check for saved mode or prompt for selection
    const savedProgressRaw = localStorage.getItem(SEITON_PROGRESS_KEY);
    if (savedProgressRaw) {
      try {
        const loaded: SeitonProgress = JSON.parse(savedProgressRaw);
        if (loaded.seitonMode) {
          setSeitonMode(loaded.seitonMode);
          fetchAndSetupTasks(loaded.seitonMode);
          return;
        }
      } catch (e) {
        console.error("Error parsing saved progress on initial load:", e);
        localStorage.removeItem(SEITON_PROGRESS_KEY); // Clear corrupted progress
      }
    }
    // If no valid saved mode, prompt for selection
    setCurrentStep('modeSelection');
    setLoading(false);
  }, [fetchAndSetupTasks]); // Only run once on mount

  useEffect(() => {
    if (!loading && seitonMode) { // Don't save progress during initial AI ranking or if mode isn't set
      saveProgress();
    }
  }, [tournamentQueue, rankedTasks, p3Tasks, currentStep, currentChallenger, currentOpponentIndex, comparisonHistory, loading, saveProgress, seitonMode]);

  // Função para encontrar o último vencedor entre duas tarefas
  const findLastWinner = useCallback((cId: string, oId: string): 'challenger' | 'opponent' | null => {
    // Procura no histórico por uma correspondência direta ou invertida
    const found = comparisonHistory.find(entry =>
      (entry.challengerId === cId && entry.opponentId === oId) ||
      (entry.challengerId === oId && entry.opponentId === cId)
    );

    if (found) {
      if (found.challengerId === cId && found.opponentId === oId) {
        return found.winner; // O desafiante atual era o desafiante no passado
      } else if (found.challengerId === oId && found.opponentId === cId) {
        // O desafiante atual era o oponente no passado, e vice-versa
        return found.winner === 'challenger' ? 'opponent' : 'challenger';
      }
    }
    return null;
  }, [comparisonHistory]);

  const startNextTournamentComparison = useCallback(async () => {
    console.log("SEITONPage - startNextTournamentComparison called.");
    setLastWinnerInCurrentComparison(null); // Resetar o último vencedor

    if (tournamentQueue.length === 0) {
      console.log("SEITONPage - Tournament queue is empty, moving to result.");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
      return;
    }

    const nextChallenger = tournamentQueue[0];
    setCurrentChallenger(nextChallenger);
    console.log("SEITONPage - Next Challenger:", nextChallenger.content);

    if (rankedTasks.length === 0) {
      console.log("SEITONPage - Ranked tasks is empty, adding challenger directly.");
      const updatedChallenger = await updateTaskAndReturn(nextChallenger, 4);
      setRankedTasks(prev => [...prev, updatedChallenger]);
      setTournamentQueue(prevQueue => prevQueue.slice(1));
      setCurrentChallenger(null);
      return;
    }

    const opponentIndex = Math.min(RANKING_SIZE - 1, rankedTasks.length - 1);
    setCurrentOpponentIndex(opponentIndex);
    setCurrentStep('tournamentComparison');
    console.log("SEITONPage - Starting comparison. Opponent Index:", opponentIndex, "Opponent:", rankedTasks[opponentIndex]?.content);

    // Verificar o histórico de comparações para as tarefas atuais
    if (nextChallenger && rankedTasks[opponentIndex]) {
      const winner = findLastWinner(nextChallenger.id, rankedTasks[opponentIndex].id);
      setLastWinnerInCurrentComparison(winner);
    }

  }, [tournamentQueue, rankedTasks, updateTaskAndReturn, findLastWinner]);

  useEffect(() => {
    console.log("SEITONPage - Flow management effect triggered. Current step:", currentStep, "Challenger:", currentChallenger?.content || "Nenhum", "Queue length:", tournamentQueue.length);
    const handleFlow = async () => {
      if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length > 0) {
        console.log("SEITONPage - Flow: No current challenger, queue has tasks. Starting next comparison.");
        await startNextTournamentComparison();
      } else if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length === 0) {
        console.log("SEITONPage - Flow: No current challenger, queue is empty. Tournament finished.");
        setCurrentStep('result');
      }
    };
    handleFlow();
  }, [currentStep, currentChallenger, tournamentQueue.length, startNextTournamentComparison]);

  const handleTournamentComparison = useCallback(async (challengerWins: boolean) => {
    if (!currentChallenger || currentOpponentIndex === null) {
      console.error("SEITONPage - handleTournamentComparison: Invalid state for comparison.");
      return;
    }

    setLastUndoableAction({
      type: 'compare',
      snapshotTournamentQueue: tournamentQueue,
      snapshotRankedTasks: rankedTasks,
      snapshotP3Tasks: p3Tasks,
      snapshotCurrentChallenger: currentChallenger,
      snapshotCurrentOpponentIndex: currentOpponentIndex,
    });

    console.log(`SEITONPage - handleTournamentComparison: Challenger wins? ${challengerWins}. Challenger: ${currentChallenger.content}, Opponent Index: ${currentOpponentIndex}`);

    const opponentTask = rankedTasks[currentOpponentIndex];
    let newRankedTasks = [...rankedTasks];
    let newP3Tasks = [...p3Tasks];
    let actionDescription = "";

    newRankedTasks = newRankedTasks.filter(t => t.id !== currentChallenger.id);
    newP3Tasks = newP3Tasks.filter(t => t.id !== currentChallenger.id);

    let challengerFinished = false;

    if (challengerWins) {
      console.log("SEITONPage - Challenger wins, attempting to move up.");
      newRankedTasks.splice(currentOpponentIndex, 0, currentChallenger);

      if (newRankedTasks.length > RANKING_SIZE) {
        const pushedOutTask = newRankedTasks.pop();
        if (pushedOutTask) {
          const updatedPushedOutTask = await updateTaskAndReturn(pushedOutTask, 2);
          newP3Tasks.push(updatedPushedOutTask);
          actionDescription += ` Tarefa "${pushedOutTask.content}" movida para P3.`;
          console.log(`SEITONPage - Ranked list full, pushed out ${pushedOutTask.content} to P3.`);
        }
      }
      
      const nextOpponentIndexCandidate = currentOpponentIndex - 1;
      if (nextOpponentIndexCandidate < 0) {
        console.log("SEITONPage - Challenger reached top (P1).");
        actionDescription += ` Desafiante "${currentChallenger.content}" alcançou P1.`;
        challengerFinished = true;
      } else {
        console.log(`SEITONPage - Challenger continues to fight, next opponent index: ${nextOpponentIndexCandidate}`);
        setCurrentOpponentIndex(nextOpponentIndexCandidate);
        actionDescription += ` Desafiante "${currentChallenger.content}" inserido na posição ${currentOpponentIndex + 1} e continua a lutar contra "${newRankedTasks[nextOpponentIndexCandidate]?.content || 'o topo'}".`;
      }
    } else {
      console.log("SEITONPage - Opponent wins, challenger loses. Placing challenger below opponent.");
      
      newRankedTasks.splice(currentOpponentIndex + 1, 0, currentChallenger);
      actionDescription = `Oponente "${opponentTask.content}" venceu. Desafiante "${currentChallenger.content}" inserido abaixo do oponente.`;

      if (newRankedTasks.length > RANKING_SIZE) {
        const pushedOutTask = newRankedTasks.pop();
        if (pushedOutTask) {
          const updatedPushedOutTask = await updateTaskAndReturn(pushedOutTask, 2);
          newP3Tasks.push(updatedPushedOutTask);
          actionDescription += ` Tarefa "${pushedOutTask.content}" movida para P3.`;
          console.log(`SEITONPage - Ranked list full, pushed out ${pushedOutTask.content} to P3.`);
        }
      }
      challengerFinished = true;
    }

    console.log("SEITONPage - Re-evaluating priorities for remaining ranked tasks.");
    
    const finalRankedTasksPromises = newRankedTasks.map(async (task, index) => {
        let targetPriority = 2;
        if (index < 4) {
            targetPriority = 4;
        } else if (index < RANKING_SIZE) {
            targetPriority = 3;
        }
        return updateTaskAndReturn(task, targetPriority);
    });

    const finalP3TasksPromises = newP3Tasks.map(task => updateTaskAndReturn(task, 2));

    const [resolvedRankedTasks, resolvedP3Tasks] = await Promise.all([
        Promise.all(finalRankedTasksPromises),
        Promise.all(finalP3TasksPromises)
    ]);

    newRankedTasks = resolvedRankedTasks.filter(Boolean) as TodoistTask[];
    newP3Tasks = resolvedP3Tasks.filter(Boolean) as TodoistTask[];

    console.log("SEITONPage - Final state of lists before setting state:");
    console.log("  newRankedTasks (contents):", newRankedTasks.map(t => `${t.content} (Prio: ${t.priority})`));
    console.log("  newP3Tasks (contents):", newP3Tasks.map(t => `${t.content} (Prio: ${t.priority})`));

    setRankedTasks(newRankedTasks);
    setP3Tasks(newP3Tasks);

    setComparisonHistory(prevHistory => [
      {
        challengerId: currentChallenger.id, // Usar ID
        opponentId: opponentTask.id,       // Usar ID
        challengerContent: currentChallenger.content,
        opponentContent: opponentTask.content,
        winner: challengerWins ? 'challenger' : 'opponent',
        action: actionDescription,
        timestamp: format(new Date(), "HH:mm:ss", { locale: ptBR }),
      },
      ...prevHistory,
    ].slice(0, 100)); // Manter um histórico maior para consultas

    console.log("SEITONPage - After comparison. New Ranked:", newRankedTasks.map(t => t.content), "New P3:", newP3Tasks.map(t => t.content));

    if (challengerFinished) {
      console.log("SEITONPage - Challenger finished its journey. Moving to next challenger from queue.");
      setCurrentChallenger(null);
      setCurrentOpponentIndex(null);
      setTournamentQueue(prev => prev.slice(1));
    }
    
    if (tournamentQueue.length === 0 && currentChallenger === null) {
      console.log("SEITONPage - Tournament finished, moving to result.");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
    }

    setLastWinnerInCurrentComparison(null); // Resetar após a comparação
  }, [currentChallenger, currentOpponentIndex, rankedTasks, p3Tasks, tournamentQueue, updateTaskAndReturn, setLastUndoableAction, setComparisonHistory]);

  const handleCancelTask = useCallback(async (taskIdToCancel: string) => {
    if (!currentChallenger && currentOpponentIndex === null) {
        showError("Não há tarefa para cancelar no momento.");
        return;
    }

    const currentOpponent = currentOpponentIndex !== null ? rankedTasks[currentOpponentIndex] : null;
    const isChallengerCancelled = currentChallenger?.id === taskIdToCancel;
    const isOpponentCancelled = currentOpponent && currentOpponent.id === taskIdToCancel;

    if (!isChallengerCancelled && !isOpponentCancelled) {
        console.warn("Attempted to cancel a task not currently in comparison:", taskIdToCancel);
        showError("A tarefa selecionada para cancelar não está em comparação.");
        return;
    }

    setLastUndoableAction({
      type: 'cancel',
      snapshotTournamentQueue: tournamentQueue,
      snapshotRankedTasks: rankedTasks,
      snapshotP3Tasks: p3Tasks,
      snapshotCurrentChallenger: currentChallenger,
      snapshotCurrentOpponentIndex: currentOpponentIndex,
      cancelledTaskId: taskIdToCancel,
    });

    const success = await handleApiCall(
        () => completeTask(taskIdToCancel),
        "Cancelando tarefa...",
        "Tarefa cancelada com sucesso!"
    );

    if (success) {
        showSuccess(`Tarefa "${isChallengerCancelled ? currentChallenger?.content : currentOpponent?.content || 'desconhecida'}" cancelada.`);

        if (isChallengerCancelled) {
            setTournamentQueue(prevQueue => prevQueue.filter(task => task.id !== taskIdToCancel));
            setCurrentChallenger(null);
            setCurrentOpponentIndex(null);
        } else if (isOpponentCancelled) {
            setRankedTasks(prevRanked => prevRanked.filter(task => task.id !== taskIdToCancel));
        }

        setComparisonHistory(prevHistory => [
            {
                challengerId: currentChallenger?.id || "N/A", // Usar ID
                opponentId: isOpponentCancelled ? currentOpponent?.id || "N/A" : "N/A", // Usar ID
                challengerContent: currentChallenger?.content || "N/A",
                opponentContent: isOpponentCancelled ? currentOpponent?.content || "N/A" : "N/A",
                winner: 'N/A',
                action: `Tarefa "${isChallengerCancelled ? currentChallenger?.content : currentOpponent?.content || 'desconhecida'}" cancelada.`,
                timestamp: format(new Date(), "HH:mm:ss", { locale: ptBR }),
            },
            ...prevHistory,
        ].slice(0, 100));
    } else {
        showError("Falha ao cancelar a tarefa.");
        setLastUndoableAction(null);
    }

    setLastWinnerInCurrentComparison(null); // Resetar após a ação
}, [currentChallenger, currentOpponentIndex, rankedTasks, completeTask, tournamentQueue, p3Tasks, setLastUndoableAction, setComparisonHistory]);

  const handleUndo = useCallback(async () => {
    if (!lastUndoableAction) {
      showError("Não há ação para desfazer.");
      return;
    }

    setLoading(true);

    try {
      if (lastUndoableAction.type === 'cancel' && lastUndoableAction.cancelledTaskId) {
        const success = await handleApiCall(
          () => reopenTask(lastUndoableAction.cancelledTaskId!),
          "Desfazendo cancelamento...",
          "Tarefa restaurada no Todoist!"
        );
        if (!success) {
          throw new Error("Falha ao reabrir a tarefa no Todoist.");
        }
      }
      setTournamentQueue(lastUndoableAction.snapshotTournamentQueue);
      setRankedTasks(lastUndoableAction.snapshotRankedTasks);
      setP3Tasks(lastUndoableAction.snapshotP3Tasks);
      setCurrentChallenger(lastUndoableAction.snapshotCurrentChallenger);
      setCurrentOpponentIndex(lastUndoableAction.snapshotCurrentOpponentIndex);
      setCurrentStep('tournamentComparison');

      setLastUndoableAction(null);
      showSuccess("Ação desfeita com sucesso!");
    } catch (error: any) {
      console.error("Erro ao desfazer ação:", error);
      showError(`Falha ao desfazer ação: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [lastUndoableAction, reopenTask, setLoading, setTournamentQueue, setRankedTasks, setP3Tasks, setCurrentChallenger, setCurrentOpponentIndex, setCurrentStep]);

  const handleOpenSetDeadlineDialog = useCallback((task: TodoistTask) => {
    setTaskToSetDeadline(task);
    setShowSetDeadlineDialog(true);
  }, []);

  const handleSaveDeadline = useCallback(async (newDeadlineDate: string | null) => {
    if (!taskToSetDeadline) return;

    setLoading(true);
    try {
      const updatedTask = await handleApiCall(
        () => updateTaskDeadline(taskToSetDeadline.id, newDeadlineDate),
        "Atualizando data limite...",
        newDeadlineDate ? "Data limite definida com sucesso!" : "Data limite removida com sucesso!"
      );

      if (updatedTask) {
        const updateTaskInList = (list: TodoistTask[]) => 
          list.map(t => t.id === updatedTask.id ? updatedTask : t);

        setTournamentQueue(updateTaskInList);
        setRankedTasks(updateTaskInList);
        setP3Tasks(updateTaskInList);

        if (currentChallenger?.id === updatedTask.id) {
          setCurrentChallenger(updatedTask);
        }
      }
    } catch (error) {
      console.error("Erro ao salvar deadline:", error);
      showError("Falha ao salvar a data limite.");
    } finally {
      setLoading(false);
      setShowSetDeadlineDialog(false);
      setTaskToSetDeadline(null);
    }
  }, [taskToSetDeadline, currentChallenger]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || showSetDeadlineDialog || currentStep !== 'tournamentComparison') return;

      if (currentChallenger && currentOpponentIndex !== null) {
        if (event.key === '1' || event.key === 'ArrowUp') {
          event.preventDefault();
          handleTournamentComparison(true);
        } else if (event.key === '2' || event.key === 'ArrowDown') {
          event.preventDefault();
          handleTournamentComparison(false);
        } else if (event.key === 'x' || event.key === 'X') {
          event.preventDefault();
          if (currentChallenger) {
            handleCancelTask(currentChallenger.id); 
          } else {
            showError("Nenhuma tarefa desafiante para cancelar.");
          }
        } else if (event.key === 'z' || event.key === 'Z') {
          event.preventDefault();
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, currentStep, currentChallenger, currentOpponentIndex, handleTournamentComparison, handleCancelTask, handleUndo, showSetDeadlineDialog]);

  useEffect(() => {
    if (currentStep === 'result') {
      const finalRanking = {
        rankedTasks: rankedTasks,
        p3Tasks: p3Tasks,
      };
      localStorage.setItem(SEITON_LAST_RANKING_KEY, JSON.stringify(finalRanking));
      console.log("SEITONPage - Final ranking saved:", finalRanking);
    }
  }, [currentStep, rankedTasks, p3Tasks]);

  const selectedTask = useMemo(() => {
      if (!rankedTasks || rankedTasks.length === 0) {
          return null;
      }
      
      const activeTask = rankedTasks.find(task => 
          !task.is_completed && !(task as any).completed
      );
      
      return activeTask || null; 
  }, [rankedTasks]);

  const handleResetRanking = useCallback(async () => {
    if (!seitonMode) {
      showError("Modo SEITON não definido. Não é possível resetar o ranking.");
      return;
    }
    setLoading(true);
    localStorage.removeItem(SEITON_PROGRESS_KEY); // Remove apenas o progresso da sessão atual
    localStorage.removeItem(SEITON_LAST_RANKING_KEY); // Remove o último ranking finalizado
    localStorage.removeItem(getComparisonHistoryKey(seitonMode)); // Remove o histórico de embates específico do modo
    showSuccess("Ranking e histórico resetados. Recarregando tarefas...");
    setTournamentQueue([]);
    setRankedTasks([]);
    setP3Tasks([]);
    setCurrentChallenger(null);
    setCurrentOpponentIndex(null);
    setComparisonHistory([]); // Resetar o histórico no estado
    setLastUndoableAction(null);
    setLastWinnerInCurrentComparison(null); // Resetar também
    await fetchAndSetupTasks(seitonMode);
  }, [fetchAndSetupTasks, seitonMode, getComparisonHistoryKey]);

  const renderTaskCard = (
    task: TodoistTask | null,
    title: string,
    description: string,
    priorityOverride?: number,
    onCardClick?: () => void,
    isLastWinner?: boolean // Novo prop para indicar se foi o último vencedor
  ) => {
    if (!task) {
        return null;
    }
    const displayPriority = priorityOverride !== undefined ? priorityOverride : task.priority;
    return (
      <Card
        className={cn(
          "w-full shadow-lg bg-white/80 backdrop-blur-sm p-4 relative", // Adicionado 'relative' para posicionamento do badge
          onCardClick && "cursor-pointer hover:border-blue-500 transition-all duration-200",
          isLastWinner && "border-4 border-purple-500 ring-4 ring-purple-200" // Destaque visual para o último vencedor
        )}
        onClick={onCardClick}
        tabIndex={onCardClick ? 0 : -1}
        role={onCardClick ? "button" : undefined}
      >
        {isLastWinner && (
          <span className="absolute top-2 right-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            Último Vencedor!
          </span>
        )}
        <CardHeader className="text-center p-0 mb-2">
          <CardTitle className="text-xl font-bold text-gray-800 flex items-center justify-center gap-2">
            {task.content}
            {task.due?.is_recurring && (
              <Repeat className="h-4 w-4 text-blue-500" title="Tarefa Recorrente" />
            )}
            <a
              href={`https://todoist.com/app/task/${task.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-blue-600 transition-colors"
              aria-label="Abrir no Todoist"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardTitle>
          {task.description && (
            <CardDescription className="text-gray-700 text-sm mt-1">
              {task.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0 text-center">
          <p className={`text-md font-semibold ${getPriorityColor(displayPriority)}`}>
            Prioridade: {getPriorityLabel(displayPriority)}
          </p>
          {task.due?.date && (
            <p className="text-xs text-gray-500 mt-1">
              Vencimento: <span className="font-medium text-gray-700">{formatDateForDisplay(task.due)}</span>
            </p>
          )}
          {task.deadline && (
            <p className="text-xs text-gray-500 mt-1">
              Data Limite: <span className="font-medium text-gray-700">{formatDateForDisplay(task.deadline)}</span>
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-2 mt-4 p-0">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              handleCancelTask(task.id);
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-4 rounded-md transition-colors flex items-center text-sm"
          >
            <X className="mr-1 h-4 w-4" /> Cancelar
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenSetDeadlineDialog(task);
            }}
            variant="outline"
            className="border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold py-1 px-4 rounded-md transition-colors flex items-center text-sm"
          >
            <Clock className="mr-1 h-4 w-4" /> Definir Data Limite
          </Button>
        </CardFooter>
      </Card>
    );
  };

  console.log("SEITONPage Render Cycle:");
  console.log("  Loading:", loading);
  console.log("  Current Step:", currentStep);
  console.log("  Current Challenger:", currentChallenger?.content || "N/A");
  console.log("  Current Opponent Index:", currentOpponentIndex);
  console.log("  Tournament Queue Length:", tournamentQueue.length);
  console.log("  Ranked Tasks Length:", rankedTasks.length);
  console.log("  P3 Tasks Length:", p3Tasks.length);
  console.log("  SEITON Mode:", seitonMode);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-100 p-4">
        <p className="text-lg text-blue-600">Carregando tarefas...</p>
      </div>
    );
  }

  if (!GEMINI_API_KEY) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-100 p-4">
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 text-center space-y-4">
          <CardTitle className="text-3xl font-bold text-gray-800">Erro de Configuração</CardTitle>
          <CardDescription className="text-lg text-red-600 mt-2">
            A chave da API do Gemini (<code>VITE_GEMINI_API_KEY</code>) não está configurada.
          </CardDescription>
          <p className="text-sm text-gray-700">
            Por favor, adicione-a ao seu arquivo <code>.env</code> na raiz do projeto.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Exemplo: <code>VITE_GEMINI_API_KEY=SUA_CHAVE_AQUI</code>
          </p>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Voltar ao Menu Principal
          </Button>
        </Card>
        <MadeWithDyad />
      </div>
    );
  }

  if (currentStep === 'modeSelection') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-100 p-4">
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 text-center space-y-6">
          <CardTitle className="text-3xl font-bold text-gray-800">Escolha o Modo do Torneio</CardTitle>
          <CardDescription className="text-lg text-gray-600">
            Selecione o contexto para o qual você deseja priorizar as tarefas.
          </CardDescription>
          {aiClassificationQuotaExceeded && (
            <div className="flex flex-col items-center justify-center p-4 text-center text-red-600 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p className="text-base font-semibold">Limite de Quota da API Gemini Atingido!</p>
              <p className="text-sm mt-1">
                A classificação de tarefas pela IA pode não funcionar corretamente. Por favor, aguarde ou verifique sua quota no Google Cloud.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-4">
            <Button
              onClick={() => fetchAndSetupTasks('professional')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-lg rounded-md transition-colors"
            >
              Iniciar Torneio Profissional
            </Button>
            <Button
              onClick={() => fetchAndSetupTasks('personal')}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 text-lg rounded-md transition-colors"
            >
              Iniciar Torneio Pessoal
            </Button>
          </div>
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-gray-700 hover:bg-gray-100 mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Menu Principal
          </Button>
        </Card>
        <MadeWithDyad />
      </div>
    );
  }

  const currentOpponent = currentOpponentIndex !== null ? rankedTasks[currentOpponentIndex] : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-blue-800 hover:bg-blue-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-blue-800 text-center flex-grow">
            SEITON - Planejar Dia
          </h1>
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-blue-700 text-center mb-8">
          Priorize suas tarefas com torneio ({seitonMode === 'professional' ? 'Profissional' : 'Pessoal'})
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {currentStep === 'tournamentComparison' && currentChallenger && currentOpponent && currentOpponentIndex !== null ? (
          <div className="space-y-6 text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Qual é mais importante?</CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Escolha a tarefa que você considera mais prioritária ou cancele uma delas.
            </CardDescription>
            <div className="grid grid-cols-1 gap-4">
              {renderTaskCard(
                currentChallenger,
                "Tarefa A",
                "Challenger",
                currentChallenger.priority,
                () => handleTournamentComparison(true),
                lastWinnerInCurrentComparison === 'challenger'
              )}
              <p className="text-xl font-bold text-gray-700">VS</p>
              {renderTaskCard(
                currentOpponent,
                "Tarefa B",
                `Posição ${currentOpponentIndex + 1} no Ranking`,
                currentOpponent.priority,
                () => handleTournamentComparison(false),
                lastWinnerInCurrentComparison === 'opponent'
              )}
            </div>
            
            {/* Removed AI Suggestion Button and Display */}

            <div className="flex justify-center space-x-4 mt-6">
              <Button onClick={() => handleTournamentComparison(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center">
                <ChevronLeft className="mr-2 h-5 w-5" /> ESCOLHER CIMA (1 ou ↑)
              </Button>
              <Button onClick={() => handleTournamentComparison(false)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center">
                ESCOLHER BAIXO (2 ou ↓) <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        ) : currentStep === 'result' ? (
          <div className="space-y-6 text-center">
            <CardTitle className="text-3xl font-bold text-gray-800">Ranking atualizado!</CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Suas tarefas foram priorizadas.
            </CardDescription>

            {rankedTasks.slice(0, 4).length > 0 && (
              <div className="text-left p-4 border rounded-md bg-red-50/50">
                <h3 className="text-xl font-bold text-red-700 mb-2">P1 (Urgente)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {rankedTasks.slice(0, 4).map((task) => (
                    <li key={task.id} className="text-gray-800">{task.content}</li>
                  ))}
                </ul>
              </div>
            )}

            {rankedTasks.slice(4, RANKING_SIZE).length > 0 && (
              <div className="text-left p-4 border rounded-md bg-yellow-50/50">
                <h3 className="text-xl font-bold text-yellow-700 mb-2">P2 (Alta)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {rankedTasks.slice(4, RANKING_SIZE).map((task) => (
                    <li key={task.id}>{task.content}</li>
                  ))}
                </ul>
              </div>
            )}

            {p3Tasks.length > 0 && (
              <div className="text-left p-4 border rounded-md bg-blue-50/50">
                <h3 className="text-xl font-bold text-blue-700 mb-2">P3 (Média)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {p3Tasks.map((task) => (
                    <li key={task.id}>{task.content}</li>
                  ))}
                </ul>
              </div>
            )}

            {tournamentQueue.length === 0 && rankedTasks.length === 0 && p3Tasks.length === 0 && (
              <p className="text-gray-600">Nenhuma tarefa para priorizar. Bom trabalho!</p>
            )}

            <Button onClick={() => navigate("/main-menu")} className="mt-6 bg-blue-600 hover:bg-blue-700">
              Voltar ao Menu Principal
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <CardTitle className="text-2xl font-bold text-gray-800">Processando tarefas...</CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Aguarde enquanto organizamos seu backlog.
            </CardDescription>
          </div>
        )}
      </Card>
      
      <div className="mt-8 w-full max-w-3xl flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 border-gray-300 hover:border-gray-400 bg-white/70 backdrop-blur-sm"
        >
          <Bug size={20} /> {showDebugPanel ? "Esconder Debug" : "Mostrar Debug"}
        </Button>

        <div className="flex gap-4">
          {lastUndoableAction && (
            <Button
              variant="outline"
              onClick={handleUndo}
              disabled={loading}
              className="flex items-center gap-2 text-red-700 hover:text-red-900 border-red-300 hover:border-red-400 bg-white/70 backdrop-blur-sm"
            >
              <Undo2 size={20} /> Desfazer (Z)
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleResetRanking}
            disabled={loading}
            className="flex items-center gap-2 text-blue-700 hover:text-blue-900 border-blue-300 hover:border-blue-400 bg-white/70 backdrop-blur-sm"
          >
            <RotateCcw size={20} /> Resetar Ranking
          </Button>
        </div>
      </div>

        {showDebugPanel && (
          <Card className="mt-4 p-4 shadow-lg bg-white/90 backdrop-blur-sm text-left text-sm w-full max-w-3xl">
            <CardTitle className="text-xl font-bold mb-3">Painel de Debug</CardTitle>
            <div className="space-y-3">
              <p><strong>Current Step:</strong> {currentStep}</p>
              <p><strong>SEITON Mode:</strong> {seitonMode || "Não definido"}</p>
              <p><strong>Current Challenger:</strong> {currentChallenger ? `${currentChallenger.content} (ID: ${currentChallenger.id}, Prio: ${currentChallenger.priority})` : "Nenhum"}</p>
              <p><strong>Current Opponent Index:</strong> {currentOpponentIndex !== null ? currentOpponentIndex : "Nenhum"}</p>
              <p><strong>Selected Task (for SEISO Card):</strong> {selectedTask ? `${selectedTask.content} (ID: ${selectedTask.id}, Prio: ${selectedTask.priority})` : "Nenhum"}</p>

              <div>
                <h4 className="font-semibold mt-2">Tournament Queue ({tournamentQueue.length} tasks):</h4>
                <ul className="list-disc list-inside ml-4">
                  {tournamentQueue.map(task => (
                    <li key={task.id}>{task.content} (ID: {task.id}, Prio: {task.priority}, Context: {task.contextType || 'N/A'})</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mt-2">Ranked Tasks ({rankedTasks.length} tasks):</h4>
                <ul className="list-disc list-inside ml-4">
                  {rankedTasks.map(task => (
                    <li key={task.id}>{task.content} (ID: {task.id}, Prio: {task.priority}, Context: {task.contextType || 'N/A'})</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mt-2">P3 Tasks ({p3Tasks.length} tasks):</h4>
                <ul className="list-disc list-inside ml-4">
                  {p3Tasks.map((task) => (
                    <li key={task.id}>{task.content} (ID: {task.id}, Prio: {task.priority}, Context: {task.contextType || 'N/A'})</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mt-2">Histórico de Comparações (Últimas 3):</h4>
                {comparisonHistory.length > 0 ? (
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    {comparisonHistory.slice(0,3).map((entry, index) => (
                      <li key={index}>
                        <span className="font-medium">[{entry.timestamp}]</span> Desafiante: "{entry.challengerContent}" (ID: {entry.challengerId}) vs. Oponente: "{entry.opponentContent}" (ID: {entry.opponentId}). Vencedor: {entry.winner}. Ação: {entry.action}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ml-4 text-gray-500">Nenhuma comparação registrada ainda.</p>
                )}
              </div>
            </div>
          </Card>
        )}
      <MadeWithDyad />

      {taskToSetDeadline && (
        <SetDeadlineDialog
          isOpen={showSetDeadlineDialog}
          onClose={() => setShowSetDeadlineDialog(false)}
          currentDeadline={taskToSetDeadline.deadline}
          onSave={handleSaveDeadline}
          loading={loading}
        />
      )}
    </div>
  );
};

export default SEITONPage;