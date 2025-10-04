"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CheckCircle2, Clock, Hourglass, Coffee, CalendarCheck, ExternalLink } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, updateTaskDueDate, handleApiCall } from "@/lib/todoistApi";
import { isToday, parseISO, format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters"; // Importar o filtro

const motivationalMessages = [
  "Bom trabalho hoje! 🌟",
  "Cada pequeno passo conta! 💪",
  "Amanhã é um novo começo! 🌅",
  "Você está progredindo! 🚀",
  "Orgulhe-se do seu esforço! ✨",
  "Continue firme! 🌈",
];

const SEIKETSUPage = () => {
  const navigate = useNavigate();
  const [selectedPendingTasks, setSelectedPendingTasks] = useState<string[]>([]);
  const [motivationalMessage, setMotivationalMessage] = useState("");
  const [tasksForToday, setTasksForToday] = useState<TodoistTask[]>([]);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [pendingTodayTasks, setPendingTodayTasks] = useState<TodoistTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * motivationalMessages.length);
    setMotivationalMessage(motivationalMessages[randomIndex]);
  }, []);

  const fetchAndProcessTasks = useCallback(async () => {
    setLoading(true);
    const fetchedTasks = await handleApiCall(getTasks, "Carregando tarefas do dia...");
    if (fetchedTasks) {
      const today = new Date();
      const tasksDueToday = fetchedTasks
        .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task)) // Aplicar o filtro atualizado aqui
        .filter((task: TodoistTask) => 
          task.due && isToday(parseISO(task.due.date))
        );
      setTasksForToday(tasksDueToday);

      const completed = tasksDueToday.filter(task => task.is_completed).length;
      setCompletedTodayCount(completed);

      const pending = tasksDueToday.filter(task => !task.is_completed);
      setPendingTodayTasks(pending);

    } else {
      showError("Não foi possível carregar as tarefas do Todoist.");
      navigate("/main-menu");
    }
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    fetchAndProcessTasks();
  }, [fetchAndProcessTasks]);

  const handleCheckboxChange = (taskId: string, checked: boolean) => {
    setSelectedPendingTasks((prev) =>
      checked ? [...prev, taskId] : prev.filter((id) => id !== taskId)
    );
  };

  const handleReprogramSelected = async () => {
    if (selectedPendingTasks.length === 0) {
      showSuccess("Nenhuma tarefa selecionada para reprogramar.");
      return;
    }

    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    const reprogrammedTitles: string[] = [];
    let successCount = 0;

    for (const taskId of selectedPendingTasks) {
      const taskToReprogram = pendingTodayTasks.find(task => task.id === taskId);
      if (taskToReprogram) {
        const success = await handleApiCall(
          () => updateTaskDueDate(taskId, tomorrow),
          `Reprogramando "${taskToReprogram.content}"...`
        );
        if (success) {
          reprogrammedTitles.push(taskToReprogram.content);
          successCount++;
        } else {
          showError(`Falha ao reprogramar "${taskToReprogram.content}".`);
        }
      }
    }

    if (successCount > 0) {
      showSuccess(`Tarefas reprogramadas: ${reprogrammedTitles.join(", ")}`);
      setSelectedPendingTasks([]); // Clear selection after reprogramming
      fetchAndProcessTasks(); // Refresh tasks to update the UI
    } else {
      showError("Nenhuma tarefa foi reprogramada com sucesso.");
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 4:
        return "text-red-600";
      case 3:
        return "text-yellow-600";
      case 2:
        return "text-blue-600";
      case 1:
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 4: return "P1";
      case 3: return "P2";
      case 2: return "P3";
      case 1: return "P4";
      default: return "Sem Prioridade";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-purple-100 p-4">
        <p className="text-lg text-purple-600">Carregando resumo do dia...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-purple-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-purple-800 hover:bg-purple-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-purple-800 text-center flex-grow">
            SEIKETSU - Revisar o Dia
          </h1>
          <div className="w-20"></div> {/* Placeholder para alinhar o título */}
        </div>
        <p className="text-xl text-purple-700 text-center mb-8">
          Como foi seu dia? Vamos preparar amanhã
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 space-y-8">
        {/* Resumo do Dia */}
        <div className="text-center space-y-4">
          <CardTitle className="text-2xl font-bold text-gray-800">Resumo do Dia</CardTitle>
          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-lg text-gray-700">Concluídas: <span className="font-semibold">{completedTodayCount}</span></p>
            </div>
            <div className="flex items-center space-x-2">
              <Hourglass className="h-5 w-5 text-yellow-600" />
              <p className="text-lg text-gray-700">Pendentes: <span className="font-semibold">{pendingTodayTasks.length}</span></p>
            </div>
            {/* Tempo Total e Pomodoros são placeholders, pois a API do Todoist não fornece esses dados diretamente */}
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <p className="text-lg text-gray-700">Trabalhado: <span className="font-semibold">--</span></p>
            </div>
            <div className="flex items-center space-x-2">
              <Coffee className="h-5 w-5 text-red-600" />
              <p className="text-lg text-gray-700">Pomodoros: <span className="font-semibold">--</span></p>
            </div>
          </div>
        </div>

        {/* Lista de Pendentes */}
        <div className="space-y-4">
          <CardTitle className="text-2xl font-bold text-gray-800 text-center">Tarefas que ficaram pendentes:</CardTitle>
          <p className="text-gray-700 text-center mb-4">Quais dessas você quer tentar amanhã?</p>
          <div className="space-y-3">
            {pendingTodayTasks.length > 0 ? (
              pendingTodayTasks.map((task) => (
                <div key={task.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={`task-${task.id}`}
                    checked={selectedPendingTasks.includes(task.id)}
                    onCheckedChange={(checked) => handleCheckboxChange(task.id, checked as boolean)}
                    className="h-5 w-5"
                  />
                  <label
                    htmlFor={`task-${task.id}`}
                    className={`text-lg font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 ${getPriorityColor(task.priority)}`}
                  >
                    {task.content} ({getPriorityLabel(task.priority)})
                    {task.deadline && (
                      <span className="text-sm text-gray-500 ml-2">
                        (Limite: {new Date(task.deadline).toLocaleDateString()})
                      </span>
                    )}
                    <a
                      href={`https://todoist.com/app/task/${task.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      aria-label="Abrir no Todoist"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </label>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500">Nenhuma tarefa pendente para hoje. Bom trabalho!</p>
            )}
          </div>
          <Button
            onClick={handleReprogramSelected}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-md transition-colors flex items-center justify-center"
            disabled={pendingTodayTasks.length === 0}
          >
            <CalendarCheck className="mr-2 h-5 w-5" /> REPROGRAMAR SELECIONADAS
          </Button>
        </div>

        {/* Encerramento */}
        <div className="text-center space-y-4 pt-4 border-t">
          <CardDescription className="text-xl font-semibold text-gray-800">
            {motivationalMessage}
          </CardDescription>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-purple-600 hover:bg-purple-700">
            <ArrowLeft className="mr-2 h-4 w-4" /> VOLTAR AO MENU
          </Button>
        </div>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SEIKETSUPage;