"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Check, Clock, CalendarDays, ExternalLink, Repeat, XCircle, Brain, AlertCircle, Loader2, Settings
} from "lucide-react"; 
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, handleApiCall, updateTaskDueDate, completeTask } from "@/lib/todoistApi"; 
import { format, parseISO, setHours, setMinutes, isValid, addDays, parse, startOfDay, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask, SequencerSettings } from "@/lib/types"; 
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateForDisplay } from "@/lib/utils";
import { AI_SUGGESTION_SYSTEM_PROMPT_KEY, SEQUENCER_SETTINGS_KEY } from "@/lib/constants";

const DEFAULT_SUGGESTION_PROMPT = `Você é um assistente de produtividade. Dada a seguinte tarefa, sugira 3 a 5 opções de reagendamento (data e hora, se aplicável) que sejam razoáveis, considerando a prioridade e o vencimento atual. Formate cada sugestão como uma linha separada, começando com um asterisco, por exemplo: "* Amanhã às 10:00", "* Próxima segunda-feira". Evite sugerir datas passadas.`;

const SEIKETSURecordPage: React.FC = () => {
  const navigate = useNavigate();
  const [tasksToReview, setTasksToReview] = useState<TodoistTask[]>([]);
  const [allActiveTasks, setAllActiveTasks] = useState<TodoistTask[]>([]); 
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [tasksDoneTodayCount, setTasksDoneTodayCount] = useState(0);
  const [tasksPostponedCount, setTasksPostponedCount] = useState(0);
  const [tasksCompletedCount, setTasksCompletedCount] = useState(0);

  const [showPostponeDialog, setShowPostponeDialog] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState<Date | undefined>(undefined);
  const [selectedDueTime, setSelectedDueTime] = useState<string>("");

  // AI Suggestion States
  const [isAISuggesting, setIsAISuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAISuggestionsOnCard, setShowAISuggestionsOnCard] = useState(false); // Controla a visibilidade das sugestões no card

  const [sequencerSettings, setSequencerSettings] = useState<SequencerSettings | null>(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const currentTask = tasksToReview[currentTaskIndex];
  const totalTasks = tasksToReview.length;

  // Early exit if API key is missing, similar to AITutorChat
  if (!GEMINI_API_KEY) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-100 p-4">
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

  useEffect(() => {
    const savedSettings = localStorage.getItem(SEQUENCER_SETTINGS_KEY);
    if (savedSettings) {
      try {
        setSequencerSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error("Error parsing sequencer settings from localStorage:", e);
        showError("Erro ao carregar configurações do sequenciador.");
      }
    }
  }, []);

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

  const fetchTasksForReview = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedReviewTasks = await handleApiCall(() => getTasks("(due before: in 0 minutes)"), "Carregando tarefas para revisão...");

      const fetchedAllActiveTasks = await handleApiCall(() => getTasks(), "Carregando todas as tarefas ativas...");
      if (fetchedAllActiveTasks) {
        setAllActiveTasks(fetchedAllActiveTasks.filter(task => !task.is_completed));
      }

      if (fetchedReviewTasks && fetchedReviewTasks.length > 0) {
        const filteredAndSortedTasks = fetchedReviewTasks
          .filter((task: TodoistTask) => task.parent_id === null)
          .filter((task: TodoistTask) => !task.is_completed)
          .sort((a, b) => {
            // Primary sort: priority (descending)
            if (b.priority !== a.priority) {
              return b.priority - a.priority;
            }

            const parseAndValidateDate = (dateString: string | null | undefined): Date | null => {
              if (typeof dateString === 'string' && dateString.trim() !== '') {
                const parsed = parseISO(dateString);
                return isValid(parsed) ? parsed : null;
              }
              return null;
            };

            // Secondary sort: deadline (ascending)
            const deadlineA = a.deadline?.date ? parseAndValidateDate(a.deadline.date) : null;
            const deadlineB = b.deadline?.date ? parseAndValidateDate(b.deadline.date) : null;

            if (deadlineA && deadlineB) {
              const deadlineComparison = deadlineA.getTime() - deadlineB.getTime();
              if (deadlineComparison !== 0) {
                return deadlineComparison;
              }
            } else if (deadlineA) {
              return -1; // Task A has a deadline, Task B doesn't, so A comes first
            } else if (deadlineB) {
              return 1; // Task B has a deadline, Task A doesn't, so B comes first
            }

            // Tertiary sort: due date (ascending)
            const dateA = parseAndValidateDate(a.due?.date);
            const dateB = parseAndValidateDate(b.due?.date);

            if (dateA && dateB) {
              return dateA.getTime() - dateB.getTime();
            } else if (dateA) {
              return -1; // Task A has a due date, Task B doesn't, so A comes first
            } else if (dateB) {
              return 1; // Task B has a due date, Task A doesn't, so B comes first
            }
            return 0; // Both have no valid date or deadline
          });

        if (filteredAndSortedTasks.length > 0) {
          setTasksToReview(filteredAndSortedTasks);
          setCurrentTaskIndex(0);
          setTasksDoneTodayCount(0);
          setTasksPostponedCount(0);
          setTasksCompletedCount(0);
          setIsSessionFinished(false);
          showSuccess(`Sessão de revisão iniciada com ${filteredAndSortedTasks.length} tarefas.`);
        } else {
          showSuccess("Nenhuma tarefa pendente encontrada para revisão. Bom trabalho!");
          setIsSessionFinished(true);
        }
      } else {
        showSuccess("Nenhuma tarefa pendente encontrada para revisão. Bom trabalho!");
        setIsSessionFinished(true);
      }
    } catch (error: any) {
      console.error("SEIKETSU: Erro em fetchTasksForReview:", error);
      showError("Ocorreu um erro inesperado ao carregar tarefas para revisão.");
      navigate("/main-menu");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchTasksForReview();
  }, [fetchTasksForReview]);

  const moveToNextTask = useCallback(() => {
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
      setShowAISuggestionsOnCard(false); // Esconde sugestões ao mover para próxima tarefa
      setAiSuggestions([]); // Limpa sugestões
      setAiError(null); // Limpa erros da IA
    } else {
      setIsSessionFinished(true);
    }
  }, [currentTaskIndex, totalTasks]);

  const handleDoTodayQuick = useCallback(() => {
    if (currentTask) {
      setTasksDoneTodayCount(prev => prev + 1);
      showSuccess("Tarefa marcada para fazer hoje!");
      moveToNextTask();
    }
  }, [currentTask, moveToNextTask]);

  const handleCompleteTask = useCallback(async () => {
    if (currentTask) {
      const success = await handleApiCall(() => completeTask(currentTask.id), "Concluindo tarefa...", "Tarefa concluída no Todoist!");
      if (success) {
        setTasksCompletedCount(prev => prev + 1);
        moveToNextTask();
      } else {
        showError("Falha ao concluir a tarefa no Todoist.");
      }
    }
  }, [currentTask, moveToNextTask]);

  const handlePostponeClick = useCallback(() => {
    if (currentTask) {
      // Não limpa selectedDueDate/Time aqui, pois applyAISuggestion pode ter preenchido
      // Apenas abre o diálogo.
      setShowPostponeDialog(true);
    }
  }, [currentTask]);

  const handleSavePostpone = useCallback(async () => {
    if (!currentTask || !selectedDueDate) {
      showError("Por favor, selecione uma data para postergar.");
      return;
    }

    let newDueDateString = format(selectedDueDate, "yyyy-MM-dd");
    if (selectedDueTime) {
      const [hours, minutes] = selectedDueTime.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        let dateWithTime = setHours(selectedDueDate, hours);
        dateWithTime = setMinutes(dateWithTime, minutes);
        newDueDateString = format(dateWithTime, "yyyy-MM-dd'T'HH:mm:ss");
      }
    }

    console.log("SEIKETSU: handleSavePostpone - newDueDateString being sent:", newDueDateString); // Log para depuração

    const success = await handleApiCall(
      () => updateTaskDueDate(currentTask.id, newDueDateString),
      "Postergando tarefa...",
      "Tarefa postergada com sucesso!"
    );

    if (success) {
      setTasksPostponedCount(prev => prev + 1);
      setShowPostponeDialog(false);
      moveToNextTask();
    } else {
      showError("Falha ao postergar a tarefa.");
    }
  }, [currentTask, selectedDueDate, selectedDueTime, moveToNextTask]);

  const handleAISuggestion = useCallback(async () => {
    // A verificação da chave da API já é feita no nível superior do componente.
    // Se chegamos aqui, a chave existe.
    if (!currentTask) return;

    setIsAISuggesting(true);
    setAiSuggestions([]);
    setAiError(null);
    setShowAISuggestionsOnCard(true); // Mostra a seção de sugestões no card

    const systemPrompt = localStorage.getItem(AI_SUGGESTION_SYSTEM_PROMPT_KEY) || DEFAULT_SUGGESTION_PROMPT;
    const now = new Date();
    const formattedNow = format(now, "dd/MM/yyyy HH:mm", { locale: ptBR });

    let timeBlocksInfo = "";
    if (sequencerSettings) {
      const dayIndex = getDay(now); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDayName = dayNames[dayIndex];
      const currentDaySettings = sequencerSettings.dailyContexts[currentDayName];

      if (currentDaySettings) {
        const professionalBlocks = currentDaySettings.professional.map(b => `${b.start}-${b.end}`).join(', ');
        const personalBlocks = currentDaySettings.personal.map(b => `${b.start}-${b.end}`).join(', ');
        timeBlocksInfo = `Meus blocos de tempo para hoje (${currentDayName}) são: Profissional [${professionalBlocks || 'Nenhum'}], Pessoal [${personalBlocks || 'Nenhum'}].`;
      }
    }

    const taskDurationInfo = currentTask.duration 
      ? `A tarefa tem uma duração estimada de ${currentTask.duration.amount} ${currentTask.duration.unit === 'minute' ? 'minutos' : 'dias'}.`
      : "A duração da tarefa não foi especificada.";

    const taskDetails = `Tarefa: "${currentTask.content}". Descrição: "${currentTask.description || 'Nenhuma descrição.'}". Prioridade: ${getPriorityLabel(currentTask.priority)}. Vencimento atual: ${currentTask.due?.string || 'Nenhum'}. Data Limite: ${currentTask.deadline?.date ? formatDateForDisplay(currentTask.deadline) : 'Nenhum'}. ${taskDurationInfo} Data e hora atuais: ${formattedNow}. ${timeBlocksInfo}`;
    const prompt = `${systemPrompt}\n${taskDetails}\nSugestões:`;

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `Erro na API Gemini: ${response.statusText}`);
        }

        const data = await response.json();
        const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível obter sugestões do Tutor de IA.";
        
        const parsedSuggestions = aiResponseContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('* '))
            .map(line => line.substring(2).trim()); // Remove "* " prefix

        setAiSuggestions(parsedSuggestions);
        if (parsedSuggestions.length === 0) {
            setAiError("O Tutor de IA não conseguiu gerar sugestões úteis. Tente novamente ou insira manualmente.");
        }
    } catch (error: any) {
        console.error("Erro ao obter sugestões de reagendamento do Gemini:", error);
        setAiError(`Erro ao obter sugestões: ${error.message}.`);
        showError(`Erro ao obter sugestões de reagendamento: ${error.message}`);
    } finally {
        setIsAISuggesting(false);
    }
  }, [GEMINI_API_URL, currentTask, getPriorityLabel, sequencerSettings]);

  const applyAISuggestion = useCallback((suggestion: string) => {
    let newDate: Date | undefined = undefined;
    let newTime: string = "";
    const now = new Date();
    const startOfToday = startOfDay(now);

    const lowerSuggestion = suggestion.toLowerCase();

    // 1. Handle relative dates (these should inherently be in the future)
    if (lowerSuggestion.includes("amanhã")) {
        newDate = addDays(startOfToday, 1);
    } else if (lowerSuggestion.includes("próxima semana")) {
        newDate = addDays(startOfToday, 7);
    } else if (lowerSuggestion.includes("próxima segunda-feira")) {
        newDate = nextMonday(now);
    } else if (lowerSuggestion.includes("próxima terça-feira")) {
        newDate = nextTuesday(now);
    } else if (lowerSuggestion.includes("próxima quarta-feira")) {
        newDate = nextWednesday(now);
    } else if (lowerSuggestion.includes("próxima quinta-feira")) {
        newDate = nextThursday(now);
    } else if (lowerSuggestion.includes("próxima sexta-feira")) {
        newDate = nextFriday(now);
    } else if (lowerSuggestion.includes("próximo sábado")) {
        newDate = nextSaturday(now);
    } else if (lowerSuggestion.includes("próximo domingo")) {
        newDate = nextSunday(now);
    } else {
        // 2. Try to parse specific date formats
        try {
            // Try "dd/MM/yyyy 'às' HH:mm"
            let parsed = parse(suggestion, "dd/MM/yyyy 'às' HH:mm", now, { locale: ptBR });
            if (isValid(parsed)) {
                newDate = parsed;
                newTime = format(parsed, "HH:mm");
            } else {
                // Try "dd/MM/yyyy"
                parsed = parse(suggestion, "dd/MM/yyyy", now, { locale: ptBR });
                if (isValid(parsed)) {
                    newDate = startOfDay(parsed);
                }
            }
        } catch (e) {
            console.warn("Could not parse AI suggestion date:", suggestion, e);
        }
    }

    // 3. Ensure newDate is not in the past
    if (newDate && newDate < startOfToday) {
        // If the parsed date is in the past, try to advance it by a year if it's a specific date without year context
        // or simply set it to today if it's a general past date.
        if (newDate.getFullYear() < now.getFullYear()) { // If it's a past year, assume next year
            newDate = new Date(newDate.setFullYear(now.getFullYear() + 1));
        } else if (newDate.getMonth() < now.getMonth() || (newDate.getMonth() === now.getMonth() && newDate.getDate() < now.getDate())) {
            // If it's a past month/day in the current year, assume next year
            newDate = new Date(newDate.setFullYear(now.getFullYear() + 1));
        }
        // After potential year adjustment, if it's still before startOfToday, set it to startOfToday
        if (newDate < startOfToday) {
            newDate = startOfToday;
        }
    }

    // 4. Extract time if present in the suggestion string (e.g., "às 10:00", "10:00")
    const timeMatch = suggestion.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) {
        newTime = timeMatch[1];
    }

    setSelectedDueDate(newDate);
    setSelectedDueTime(newTime);
    setShowPostponeDialog(true); // Abre o diálogo de postergar com a sugestão preenchida
    showSuccess(`Sugestão "${suggestion}" aplicada.`);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || isSessionFinished || !currentTask || showPostponeDialog) return;

      if (event.key === 'r' || event.key === 'R') { // R for Do Today Quick
        event.preventDefault();
        handleDoTodayQuick();
      } else if (event.key === 'p' || event.key === 'P') { // P for Postpone
        event.preventDefault();
        handlePostponeClick();
      } else if (event.key === 'f' || event.key === 'F') { // F for Complete (changed from C)
        event.preventDefault();
        handleCompleteTask();
      } else if (event.key === 'a' || event.key === 'A') { // A for AI Suggestion
        event.preventDefault();
        handleAISuggestion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, isSessionFinished, currentTask, showPostponeDialog, handleDoTodayQuick, handlePostponeClick, handleCompleteTask, handleAISuggestion]);

  const taskProgressValue = totalTasks > 0 ? (currentTaskIndex / totalTasks) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-indigo-100 p-4">
        <p className="text-lg text-indigo-600">Carregando tarefas para revisão diária...</p>
      </div>
    );
  }

  if (isSessionFinished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 text-center space-y-4">
          <CardTitle className="text-3xl font-bold text-gray-800">Revisão Diária Concluída!</CardTitle>
          <CardDescription className="text-lg text-gray-600">
            Você revisou {totalTasks} tarefas.
          </CardDescription>
          <p className="text-green-600 font-semibold">Decididas para Hoje: {tasksDoneTodayCount}</p>
          <p className="text-red-600 font-semibold">Concluídas: {tasksCompletedCount}</p>
          <p className="text-blue-600 font-semibold">Postergadas: {tasksPostponedCount}</p>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Voltar ao Menu Principal
          </Button>
          <Button variant="outline" onClick={fetchTasksForReview} className="mt-2">
            Iniciar Nova Revisão
          </Button>
        </Card>
        <MadeWithDyad />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-100 p-4 relative">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-indigo-800 hover:bg-indigo-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-indigo-800 text-center flex-grow">
            SEIKETSU - Revisão Diária
          </h1>
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-indigo-700 text-center mb-8">
          Decida rapidamente: fazer hoje, concluir ou postergar?
        </p>
      </div>

      <Card className="w-full max-w-3xl shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {currentTask ? (
          <div className="space-y-6">
            <div className="text-center">
              <CardTitle className="text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
                {currentTask.content}
                {currentTask.due?.is_recurring && (
                  <Repeat className="h-5 w-5 text-blue-500" title="Tarefa Recorrente" />
                )}
                <a
                  href={`https://todoist.com/app/task/${currentTask.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                  aria-label="Abrir no Todoist"
                >
                  <ExternalLink className="h-5 w-5" />
                </a>
              </CardTitle>
              {currentTask.description && (
                <CardDescription className="text-gray-700 mb-2">
                  {currentTask.description}
                </CardDescription>
              )}
              <p className={`text-lg font-semibold ${getPriorityColor(currentTask.priority)} mb-1`}>
                Prioridade: {getPriorityLabel(currentTask.priority)}
              </p>
              {currentTask.due?.date && (
                <p className="text-sm text-gray-500">
                  Vencimento: <span className="font-medium text-gray-700">{formatDateForDisplay(currentTask.due)}</span>
                </p>
              )}
              {currentTask.deadline && (
                <p className="text-sm text-gray-500">
                  Data Limite: <span className="font-medium text-gray-700">{formatDateForDisplay(currentTask.deadline)}</span>
                </p>
              )}
              {currentTask.duration && (
                <p className="text-sm text-gray-500">
                  Duração: <span className="font-medium text-gray-700">{currentTask.duration.amount} {currentTask.duration.unit === 'minute' ? 'minutos' : 'dias'}</span>
                </p>
              )}
            </div>

            {/* Botão de Sugestão de IA direto no card */}
            <div className="flex justify-center mt-4">
                <Button
                    onClick={handleAISuggestion}
                    disabled={isAISuggesting} // A verificação da chave já é feita no nível superior
                    className="bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center px-6 py-2 rounded-md transition-colors"
                >
                    {isAISuggesting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Brain className="mr-2 h-5 w-5" />
                    )}
                    Sugerir Horários com IA (A)
                </Button>
            </div>
            {aiError && (
                <p className="text-red-500 text-sm text-center mt-2">{aiError}</p>
            )}

            {/* Exibição das sugestões da IA no card */}
            {showAISuggestionsOnCard && aiSuggestions.length > 0 && (
                <div className="mt-4 space-y-2 border-t pt-4">
                    <Label className="text-lg font-semibold text-gray-800 text-center block">Sugestões da IA:</Label>
                    <div className="flex flex-wrap justify-center gap-2">
                        {aiSuggestions.map((suggestion, index) => (
                            <Button
                                key={index}
                                variant="outline"
                                size="sm"
                                onClick={() => applyAISuggestion(suggestion)}
                                disabled={isAISuggesting}
                                className="text-blue-700 border-blue-300 hover:bg-blue-50"
                            >
                                {suggestion}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex justify-center space-x-4 mt-6">
              <Button
                onClick={handleDoTodayQuick}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
              >
                <Check className="mr-2 h-5 w-5" /> FAZER HOJE (R)
              </Button>
              <Button
                onClick={handleCompleteTask}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
              >
                <XCircle className="mr-2 h-5 w-5" /> CONCLUÍDA (F)
              </Button>
              <Button
                onClick={handlePostponeClick}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
              >
                <CalendarDays className="mr-2 h-5 w-5" /> POSTERGAR (P)
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-600">
            <p>Nenhuma tarefa encontrada para revisão.</p>
          </div>
        )}
        {!isSessionFinished && currentTask && (
          <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Tarefa {currentTaskIndex + 1} de {totalTasks}
            </p>
            <Progress value={taskProgressValue} className="w-full h-2 bg-indigo-200 [&>*]:bg-indigo-600" />
          </CardFooter>
        )}
      </Card>

      <MadeWithDyad />

      <Dialog open={showPostponeDialog} onOpenChange={setShowPostponeDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Postegar Tarefa</DialogTitle>
            <DialogDescription>
              Selecione uma nova data e, opcionalmente, um horário para a tarefa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">
                Data
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-[240px] justify-start text-left font-normal col-span-3",
                      !selectedDueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {selectedDueDate ? format(selectedDueDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDueDate}
                    onSelect={setSelectedDueDate}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="time" className="text-right">
                Horário (HH:MM)
              </Label>
              <Input
                id="time"
                type="time"
                value={selectedDueTime}
                onChange={(e) => setSelectedDueTime(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSavePostpone} disabled={!selectedDueDate || loading}>
              Salvar Postergamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SEIKETSURecordPage;