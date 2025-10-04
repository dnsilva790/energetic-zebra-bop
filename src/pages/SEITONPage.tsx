"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, LayoutDashboard, ExternalLink, Repeat } from "lucide-react"; // Importar o ícone Repeat
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, getProjects, moveTaskToProject, handleApiCall } from "@/lib/todoistApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TodoistTask, TodoistProject } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";

const SEITONPage = () => {
  const navigate = useNavigate();
  const [activeTasks, setActiveTasks] = useState<TodoistTask[]>([]);
  const [projects, setProjects] = useState<TodoistProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasksAndProjects = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedTasks = await handleApiCall(getTasks, "Carregando tarefas...");
      const fetchedProjects = await handleApiCall(getProjects, "Carregando projetos...");

      if (fetchedTasks && fetchedProjects) {
        setProjects(fetchedProjects);
        const tasksWithProjectNames = fetchedTasks
          .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task)) // Aplicar o filtro atualizado
          .map((task: TodoistTask) => ({
            ...task,
            project_name: fetchedProjects.find((p: TodoistProject) => p.id === task.project_id)?.name || "Caixa de Entrada"
          }));
        setActiveTasks(tasksWithProjectNames);
      } else {
        showError("Não foi possível carregar tarefas ou projetos do Todoist.");
        navigate("/main-menu");
      }
    } catch (error) {
      showError("Erro ao carregar dados para SEITON.");
      console.error("SEITON fetch error:", error);
      navigate("/main-menu");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchTasksAndProjects();
  }, [fetchTasksAndProjects]);

  const handleMoveTask = useCallback(async (taskId: string, newProjectId: string) => {
    const success = await handleApiCall(() => moveTaskToProject(taskId, newProjectId), "Movendo tarefa...", "Tarefa movida com sucesso!");
    if (success) {
      setActiveTasks(prevTasks =>
        prevTasks.map(task => {
          if (task.id === taskId) {
            return {
              ...task,
              project_id: newProjectId,
              project_name: projects.find(p => p.id === newProjectId)?.name || "Caixa de Entrada"
            };
          }
          return task;
        })
      );
    } else {
      showError("Falha ao mover a tarefa.");
    }
  }, [projects]);

  const groupedTasks = activeTasks.reduce((acc, task) => {
    const projectName = task.project_name || "Sem Projeto";
    if (!acc[projectName]) {
      acc[projectName] = [];
    }
    acc[projectName].push(task);
    return acc;
  }, {} as Record<string, TodoistTask[]>);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-100 p-4">
        <p className="text-lg text-blue-600">Carregando tarefas e projetos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-100 p-4">
      <div className="w-full max-w-4xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-blue-800 hover:bg-blue-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-blue-800 text-center flex-grow">
            SEITON - Organizar Tarefas
          </h1>
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-blue-700 text-center mb-8">
          Organize suas tarefas ativas em projetos
        </p>
      </div>

      <Card className="w-full max-w-4xl shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {activeTasks.length === 0 ? (
          <div className="text-center space-y-4">
            <CardTitle className="text-2xl font-bold text-gray-800">Nenhuma tarefa ativa encontrada.</CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Adicione novas tarefas no Todoist ou verifique suas configurações.
            </CardDescription>
            <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
              Voltar ao Menu Principal
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(groupedTasks).map(([projectName, tasks]) => (
              <Card key={projectName} className="bg-blue-50/50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-blue-800 flex items-center gap-2">
                    <LayoutDashboard className="h-5 w-5" /> {projectName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {tasks.map(task => (
                    <div key={task.id} className="flex flex-col p-3 border rounded-md bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-800 flex items-center gap-2">
                          {task.content}
                          {task.due?.is_recurring && (
                            <Repeat className="h-4 w-4 text-blue-500" title="Tarefa Recorrente" />
                          )}
                        </p>
                        <a
                          href={`https://todoist.com/app/task/${task.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          aria-label="Abrir no Todoist"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      <Select onValueChange={(newProjectId) => handleMoveTask(task.id, newProjectId)} value={task.project_id}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Mover para projeto..." />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map(project => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div className="mt-8 text-center">
          <Button onClick={() => navigate("/main-menu")} className="bg-blue-600 hover:bg-blue-700">
            Concluir Organização e Voltar ao Menu
          </Button>
        </div>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SEITONPage;