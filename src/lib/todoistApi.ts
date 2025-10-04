import { toast } from "sonner";
import { TodoistTask, TodoistProject } from "./types"; // Importar os tipos

const TODOIST_CONFIG = {
  baseURL: 'https://api.todoist.com/rest/v2',
};

// Função para obter o token do localStorage
const getTodoistToken = () => {
  return localStorage.getItem('todoist_token');
};

// Função para criar os headers da API
const getApiHeaders = () => {
  const token = getTodoistToken();
  if (!token) {
    console.error("Todoist API token not found in localStorage.");
    toast.error("Token do Todoist não encontrado. Por favor, configure-o na página de Configurações.");
    return {};
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

// Função genérica para lidar com chamadas de API, loading e erros
export async function handleApiCall<T>(apiFunction: () => Promise<T>, loadingMessage: string = "Carregando...", successMessage?: string): Promise<T | undefined> {
  const toastId = toast.loading(loadingMessage);
  try {
    const result = await apiFunction();
    toast.dismiss(toastId);
    if (successMessage) {
      toast.success(successMessage);
    }
    return result;
  } catch (error: any) {
    toast.dismiss(toastId);
    const errorMessage = error.message || "Erro desconhecido na conexão com Todoist.";
    toast.error(`Erro na conexão com Todoist: ${errorMessage}`);
    console.error("Todoist API Error:", error);
    return undefined;
  }
}

// Funções específicas da API do Todoist
export async function getTasks(filter?: string): Promise<TodoistTask[]> {
  const headers = getApiHeaders();
  if (!headers.Authorization) return Promise.reject(new Error("Token de autorização ausente."));
  
  let url = `${TODOIST_CONFIG.baseURL}/tasks`;
  if (filter) {
    url += `?filter=${encodeURIComponent(filter)}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Erro ao buscar tarefas: ${response.statusText}`);
  }
  
  const rawTasks = await response.json();

  // Mapear as tarefas para o formato TodoistTask, ajustando o campo 'due'
  const processedTasks: TodoistTask[] = rawTasks.map((task: any) => {
    let processedDue = null;
    if (task.due) {
      // Prioriza 'datetime' se existir, caso contrário usa 'date'
      const dateValue = task.due.datetime || task.due.date;
      processedDue = {
        date: dateValue, // Armazena o datetime ou date aqui
        string: task.due.string, // Mantém a string humanizada original
        lang: task.due.lang,
        is_recurring: task.due.is_recurring,
      };
    }

    return {
      id: task.id,
      content: task.content,
      description: task.description,
      due: processedDue,
      priority: task.priority,
      is_completed: task.is_completed,
      project_id: task.project_id,
      parent_id: task.parent_id,
      // Outros campos como project_name, classificacao, deadline serão adicionados posteriormente se necessário
    };
  });

  return processedTasks;
}

export async function getProjects(): Promise<TodoistProject[]> {
  const headers = getApiHeaders();
  if (!headers.Authorization) return Promise.reject(new Error("Token de autorização ausente."));
  const response = await fetch(`${TODOIST_CONFIG.baseURL}/projects`, { headers });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Erro ao buscar projetos: ${response.statusText}`);
  }
  return response.json();
}

export async function updateTask(taskId: string, data: any): Promise<TodoistTask> {
  const headers = getApiHeaders();
  if (!headers.Authorization) return Promise.reject(new Error("Token de autorização ausente."));
  const response = await fetch(`${TODOIST_CONFIG.baseURL}/tasks/${taskId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Erro ao atualizar tarefa: ${response.statusText}`);
  }
  // A API do Todoist retorna a tarefa atualizada, mas precisamos processar o 'due' novamente
  const rawUpdatedTask = await response.json();
  let processedDue = null;
  if (rawUpdatedTask.due) {
    const dateValue = rawUpdatedTask.due.datetime || rawUpdatedTask.due.date;
    processedDue = {
      date: dateValue,
      string: rawUpdatedTask.due.string,
      lang: rawUpdatedTask.due.lang,
      is_recurring: rawUpdatedTask.due.is_recurring,
    };
  }
  return {
    id: rawUpdatedTask.id,
    content: rawUpdatedTask.content,
    description: rawUpdatedTask.description,
    due: processedDue,
    priority: rawUpdatedTask.priority,
    is_completed: rawUpdatedTask.is_completed,
    project_id: rawUpdatedTask.project_id,
    parent_id: rawUpdatedTask.parent_id,
  };
}

export async function completeTask(taskId: string): Promise<boolean> {
  const headers = getApiHeaders();
  if (!headers.Authorization) return Promise.reject(new Error("Token de autorização ausente."));
  const response = await fetch(`${TODOIST_CONFIG.baseURL}/tasks/${taskId}/close`, {
    method: 'POST',
    headers
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Erro ao concluir tarefa: ${response.statusText}`);
  }
  // A API do Todoist retorna 204 No Content para sucesso em 'close', então não há JSON para parsear.
  return true; 
}

export async function reopenTask(taskId: string): Promise<boolean> {
  const headers = getApiHeaders();
  if (!headers.Authorization) return Promise.reject(new Error("Token de autorização ausente."));
  const response = await fetch(`${TODOIST_CONFIG.baseURL}/tasks/${taskId}/reopen`, {
    method: 'POST',
    headers
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Erro ao reabrir tarefa: ${response.statusText}`);
  }
  return true;
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const headers = getApiHeaders();
  if (!headers.Authorization) return Promise.reject(new Error("Token de autorização ausente."));
  const response = await fetch(`${TODOIST_CONFIG.baseURL}/tasks/${taskId}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Erro ao deletar tarefa: ${response.statusText}`);
  }
  // A API do Todoist retorna 204 No Content para sucesso em 'delete', então não há JSON para parsear.
  return true;
}

export async function moveTaskToProject(taskId: string, projectId: string): Promise<TodoistTask> {
  return updateTask(taskId, { project_id: projectId });
}

export async function updateTaskDueDate(taskId: string, dueDate: string): Promise<TodoistTask> {
  const headers = getApiHeaders();
  if (!headers.Authorization) return Promise.reject(new Error("Token de autorização ausente."));
  const response = await fetch(`${TODOIST_CONFIG.baseURL}/tasks/${taskId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ due_date: dueDate })
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Erro ao atualizar data de vencimento da tarefa: ${response.statusText}`);
  }
  // A API do Todoist retorna a tarefa atualizada, mas precisamos processar o 'due' novamente
  const rawUpdatedTask = await response.json();
  let processedDue = null;
  if (rawUpdatedTask.due) {
    const dateValue = rawUpdatedTask.due.datetime || rawUpdatedTask.due.date;
    processedDue = {
      date: dateValue,
      string: rawUpdatedTask.due.string,
      lang: rawUpdatedTask.due.lang,
      is_recurring: rawUpdatedTask.due.is_recurring,
    };
  }
  return {
    id: rawUpdatedTask.id,
    content: rawUpdatedTask.content,
    description: rawUpdatedTask.description,
    due: processedDue,
    priority: rawUpdatedTask.priority,
    is_completed: rawUpdatedTask.is_completed,
    project_id: rawUpdatedTask.project_id,
    parent_id: rawUpdatedTask.parent_id,
  };
}