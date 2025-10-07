"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Brain, ListOrdered, Loader2 } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, handleApiCall, updateTask } from "@/lib/todoistApi";
import { TodoistTask, SequencerSettings } from "@/lib/types";
import { format, parseISO, isValid, getDay, setHours, setMinutes, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const SEQUENCER_SETTINGS_KEY = 'sequencer_settings';
const AI_CONTEXT_PROMPT_KEY = 'ai_context_prompt';
const DEFAULT_AI_CONTEXT_PROMPT = `Dada a seguinte tarefa, classifique-a como 'pessoal' ou 'profissional'. Responda apenas com 'pessoal' ou 'profissional'.`;

const SequencerPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<TodoistTask[]>([]);
  const [sequencerSettings, setSequencerSettings] = useState<SequencerSettings | null>(null);
  const [scheduledTasks, setScheduledTasks] = useState<TodoistTask[]>([]);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  useEffect(() => {
    const savedSettings = localStorage.getItem(SEQUENCER_SETTINGS_KEY);
    if (savedSettings) {
      try {
        setSequencerSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error("Error parsing sequencer settings from localStorage:", e);
        showError("Erro ao carregar configurações do sequenciador.");
      }
    } else {
      showError("Configurações do sequenciador não encontradas. Por favor, configure-as.");
    }

    fetchTasks();
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedTasks = await handleApiCall(() => getTasks("today | overdue | no due date"), "Carregando tarefas...");
      if (fetchedTasks) {
        setTasks(fetchedTasks.filter(task => !task.is_completed));
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
      showError("Falha ao carregar tarefas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const getAIContextPrompt = useCallback(() => {
    return localStorage.getItem(AI_CONTEXT_PROMPT_KEY) || DEFAULT_AI_CONTEXT_PROMPT;
  }, []);

  const classifyTaskContext = useCallback(async (task: TodoistTask): Promise<'pessoal' | 'profissional' | 'indefinido'> => {
    if (!GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY not configured. Cannot classify task context.");
      return 'indefinido';
    }

    const systemPrompt = getAIContextPrompt();
    const taskDetails = `Tarefa: "${task.content}". Descrição: "${task.description || 'Nenhuma descrição.'}".`;
    const prompt = `${systemPrompt}\n${taskDetails}`;

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
      const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "indefinido";
      const classification = aiResponseContent.toLowerCase().trim();

      if (classification === 'pessoal' || classification === 'profissional') {
        return classification;
      }
      return 'indefinido';

    } catch (error: any) {
      console.error(`Error classifying task context for "${task.content}":`, error);
      return 'indefinido';
    }
  }, [GEMINI_API_KEY, GEMINI_API_URL, getAIContextPrompt]);

  const generateSchedule = useCallback(async () => {
    if (!sequencerSettings) {
      showError("Configurações do sequenciador não carregadas.");
      return;
    }
    if (tasks.length === 0) {
      showSuccess("Nenhuma tarefa para sequenciar.");
      return;
    }

    setIsGeneratingSchedule(true);
    showSuccess("Gerando cronograma com IA...");

    const today = new Date();
    const dayIndex = getDay(today); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const dayName = ['sunday', 'monday', 'reca', 'wednesday', 'thursday', 'friday', 'saturday'][dayIndex];
    const currentDaySettings = sequencerSettings.dailyContexts[dayName];

    if (!currentDaySettings) {
      showError(`Nenhuma configuração de tempo encontrada para ${dayName}.`);
      setIsGeneratingSchedule(false);
      return;
    }

    const availableTimeBlocks: { start: Date; end: Date; type: 'pessoal' | 'profissional' }[] = [];
    const now = new Date();

    // Adicionar blocos profissionais
    currentDaySettings.professional.forEach(block => {
      let start = setMinutes(setHours(today, parseInt(block.start.split(':')[0])), parseInt(block.start.split(':')[1]));
      let end = setMinutes(setHours(today, parseInt(block.end.split(':')[0])), parseInt(block.end.split(':')[1]));
      if (isAfter(end, now)) { // Apenas blocos no futuro
        if (isAfter(now, start)) { // Se o bloco já começou, ajusta o início para agora
          start = now;
        }
        availableTimeBlocks.push({ start, end, type: 'profissional' });
      }
    });

    // Adicionar blocos pessoais
    currentDaySettings.personal.forEach(block => {
      let start = setMinutes(setHours(today, parseInt(block.start.split(':')[0])), parseInt(block.start.split(':')[1]));
      let end = setMinutes(setHours(today, parseInt(block.end.split(':')[0])), parseInt(block.end.split(':')[1]));
      if (isAfter(end, now)) { // Apenas blocos no futuro
        if (isAfter(now, start)) { // Se o bloco já começou, ajusta o início para agora
          start = now;
        }
        availableTimeBlocks.push({ start, end, type: 'pessoal' });
      }
    });

    // Ordenar blocos por hora de início
    availableTimeBlocks.sort((a, b) => a.start.getTime() - b.start.getTime());

    const tasksWithContext: (TodoistTask & { contextType?: 'pessoal' | 'profissional' | 'indefinido' })[] = await Promise.all(
      tasks.map(async task => {
        const context = await classifyTaskContext(task);
        return { ...task, contextType: context };
      })
    );

    // Priorizar tarefas: P1 > P2 > P3 > P4, depois por deadline, depois por due date, depois por duração (menor primeiro)
    const sortedTasks = [...tasksWithContext].sort((a, b) => {
      // Priority (descending)
      if (b.priority !== a.priority) return b.priority - a.priority;

      // Deadline (ascending)
      const deadlineA = a.deadline?.date ? parseISO(a.deadline.date) : null;
      const deadlineB = b.deadline?.date ? parseISO(b.deadline.date) : null;
      if (deadlineA && deadlineB && isValid(deadlineA) && isValid(deadlineB)) return deadlineA.getTime() - deadlineB.getTime();
      if (deadlineA && isValid(deadlineA)) return -1;
      if (deadlineB && isValid(deadlineB)) return 1;

      // Due date (ascending)
      const dueA = a.due?.date ? parseISO(a.due.date) : null;
      const dueB = b.due?.date ? parseISO(b.due.date) : null;
      if (dueA && dueB && isValid(dueA) && isValid(dueB)) return dueA.getTime() - dueB.getTime();
      if (dueA && isValid(dueA)) return -1;
      if (dueB && isValid(dueB)) return 1;

      // Duration (ascending)
      const durationA = a.duration?.amount || 0;
      const durationB = b.duration?.amount || 0;
      return durationA - durationB;
    });

    const newScheduledTasks: TodoistTask[] = [];
    const remainingTasks = new Set(sortedTasks.map(t => t.id));

    for (const block of availableTimeBlocks) {
      let currentTime = block.start;
      const blockEndTime = block.end;

      for (const task of sortedTasks) {
        if (!remainingTasks.has(task.id)) continue; // Já agendada ou ignorada

        const taskDurationMinutes = task.duration?.unit === 'day' ? task.duration.amount * 24 * 60 : task.duration?.amount || 30; // Default 30 min if no duration
        const taskEndTime = new Date(currentTime.getTime() + taskDurationMinutes * 60 * 1000);

        // Verifica se a tarefa se encaixa no bloco e no contexto
        if (isAfter(taskEndTime, blockEndTime) || (task.contextType && task.contextType !== 'indefinido' && task.contextType !== block.type)) {
          continue; // Não cabe ou contexto não corresponde
        }

        // Agendar tarefa
        const newDueDate = format(currentTime, "yyyy-MM-dd'T'HH:mm:ss", { locale: ptBR });
        newScheduledTasks.push({ ...task, due: { date: newDueDate, string: format(currentTime, "PPP HH:mm", { locale: ptBR }), lang: 'pt', is_recurring: false } });
        remainingTasks.delete(task.id);
        currentTime = taskEndTime; // Avança o tempo no bloco
      }
    }

    setScheduledTasks(newScheduledTasks);
    setIsGeneratingSchedule(false);
    showSuccess("Cronograma gerado com sucesso!");
  }, [sequencerSettings, tasks, classifyTaskContext]);

  const applyScheduleToTodoist = useCallback(async () => {
    if (scheduledTasks.length === 0) {
      showError("Nenhum cronograma para aplicar.");
      return;
    }

    setLoading(true);
    try {
      await Promise.all(scheduledTasks.map(async (task) => {
        if (task.due?.date) {
          await handleApiCall(() => updateTask(task.id, { due_date: task.due?.date }), `Atualizando ${task.content}...`);
        }
      }));
      showSuccess("Cronograma aplicado ao Todoist!");
      navigate("/main-menu"); // Voltar ao menu principal após aplicar
    } catch (error) {
      console.error("Error applying schedule:", error);
      showError("Falha ao aplicar o cronograma ao Todoist.");
    } finally {
      setLoading(false);
    }
  }, [scheduledTasks, navigate]);

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-100 to-cyan-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-teal-800 hover:bg-teal-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-teal-800 text-center flex-grow">
            SEQUENCIADOR IA
          </h1>
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-teal-700 text-center mb-8">
          Deixe a IA organizar seu dia com base em suas configurações de tempo.
        </p>
      </div>

      <Card className="w-full max-w-3xl shadow-lg bg-white/80 backdrop-blur-sm p-6">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-800">Gerar Cronograma Diário</CardTitle>
          <CardDescription className="text-lg text-gray-600 mt-2">
            A IA irá analisar suas tarefas e blocos de tempo para sugerir um cronograma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-8">
              <Loader2 className="h-12 w-12 animate-spin text-teal-600 mb-4" />
              <p className="text-lg text-teal-700">Carregando tarefas...</p>
            </div>
          ) : (
            <>
              <p className="text-center text-gray-700">
                Tarefas disponíveis para sequenciamento: <span className="font-bold">{tasks.length}</span>
              </p>
              <Button
                onClick={generateSchedule}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 rounded-md transition-colors flex items-center justify-center"
                disabled={isGeneratingSchedule || tasks.length === 0 || !sequencerSettings}
              >
                {isGeneratingSchedule ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="mr-2 h-4 w-4" />
                )}
                {isGeneratingSchedule ? "Gerando..." : "Gerar Cronograma com IA"}
              </Button>

              {scheduledTasks.length > 0 && (
                <div className="mt-8 space-y-4">
                  <h3 className="text-xl font-bold text-gray-800 text-center">Cronograma Sugerido:</h3>
                  <ul className="space-y-3">
                    {scheduledTasks.map((task, index) => (
                      <li key={task.id} className="p-3 border rounded-md bg-gray-50 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">{task.content}</p>
                          <p className="text-sm text-gray-600">
                            {task.due?.date ? format(parseISO(task.due.date), "PPP HH:mm", { locale: ptBR }) : "Sem vencimento"}
                          </p>
                          <p className={`text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {getPriorityLabel(task.priority)}
                          </p>
                          {task.duration && (
                            <p className="text-xs text-gray-500">
                              Duração: {task.duration.amount} {task.duration.unit === 'minute' ? 'minutos' : 'dias'}
                            </p>
                          )}
                        </div>
                        <ListOrdered className="h-5 w-5 text-teal-500" />
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={applyScheduleToTodoist}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-md transition-colors mt-4"
                    disabled={loading}
                  >
                    Aplicar Cronograma ao Todoist
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => navigate("/sequencer-settings")}
            className="flex items-center gap-2 text-teal-700 hover:text-teal-900 border-teal-300 hover:border-teal-400 bg-white/70 backdrop-blur-sm"
          >
            <ListOrdered size={20} />
            Configurar Blocos de Tempo
          </Button>
        </CardFooter>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SequencerPage;