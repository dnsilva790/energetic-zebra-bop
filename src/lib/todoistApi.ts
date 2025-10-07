import { toast } from "sonner";
import { TodoistTask, TodoistProject } from "./types"; 
import { format, parseISO, isValid } from "date-fns";
import { toZonedTime } from 'date-fns-tz'; 

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

/**
 * Cria uma ou mais tarefas no Todoist através do endpoint Serverless.
 * @param tasks Um array de objetos de tarefa a serem criados.
 * @returns Um array das tarefas criadas ou undefined em caso de erro.
 */
export async function createTasks(tasks: any[]): Promise<TodoistTask[] | undefined> {
  try {
    const response = await fetch('/api/todoist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tasks),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Erro ao criar tarefas: ${response.statusText}`);
    }

    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message || 'Erro ao criar algumas tarefas.');
    }
    return result.tasks;
  } catch (error: any) {
    console.error("Client-side error calling /api/todoist:", error);
    throw error; // Re-throw para ser capturado por handleApiCall
  }
}

/**
 * Atualiza a descrição de uma tarefa do Todoist anexando novo conteúdo com um timestamp.
 * @param taskId O ID da tarefa a ser atualizada.
 * @param contentToAppend O novo conteúdo a ser anexado à descrição.
 * @returns O objeto TodoistTask atualizado ou undefined em caso de erro.
 */
