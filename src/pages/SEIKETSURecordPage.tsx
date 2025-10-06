"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Check, Clock, CalendarDays, ExternalLink, Repeat, XCircle, Brain
} from "lucide-react"; 
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, handleApiCall, updateTaskDueDate, completeTask, getAISuggestedTimes } from "@/lib/todoistApi"; 
import { format, parseISO, setHours, setMinutes, isValid, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask, AISuggestion } from "@/lib/types"; // Importar AISuggestion
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateForDisplay } from "@/lib/utils";
import * as dateFnsTz from 'date-fns-tz'; // Importar o módulo inteiro

const SEIKETSURecordPage: React.FC = () => {
  const navigate = useNavigate();
  const [tasksToReview, setTasksToReview] = useState<TodoistTask[]>([]);
  const [allActiveTasks, setAllActiveTasks] = useState<TodoistTask[]>([]); // Novo estado para todas as tarefas ativas
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [tasksDoneTodayCount, setTasksDoneTodayCount] = useState(0);
  const [tasksPostponedCount, setTasksPostponedCount] = useState(0);
  const [tasksCompletedCount, setTasksCompletedCount] = useState(0);

  const [showPostponeDialog, setShowPostponeDialog] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState<Date | undefined>(undefined);
  const [selectedDueTime, setSelectedDueTime] = useState<string>("");
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]); // Tipo atualizado
  const [isAISuggesting, setIsAISuggesting] = useState(false);

  const currentTask = tasksToReview[currentTaskIndex];
  const totalTasks = tasksToReview.length;

  // Chave e prompt padrão para a IA de sugestão de tarefas
  const AI_TASK_SUGGESTION_SYSTEM_PROMPT_KEY = 'ai_task_suggestion_system_prompt';
  const DEFAULT_TASK_SUGGESTION_PROMPT = `Você é uma secretária virtual responsável por organizar a agenda do seu chefe de forma eficiente, considerando seu perfil de TDAH e medicação.

## PERFIL DO USUÁRIO
- TDAH em tratamento com Concerta 54mg
- Medicação tomada às 06:00 nos dias úteis
- Pico de eficácia: aproximadamente 08:00-14:00 (2-8h após a dose)
- Declínio gradual: após 14:00
- Fim do efeito: próximo às 18:00

## HORÁRIO DE EXPEDIENTE
- Dias úteis: Segunda a Sexta-feira
- Horário: 08:00 às 18:00 (horário de Brasília, UTC-3)
- Intervalo obrigatório: 15 minutos entre cada tarefa

## PRIORIDADES DO TODOIST
- **P1 (Urgente)**: Máxima prioridade, agendar o quanto antes
- **P2 (Alta)**: Priorizar nas melhores janelas cognitivas
- **P3 (Média)**: Agendar normalmente seguindo as regras de demanda
- **P4 (Baixa)**: Tarefas flexíveis
  * **IMPORTANTE**: Ao verificar conflitos na agenda, DESCONSIDERE tarefas P4
  * Tarefas P4 podem ser movidas/reorganizadas facilmente
  * Só respeite P1, P2 e P3 como "blocos fixos" na agenda

## FUSO HORÁRIO
- Seu fuso horário: America/Sao_Paulo (UTC-3, horário de Brasília)
- Todoist usa: UTC (UTC+0)
- **CONVERSÃO OBRIGATÓRIA**: 
  - Recebendo do Todoist (UTC): adicione 3 horas → horário local
  - Enviando sugestões: sempre em horário de Brasília (UTC-3)
  - Exemplo: 15:30 UTC = 12:30 Brasília

## CONTEXTO QUE VOCÊ RECEBERÁ

\`\`\`json
{
  "hora_atual": "2025-10-06T14:30:00-03:00",
  "nova_tarefa": {
    "descricao": "Revisar relatório trimestral",
    "prazo": "2025-10-06",
    "prioridade": "P2",
    "contexto_adicional": ""
  },
  "agenda_existente": [
    {
      "tarefa": "Reunião com cliente",
      "data": "2025-10-06",
      "hora_utc": "15:30",
      "duracao_min": 30,
      "prioridade": "P1"
    },
    {
      "tarefa": "Responder emails",
      "data": "2025-10-06",
      "hora_utc": "19:00",
      "duracao_min": 45,
      "prioridade": "P4"
    }
  ]
}
\`\`\`

## PROCESSO DE ANÁLISE

### 1. Converter Agenda Existente
- Pegue todas as tarefas já agendadas
- Converta horários de UTC para Brasília (+3h)
- **FILTRE: remova tarefas P4 da análise de conflitos**
- Calcule blocos ocupados: início + duração + 15min buffer
- Identifique lacunas disponíveis

### 2. Classificar Nova Tarefa
Identifique automaticamente:

**Tipo:**
- PROFISSIONAL: trabalho, reuniões, projetos, ligações de negócios
- PESSOAL: consultas, família, exercícios, lazer

**Demanda Cognitiva:**
- **ALTA**: planejamento estratégico, análise de dados, decisões complexas, desenvolvimento, escrita criativa
- **MÉDIA**: reuniões, revisões, apresentações, comunicações importantes
- **BAIXA**: emails, organização, tarefas administrativas, ligações rápidas

**Duração Estimada:**
- Baseie-se na descrição da tarefa
- Considere: "rápido"=15-30min, "revisar"=45-60min, "desenvolver"=2-3h, etc.

### 3. Aplicar Regras de Agendamento

#### Janelas de Produtividade

**JANELA DE OURO (08:00-12:00)** - Pico do Concerta
- Tarefas ALTA demanda cognitiva
- Projetos complexos, análises, decisões importantes
- Trabalho criativo e resolução de problemas
- **Prioridade máxima para P1 e P2**

**JANELA INTERMEDIÁRIA (12:00-14:00)**
- Tarefas MÉDIA demanda
- Reuniões de rotina
- Revisões e comunicações

**JANELA DE DECLÍNIO (14:00-18:00)**
- Tarefas BAIXA demanda apenas
- Emails, organização, administrativo
- Reuniões sociais/leves

**TAREFAS PESSOAIS**
- Após 18:00 ou antes das 08:00
- Exercícios físicos: manhã (sinergia dopaminérgica)

#### Regras Críticas

✅ **PRIORIDADE DO MESMO DIA**
- Se a tarefa é para HOJE: sempre incluir 2-3 opções de hoje primeiro
- Só pular para dias futuros se:
  * Já passou das 17:00 e tarefa > 1h
  * Tarefa ALTA demanda e já passou das 15:00
  * Não há lacunas suficientes (considerando apenas P1, P2, P3)

✅ **Conflitos**
- 15 minutos obrigatórios entre tarefas
- Ignore tarefas P4 ao calcular conflitos
- Verifique sobreposição com P1, P2 e P3 apenas

✅ **Limites Diários**
- Máximo 2 tarefas ALTA demanda por dia
- NUNCA agende ALTA demanda após 15:00
- MÉDIA demanda: evite após 16:00

✅ **Adequação Cognitiva**
- ALTA demanda → Janela de ouro (08:00-12:00)
- MÉDIA demanda → Janela intermediária (12:00-14:00)
- BAIXA demanda → Janela de declínio (14:00-18:00)

## FORMATO DE OUTPUT (OBRIGATÓRIO)

Retorne um JSON válido com 3 a 5 sugestões:

\`\`\`json
{
  "sugestoes": [
    {
      "data": "2025-10-06",
      "hora": "15:00",
      "prioridade_sugestao": 1,
      "badge": "🟢 HOJE",
      "titulo": "Ainda hoje - tarde adequada",
      "justificativa": "Lacuna disponível após reunião. Período de declínio ideal para demanda baixa.",
      "janela": "declinio",
      "reasoning": "Tarefa de baixa demanda, 45min de duração. Há lacuna das 15:00-18:00 (reunião P4 pode ser movida se necessário). Cliente pediu para postergar, mas ainda dá tempo hoje."
    },
    {
      "data": "2025-10-07",
      "hora": "09:00",
      "prioridade_sugestao": 2,
      "badge": "⭐ IDEAL",
      "titulo": "Janela de ouro - pico de foco",
      "justificativa": "Amanhã manhã, agenda livre, máxima capacidade cognitiva para análise.",
      "janela": "ouro",
      "reasoning": "Tarefa de alta demanda, melhor horário possível. Agenda de amanhã está livre das 08:00-12:00."
    }
  ],
  "metadata": {
    "tipo_tarefa": "PROFISSIONAL",
    "demanda_cognitiva": "MEDIA",
    "duracao_estimada_min": 45,
    "tarefas_p4_ignoradas": 1
  }
}
\`\`\`

### Estrutura dos Campos

**Por sugestão:**
- \`data\`: YYYY-MM-DD
- \`hora\`: HH:MM (horário de Brasília)
- \`prioridade_sugestao\`: 1 (melhor) a 5 (pior)
- \`badge\`: 
  * "🟢 HOJE" - para sugestões do mesmo dia
  * "⭐ IDEAL" - melhor horário possível (janela + demanda)
  * "✅ VIÁVEL" - alternativas adequadas
  * "⚠️ SUBÓTIMO" - funciona mas não é ideal
- \`titulo\`: Max 50 chars, resumo rápido
- \`justificativa\`: 1-2 frases explicando a escolha
- \`janela\`: "ouro" | "intermediaria" | "declinio" | "pessoal"
- \`reasoning\`: (interno) Explique seu raciocínio completo

**Metadata:**
- Classificação automática da tarefa
- Quantas tarefas P4 foram ignoradas no cálculo

## EXEMPLOS

### Exemplo 1: Postergar tarefa de hoje

**Input:**
\`\`\`json
{
  "hora_atual": "2025-10-06T14:30:00-03:00",
  "nova_tarefa": {
    "descricao": "Revisar apresentação",
    "prazo": "2025-10-06",
    "prioridade": "P3"
  },
  "agenda_existente": [
    {"tarefa": "Reunião cliente", "data": "2025-10-06", "hora_utc": "18:00", "duracao_min": 60, "prioridade": "P1"},
    {"tarefa": "Emails rotina", "data": "2025-10-06", "hora_utc": "19:30", "duracao_min": 30, "prioridade": "P4"}
  ]
}
\`\`\`

**Output esperado:**
\`\`\`json
{
  "sugestoes": [
    {
      "data": "2025-10-06",
      "hora": "15:00",
      "prioridade_sugestao": 1,
      "badge": "🟢 HOJE",
      "titulo": "Ainda hoje - tarde adequada",
      "justificativa": "Lacuna disponível agora. Revisão é tarefa média, adequada para período intermediário.",
      "janela": "intermediaria",
      "reasoning": "Hora atual 14:30, reunião só às 15:00 (18:00 UTC). Revisão leva ~45min. Dá tempo: 15:00 + 45min + 15min buffer = 16:00, antes da reunião às 15:00... ERRO! Reunião às 18:00 UTC = 15:00 Brasília. Corrigindo: Lacuna está das 16:15 às 18:00."
    },
    {
      "data": "2025-10-06",
      "hora": "16:30",
      "prioridade_sugestao": 2,
      "badge": "🟢 HOJE",
      "titulo": "Ainda hoje - após reunião",
      "justificativa": "Após reunião cliente (termina 16:00), tempo suficiente antes do fim do expediente.",
      "janela": "declinio",
      "reasoning": "Reunião P1: 15:00-16:00 (+ 15min buffer = 16:15). Emails P4 ignorados. Revisão cabe das 16:30-17:15."
    },
    {
      "data": "2025-10-07",
      "hora": "10:00",
      "prioridade_sugestao": 3,
      "badge": "⭐ IDEAL",
      "titulo": "Janela de ouro - foco ideal",
      "justificativa": "Amanhã manhã, período de pico cognitivo, agenda livre.",
      "janela": "ouro",
      "reasoning": "Se não fizer hoje, melhor horário é janela de ouro amanhã."
    }
  ],
  "metadata": {
    "tipo_tarefa": "PROFISSIONAL",
    "demanda_cognitiva": "MEDIA",
    "duracao_estimada_min": 45,
    "tarefas_p4_ignoradas": 1
  }
}
\`\`\`

### Exemplo 2: Tarefa complexa - sem tempo hoje

**Input:**
\`\`\`json
{
  "hora_atual": "2025-10-06T16:00:00-03:00",
  "nova_tarefa": {
    "descricao": "Desenvolver estratégia de marketing Q4",
    "prioridade": "P2"
  },
  "agenda_existente": []
}
\`\`\`

**Output esperado:**
\`\`\`json
{
  "sugestoes": [
    {
      "data": "2025-10-07",
      "hora": "08:30",
      "prioridade_sugestao": 1,
      "badge": "⭐ IDEAL",
      "titulo": "Início janela de ouro",
      "justificativa": "Amanhã cedo, pico do Concerta, mente fresca para pensamento estratégico.",
      "janela": "ouro",
      "reasoning": "Tarefa ALTA demanda, precisa ~3h. Já são 16:00, não dá tempo hoje (precisaria até 19:00+). Melhor horário: início da janela de ouro amanhã."
    },
    {
      "data": "2025-10-07",
      "hora": "09:30",
      "prioridade_sugestao": 2,
      "badge": "⭐ IDEAL",
      "titulo": "Meio da janela de ouro",
      "justificativa": "Amanhã meio da manhã, ainda em pico de foco e criatividade.",
      "janela": "ouro",
      "reasoning": "Alternativa dentro da mesma janela ideal."
    },
    {
      "data": "2025-10-08",
      "hora": "08:00",
      "prioridade_sugestao": 3,
      "badge": "✅ VIÁVEL",
      "titulo": "Terça - início do dia",
      "justificativa": "Terça-feira manhã, abertura da janela de ouro, máxima capacidade.",
      "janela": "ouro",
      "reasoning": "Opção para terça caso segunda não seja possível."
    }
  ],
  "metadata": {
    "tipo_tarefa": "PROFISSIONAL",
    "demanda_cognitiva": "ALTA",
    "duracao_estimada_min": 180,
    "tarefas_p4_ignoradas": 0
  }
}
\`\`\`

## CHECKLIST ANTES DE GERAR OUTPUT

- [ ] Converti TODOS os horários UTC → Brasília (+3h)?
- [ ] Filtrei tarefas P4 ao calcular conflitos?
- [ ] Identifiquei tipo (PROFISSIONAL/PESSOAL) e demanda (ALTA/MÉDIA/BAIXA)?
- [ ] Estimei duração razoável baseado na descrição?
- [ ] Verifiquei hora atual vs. horário de término possível hoje?
- [ ] Incluí pelo menos 2 opções de HOJE se viável?
- [ ] Verifiquei conflitos com P1, P2, P3 (ignorando P4)?
- [ ] Garanti 15min buffer entre tarefas?
- [ ] Respeitei janelas cognitivas (ALTA→ouro, MÉDIA→inter, BAIXA→declínio)?
- [ ] Ordenei por prioridade (mesmo dia primeiro, depois melhor adequação)?
- [ ] Badges corretos (🟢 HOJE, ⭐ IDEAL, ✅ VIÁVEL)?
- [ ] JSON válido e completo?
- [ ] Horários em formato de Brasília (UTC-3)?

---

## LEMBRE-SE

🎯 **Objetivo principal**: Maximizar produtividade respeitando o perfil TDAH + Concerta
⏰ **Prioridade 1**: Sempre tentar encaixar no mesmo dia quando viável
🧠 **Prioridade 2**: Proteger janela de ouro (08:00-12:00) para tarefas complexas
✨ **Diferencial**: Tarefas P4 são flexíveis, podem ser reorganizadas livremente`;

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
      // Fetch tasks for review (overdue/due today)
      const fetchedReviewTasks = await handleApiCall(() => getTasks("(due before: in 0 minutes)"), "Carregando tarefas para revisão...");

      // Fetch ALL active tasks to build the existing agenda for AI suggestions
      const fetchedAllActiveTasks = await handleApiCall(() => getTasks(), "Carregando todas as tarefas ativas...");
      if (fetchedAllActiveTasks) {
        setAllActiveTasks(fetchedAllActiveTasks.filter(task => !task.is_completed));
      }

      if (fetchedReviewTasks && fetchedReviewTasks.length > 0) {
        const filteredAndSortedTasks = fetchedReviewTasks
          .filter((task: TodoistTask) => task.parent_id === null)
          .filter((task: TodoistTask) => !task.is_completed)
          .sort((a, b) => {
            // 1. Primary sort: priority (descending)
            if (b.priority !== a.priority) {
              return b.priority - a.priority;
            }

            // 2. Secondary sort: deadline (ascending)
            let deadlineA: Date | null = null;
            if (typeof a.deadline === 'string' && a.deadline.trim() !== '') {
                deadlineA = parseISO(a.deadline);
            }
            let deadlineB: Date | null = null;
            if (typeof b.deadline === 'string' && b.deadline.trim() !== '') {
                deadlineB = parseISO(b.deadline);
            }

            const isValidDeadlineA = deadlineA && isValid(deadlineA);
            const isValidDeadlineB = deadlineB && isValid(deadlineB);

            if (isValidDeadlineA && isValidDeadlineB) {
              const deadlineComparison = deadlineA!.getTime() - deadlineB!.getTime();
              if (deadlineComparison !== 0) {
                return deadlineComparison;
              }
            } else if (isValidDeadlineA) {
              return -1; // A has a valid deadline, B does not, so A comes first
            } else if (isValidDeadlineB) {
              return 1; // B has a valid deadline, A does not, so B comes first
            }
            // If both have no valid deadline, or deadlines are equal, move to due date

            // 3. Tertiary sort: due date (ascending)
            let dateA: Date | null = null;
            if (a.due?.date && typeof a.due.date === 'string' && a.due.date.trim() !== '') {
                dateA = parseISO(a.due.date);
            }
            let dateB: Date | null = null;
            if (b.due?.date && typeof b.due.date === 'string' && b.due.date.trim() !== '') {
                dateB = parseISO(b.due.date);
            }

            const isValidDateA = dateA && isValid(dateA);
            const isValidDateB = dateB && isValid(dateB);

            if (isValidDateA && isValidDateB) {
              return dateA!.getTime() - dateB!.getTime();
            }
            if (isValidDateA) { // A has a valid date, B does not
              return -1;
            }
            if (isValidDateB) { // B has a valid date, A does not
              return 1;
            }
            return 0; // Both have no valid date
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
      setSelectedDueDate(addDays(new Date(), 1));
      setSelectedDueTime("");
      setAiSuggestions([]); // Limpa sugestões anteriores
      setShowPostponeDialog(true);
    }
  }, [currentTask]);

  const handleGetAISuggestions = useCallback(async () => {
    if (!currentTask) return;
    setIsAISuggesting(true);
    setAiSuggestions([]);
    try {
      const customPrompt = localStorage.getItem(AI_TASK_SUGGESTION_SYSTEM_PROMPT_KEY) || DEFAULT_TASK_SUGGESTION_PROMPT;
      
      // Current date and time in Brasília (ISO string with offset)
      const currentDateTimeBrasilia = format(new Date(), "yyyy-MM-dd'T'HH:mm:ssxxx", { locale: ptBR });

      // Prepare agenda_existente - All active tasks excluding P4
      const existingAgenda = allActiveTasks
        .filter(task => task.priority !== 1) // Filter out P4 tasks
        .map(task => {
          const dueDateTime = task.due?.date ? parseISO(task.due.date) : null;
          let dueDateInBrasilia = dueDateTime
            ? dateFnsTz.utcToZonedTime(dueDateTime, "America/Sao_Paulo")
            : null;

          return {
            tarefa: task.content,
            data: dueDateInBrasilia ? format(dueDateInBrasilia, "yyyy-MM-dd") : null,
            hora_utc: dueDateInBrasilia ? format(dueDateInBrasilia, "HH:mm") : null, // This is already in Brasília time
            duracao_min: 60, // Placeholder, as Todoist API doesn't provide duration directly
            prioridade: `P${task.priority}`,
          };
        })
        .filter(item => item.data !== null && item.hora_utc !== null); // Remove items without valid date/time

      const aiResponse = await handleApiCall(
        () => getAISuggestedTimes(
          currentTask.content,
          currentTask.description || '',
          customPrompt,
          currentDateTimeBrasilia,
          existingAgenda
        ),
        "Obtendo sugestões da IA...",
        "Sugestões da IA recebidas!"
      );
      if (aiResponse && aiResponse.sugestoes) {
        setAiSuggestions(aiResponse.sugestoes);
      }
    } catch (error) {
      console.error("Erro ao obter sugestões da IA:", error);
      showError("Falha ao obter sugestões da IA.");
    } finally {
      setIsAISuggesting(false);
    }
  }, [currentTask, allActiveTasks]);

  const handleSelectAISuggestion = useCallback(async (suggestion: AISuggestion) => {
    if (!currentTask) return;

    // A sugestão da IA já vem no formato de Brasília (YYYY-MM-DD HH:MM)
    const dateTimeStringBrasilia = `${suggestion.data}T${suggestion.hora}:00`;
    const dateInBrasilia = parseISO(dateTimeStringBrasilia);

    if (!isValid(dateInBrasilia)) {
      showError("Sugestão da IA inválida. Por favor, selecione manualmente.");
      return;
    }

    // Converter a data/hora de Brasília para UTC para enviar ao Todoist
    const dateInUtc = dateFnsTz.zonedTimeToUtc(dateInBrasilia, 'America/Sao_Paulo');
    const newDueDateString = format(dateInUtc, "yyyy-MM-dd'T'HH:mm:ss'Z'"); // Formato ISO 8601 com Z para UTC

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
  }, [currentTask, moveToNextTask]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || isSessionFinished || !currentTask || showPostponeDialog) return;

      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        handleDoTodayQuick();
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        handlePostponeClick();
      } else if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        handleCompleteTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, isSessionFinished, currentTask, showPostponeDialog, handleDoTodayQuick, handlePostponeClick, handleCompleteTask]);

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

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
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
            </div>

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
                <XCircle className="mr-2 h-5 w-5" /> CONCLUÍDA (C)
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
            <div className="col-span-4 flex justify-center mt-4">
              <Button
                onClick={handleGetAISuggestions}
                disabled={isAISuggesting || !currentTask}
                className="bg-purple-600 hover:bg-purple-700 text-white flex items-center"
              >
                {isAISuggesting ? (
                  <Clock className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="mr-2 h-4 w-4" />
                )}
                Sugestões da IA
              </Button>
            </div>
            {aiSuggestions.length > 0 && (
              <div className="col-span-4 space-y-2 mt-4">
                <p className="text-sm font-semibold text-gray-700">Sugestões da IA:</p>
                <div className="flex flex-col gap-2"> {/* Alterado para flex-col para melhor visualização das sugestões */}
                  {aiSuggestions.map((suggestion, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAISuggestion(suggestion)}
                      className="text-xs h-auto py-2 justify-start text-left" // Ajustes de estilo
                    >
                      <span className="font-bold mr-2">{suggestion.badge}</span>
                      <span className="font-medium mr-1">{suggestion.data} {suggestion.hora} -</span>
                      <span className="text-gray-600">{suggestion.titulo}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
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