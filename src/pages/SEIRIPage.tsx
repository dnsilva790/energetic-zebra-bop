"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, X, ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, getProjects, completeTask, handleApiCall } from "@/lib/todoistApi";

interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  due?: {
    date: string;
    string: string;
    lang: string;
    is_recurring: boolean;
  } | null;
  priority: number; // 1 (lowest) to 4 (highest)
  project_id: string;
  project_name?: string; // Adicionado para facilitar a exibição
  classificacao?: 'essencial' | 'descartavel'; // Classificação interna do app
}

interface TodoistProject {
  id: string;
  name: string;
  color: string;
}

const SEIRI_PROGRESS_KEY = 'seiri_progress';

const SEIRIPage = () => {
  const navigate = useNavigate();
  const [allTasks, setAllTasks] = useState<TodoistTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [keptTasksCount, setKeptTasksCount] = useState(0);
  const [deletedTasksCount, setDeletedTasksCount] = useState(0);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentTask = allTasks[currentTaskIndex];
  const totalTasks = allTasks.length;

  const saveProgress = useCallback(() => {
    localStorage.setItem(SEIRI_PROGRESS_KEY, JSON.stringify({
      allTasks,
      currentTaskIndex,
      keptTasksCount,
      deletedTasksCount,
    }));
  }, [allTasks, currentTaskIndex, keptTasksCount, deletedTasksCount]);

  const loadProgress = useCallback(() => {
    const savedProgress = localStorage.getItem(SEIRI_PROGRESS_KEY);
    if (savedProgress) {
      const { allTasks: savedTasks, currentTaskIndex: savedIndex, keptTasksCount: savedKept, deletedTasksCount: savedDeleted } = JSON.parse(savedProgress);
      setAllTasks(savedTasks);
      setCurrentTaskIndex(savedIndex);
      setKeptTasksCount(savedKept);
      setDeletedTasksCount(savedDeleted);
      if (savedIndex >= savedTasks.length) {
        setShowSummary(true);
      }
      return true;
    }
    return false;
  }, []);

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 4: return "text-red-600"; // P1
      case 3: return "text-yellow-600"; // P2
      case 2: return "text-blue-600"; // P3
      case 1: return "text-gray-600"; // P4
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

  const fetchTasksAndProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [tasks, projects] = await Promise.all([
        handleApiCall(getTasks, "Carregando tarefas..."),
        handleApiCall(getProjects, "Carregando projetos..."),
      ]);

      if (tasks && projects) {
        const projectMap = new Map(projects.map((p: TodoistProject) => [p.id, p.name]));
        const tasksWithProjectNames = tasks.map((task: any) => {
          const projectName = projectMap.get(task.project_id) || "Caixa de Entrada";
          // console.log(`Task ID: ${task.id}, Project ID: ${task.project_id}, Mapped Project Name: ${projectName}`); // Log para depuração
          return {
            ...task,
            project_name: projectName
          };
        });
        setAllTasks(tasksWithProjectNames);
        if (tasksWithProjectNames.length === 0) {
          setShowSummary(true);
        }
      } else {
        showError("Não foi possível carregar as tarefas ou projetos do Todoist.");
        navigate("/main-menu");
      }
    } catch (error) {
      console.error("SEIRI: Erro em fetchTasksAndProjects:", error);
      showError("Ocorreu um erro inesperado ao carregar dados.");
      navigate("/main-menu");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const initializePage = async () => {
      setLoading(true);
      const hasLoadedProgress = loadProgress();
      if (hasLoadedProgress) {
        setLoading(false);
      } else {
        await fetchTasksAndProjects();
      }
    };
    initializePage();
  }, [fetchTasksAndProjects, loadProgress]);

  useEffect(() => {
    if (allTasks.length > 0 && currentTaskIndex < totalTasks) {
      saveProgress();
    }
  }, [allTasks, currentTaskIndex, totalTasks, saveProgress]);

  const moveToNextTask = () => {
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      setShowSummary(true);
      localStorage.removeItem(SEIRI_PROGRESS_KEY); // Limpar progresso ao finalizar
    }
  };

  const handleKeep = () => {
    if (currentTask) {
      const updatedTasks = allTasks.map((task, idx) =>
        idx === currentTaskIndex ? { ...task, classificacao: 'essencial' } : task
      );
      setAllTasks(updatedTasks);
      setKeptTasksCount(keptTasksCount + 1);
      showSuccess("Tarefa marcada como essencial!");
      moveToNextTask();
    }
  };

  const handleDelete = () => {
    setIsConfirmationOpen(true);
  };

  const confirmDelete = async () => {
    setIsConfirmationOpen(false);
    if (currentTask) {
      const success = await handleApiCall(() => completeTask(currentTask.id), "Deletando tarefa...", "Tarefa deletada com sucesso!");
      if (success) {
        const updatedTasks = allTasks.filter((_, idx) => idx !== currentTaskIndex);
        setAllTasks(updatedTasks); // Remove a tarefa da lista local
        setDeletedTasksCount(deletedTasksCount + 1);
        // Se a tarefa atual foi removida, o índice não precisa ser incrementado,
        // mas precisamos garantir que não exceda o novo total de tarefas.
        if (currentTaskIndex >= updatedTasks.length) {
          setShowSummary(true);
          localStorage.removeItem(SEIRI_PROGRESS_KEY);
        } else {
          saveProgress(); // Salva o progresso após a deleção
          // Não move o índice, pois a próxima tarefa já estará na posição atual
        }
      } else {
        showError("Falha ao deletar a tarefa.");
      }
    }
  };

  const progressValue = totalTasks > 0 ? ((currentTaskIndex + (showSummary ? 1 : 0)) / totalTasks) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-100 p-4">
        <p className="text-lg text-green-600">Carregando tarefas para faxina...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-green-800 hover:bg-green-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-green-800 text-center flex-grow">
            SEIRI - Faxina do Backlog
          </h1>
          <div className="w-20"></div> {/* Placeholder para alinhar o título */}
        </div>
        <p className="text-xl text-green-700 text-center mb-8">
          Revise cada tarefa: manter ou deletar?
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm">
        <CardContent className="p-6">
          {showSummary ? (
            <div className="text-center space-y-4">
              <CardTitle className="text-2xl font-bold text-gray-800">Revisão Concluída!</CardTitle>
              <CardDescription className="text-lg text-gray-600">
                Você revisou {totalTasks} tarefas.
              </CardDescription>
              <p className="text-green-600 font-semibold">Manteve: {keptTasksCount}</p>
              <p className="text-red-600 font-semibold">Deletou: {deletedTasksCount}</p>
              <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
                Voltar ao Menu Principal
              </Button>
            </div>
          ) : (
            currentTask ? (
              <div className="space-y-6">
                <div className="text-center">
                  <CardTitle className="text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
                    {currentTask.content}
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
                  <p className="text-sm text-gray-500">
                    Projeto: <span className="font-medium text-gray-700">{currentTask.project_name}</span>
                  </p>
                  <p className={`text-lg font-semibold ${getPriorityColor(currentTask.priority)} mb-1`}>
                    Prioridade: {getPriorityLabel(currentTask.priority)}
                  </p>
                  {currentTask.due?.date && (
                    <p className="text-sm text-gray-500">
                      Vencimento: <span className="font-medium text-gray-700">{new Date(currentTask.due.date).toLocaleDateString()}</span>
                    </p>
                  )}
                </div>

                <div className="flex justify-center space-x-4 mt-6">
                  <Button
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center"
                  >
                    <X className="mr-2 h-5 w-5" /> DELETAR
                  </Button>
                  <Button
                    onClick={handleKeep}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center"
                  >
                    <Check className="mr-2 h-5 w-5" /> MANTER
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-600">
                <p>Nenhuma tarefa encontrada ou carregando...</p>
              </div>
            )
          )}
        </CardContent>
        {!showSummary && currentTask && (
          <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Tarefa {currentTaskIndex + 1} de {totalTasks}
            </p>
            <Progress value={progressValue} className="w-full h-2 bg-green-200 [&>*]:bg-green-600" />
          </CardFooter>
        )}
      </Card>

      <AlertDialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja deletar esta tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A tarefa será removida do seu Todoist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MadeWithDyad />
    </div>
  );
};

export default SEIRIPage;