export async function updateTaskDescription(taskId: string, contentToAppend: string): Promise<TodoistTask | undefined> {
  try {
    const response = await fetch('/api/update-task-description', { // Chama a nova função serverless
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId, contentToAppend }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Erro ao atualizar descrição da tarefa: ${response.statusText}`);
    }

    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message || 'Erro ao atualizar descrição da tarefa.');
    }
    // A função serverless retorna a tarefa atualizada, mas precisamos mapeá-la para o tipo TodoistTask
    const rawUpdatedTask = result.task;
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

    // Mapear o campo deadline nativo do Todoist
    let processedDeadline = null;
    if (rawUpdatedTask.deadline && rawUpdatedTask.deadline.date) {
      processedDeadline = {
        date: rawUpdatedTask.deadline.date,
      };
    }

    // Extrair labels, durationMinutes e contextType
    const labels: string[] = rawUpdatedTask.labels || [];
    let durationMinutes: number | undefined;
    let contextType: 'pessoal' | 'profissional' | undefined;

    labels.forEach(label => {
      if (label.startsWith('duracao:')) {
        const durationStr = label.substring('duracao:'.length);
        const matchMinutes = durationStr.match(/(\d+)m/);
        const matchHours = durationStr.match(/(\d+)h/);
        if (matchMinutes) {
          durationMinutes = parseInt(matchMinutes[1]);
        } else if (matchHours) {
          durationMinutes = parseInt(matchHours[1]) * 60;
        }
      } else if (label === 'contexto:pessoal') {
        contextType = 'pessoal';
      } else if (label === 'contexto:profissional') {
        contextType = 'profissional';
      }
    });

    return {
      id: rawUpdatedTask.id,
      content: rawUpdatedTask.content,
      description: rawUpdatedTask.description,
      due: processedDue,
      priority: rawUpdatedTask.priority,
      is_completed: rawUpdatedTask.is_completed,
      project_id: rawUpdatedTask.project_id,
      parent_id: rawUpdatedTask.parent_id,
      deadline: processedDeadline, // Incluir o campo deadline nativo
      labels: labels,
      durationMinutes: durationMinutes,
      contextType: contextType,
    };
  } catch (error: any) {
    console.error("Client-side error calling /api/update-task-description:", error);
    throw error; // Re-throw para ser capturado por handleApiCall
  }
}


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

  // Mapear as tarefas para o formato TodoistTask, ajustando o campo 'due' e 'deadline'
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

    // Mapear o campo deadline nativo do Todoist
    let processedDeadline = null;
    if (task.deadline && task.deadline.date) {
      processedDeadline = {
        date: task.deadline.date,
      };
    }

    // Extrair labels, durationMinutes e contextType
    const labels: string[] = task.labels || [];
    let durationMinutes: number | undefined;
    let contextType: 'pessoal' | 'profissional' | undefined;

    labels.forEach(label => {
      if (label.startsWith('duracao:')) {
        const durationStr = label.substring('duracao:'.length);
        const matchMinutes = durationStr.match(/(\d+)m/);
        const matchHours = durationStr.match(/(\d+)h/);
        if (matchMinutes) {
          durationMinutes = parseInt(matchMinutes[1]);
        } else if (matchHours) {
          durationMinutes = parseInt(matchHours[1]) * 60;
        }
      } else if (label === 'contexto:pessoal') {
        contextType = 'pessoal';
      } else if (label === 'contexto:profissional') {
        contextType = 'profissional';
      }
    });

    return {
      id: task.id,
      content: task.content,
      description: task.description,
      due: processedDue,
      priority: task.priority,
      is_completed: task.is_completed,
      project_id: task.project_id,
      parent_id: task.parent_id,
      deadline: processedDeadline, // Incluir o campo deadline nativo
      labels: labels,
      durationMinutes: durationMinutes,
      contextType: contextType,
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
  // A API do Todoist retorna a tarefa atualizada, mas precisamos processar o 'due' e 'deadline' novamente
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

  // Mapear o campo deadline nativo do Todoist
  let processedDeadline = null;
  if (rawUpdatedTask.deadline && rawUpdatedTask.deadline.date) {
    processedDeadline = {
      date: rawUpdatedTask.deadline.date,
    };
  }

  // Extrair labels, durationMinutes e contextType
  const labels: string[] = rawUpdatedTask.labels || [];
  let durationMinutes: number | undefined;
  let contextType: 'pessoal' | 'profissional' | undefined;

  labels.forEach(label => {
    if (label.startsWith('duracao:')) {
      const durationStr = label.substring('duracao:'.length);
      const matchMinutes = durationStr.match(/(\d+)m/);
      const matchHours = durationStr.match(/(\d+)h/);
      if (matchMinutes) {
        durationMinutes = parseInt(matchMinutes[1]);
      } else if (matchHours) {
        durationMinutes = parseInt(matchHours[1]) * 60;
      }
    } else if (label === 'contexto:pessoal') {
      contextType = 'pessoal';
    } else if (label === 'contexto:profissional') {
      contextType = 'profissional';
    }
  });

  return {
    id: rawUpdatedTask.id,
    content: rawUpdatedTask.content,
    description: rawUpdatedTask.description,
    due: processedDue,
    priority: rawUpdatedTask.priority,
    is_completed: rawUpdatedTask.is_completed,
    project_id: rawUpdatedTask.project_id,
    parent_id: rawUpdatedTask.parent_id,
    deadline: processedDeadline, // Incluir o campo deadline nativo
    labels: labels,
    durationMinutes: durationMinutes,
    contextType: contextType,
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
    let errorMessage = `Erro ao concluir tarefa: ${response.status} ${response.statusText}`;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (jsonError: any) {
        console.warn("Falha ao analisar resposta JSON de erro em completeTask:", jsonError);
        errorMessage = `Erro ao concluir tarefa: Resposta inválida da API (não-JSON ou JSON malformado). Detalhes: ${jsonError.message}`;
      }
    }
    throw new Error(errorMessage);
  }
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
    let errorMessage = `Erro ao reabrir tarefa: ${response.status} ${response.statusText}`;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (jsonError: any) {
        console.warn("Falha ao analisar resposta JSON de erro em reopenTask:", jsonError);
        errorMessage = `Erro ao reabrir tarefa: Resposta inválida da API (não-JSON ou JSON malformado). Detalhes: ${jsonError.message}`;
      }
    }
    throw new Error(errorMessage);
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
    let errorMessage = `Erro ao deletar tarefa: ${response.status} ${response.statusText}`;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (jsonError: any) {
        console.warn("Falha ao analisar resposta JSON de erro em deleteTask:", jsonError);
        errorMessage = `Erro ao deletar tarefa: Resposta inválida da API (não-JSON ou JSON malformado). Detalhes: ${jsonError.message}`;
      }
    }
    throw new Error(errorMessage);
  }
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
  // A API do Todoist retorna a tarefa atualizada, mas precisamos processar o 'due' e 'deadline' novamente
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

  // Mapear o campo deadline nativo do Todoist
  let processedDeadline = null;
  if (rawUpdatedTask.deadline && rawUpdatedTask.deadline.date) {
    processedDeadline = {
      date: rawUpdatedTask.deadline.date,
    };
  }

  // Extrair labels, durationMinutes e contextType
  const labels: string[] = rawUpdatedTask.labels || [];
  let durationMinutes: number | undefined;
  let contextType: 'pessoal' | 'profissional' | undefined;

  labels.forEach(label => {
    if (label.startsWith('duracao:')) {
      const durationStr = label.substring('duracao:'.length);
      const matchMinutes = durationStr.match(/(\d+)m/);
      const matchHours = durationStr.match(/(\d+)h/);
      if (matchMinutes) {
        durationMinutes = parseInt(matchMinutes[1]);
      } else if (matchHours) {
        durationMinutes = parseInt(matchHours[1]) * 60;
      }
    } else if (label === 'contexto:pessoal') {
      contextType = 'pessoal';
    } else if (label === 'contexto:profissional') {
      contextType = 'profissional';
    }
  });

  return {
    id: rawUpdatedTask.id,
    content: rawUpdatedTask.content,
    description: rawUpdatedTask.description,
    due: processedDue,
    priority: rawUpdatedTask.priority,
    is_completed: rawUpdatedTask.is_completed,
    project_id: rawUpdatedTask.project_id,
    parent_id: rawUpdatedTask.parent_id,
    deadline: processedDeadline, // Incluir o campo deadline nativo
    labels: labels,
    durationMinutes: durationMinutes,
    contextType: contextType,
  };
}

/**
 * Atualiza o campo 'deadline' de uma tarefa usando o campo nativo do Todoist.
 * @param taskId O ID da tarefa a ser atualizada.
 * @param newDeadlineDate A nova string de data limite (YYYY-MM-DD) ou null para remover.
 * @returns O objeto TodoistTask atualizado ou undefined em caso de erro.
 */
export async function updateTaskDeadline(taskId: string, newDeadlineDate: string | null): Promise<TodoistTask | undefined> {
  try {
    const headers = getApiHeaders();
    if (!headers.Authorization) throw new Error("Token de autorização ausente.");

    const body: { deadline?: { date: string } | null } = {};
    if (newDeadlineDate) {
      body.deadline = { date: newDeadlineDate };
    } else {
      body.deadline = null; // Para remover a data limite
    }

    const response = await fetch(`${TODOIST_CONFIG.baseURL}/tasks/${taskId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Erro ao atualizar data limite da tarefa: ${response.statusText}`);
    }

    const rawUpdatedTask = await response.json();
    
    // Processar o campo 'due'
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

    // Processar o campo 'deadline' nativo
    let processedDeadline = null;
    if (rawUpdatedTask.deadline && rawUpdatedTask.deadline.date) {
      processedDeadline = {
        date: rawUpdatedTask.deadline.date,
      };
    }

    // Extrair labels, durationMinutes e contextType
    const labels: string[] = rawUpdatedTask.labels || [];
    let durationMinutes: number | undefined;
    let contextType: 'pessoal' | 'profissional' | undefined;

    labels.forEach(label => {
      if (label.startsWith('duracao:')) {
        const durationStr = label.substring('duracao:'.length);
        const matchMinutes = durationStr.match(/(\d+)m/);
        const matchHours = durationStr.match(/(\d+)h/);
        if (matchMinutes) {
          durationMinutes = parseInt(matchMinutes[1]);
        } else if (matchHours) {
          durationMinutes = parseInt(matchHours[1]) * 60;
        }
      } else if (label === 'contexto:pessoal') {
        contextType = 'pessoal';
      } else if (label === 'contexto:profissional') {
        contextType = 'profissional';
      }
    });

    return {
      id: rawUpdatedTask.id,
      content: rawUpdatedTask.content,
      description: rawUpdatedTask.description,
      due: processedDue,
      priority: rawUpdatedTask.priority,
      is_completed: rawUpdatedTask.is_completed,
      project_id: rawUpdatedTask.project_id,
      parent_id: rawUpdatedTask.parent_id,
      deadline: processedDeadline,
      labels: labels,
      durationMinutes: durationMinutes,
      contextType: contextType,
    };

  } catch (error: any) {
    console.error("Client-side error in updateTaskDeadline:", error);
    throw error;
  }
}