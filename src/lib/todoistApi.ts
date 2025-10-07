import { toast } from "sonner";
import { TodoistTask, TodoistProject, AISuggestion, AISuggestionResponse } from "./types"; // Importar os novos tipos
import { format, parseISO, isValid } from "date-fns";
import { toZonedTime } from 'date-fns-tz'; // Importar toZonedTime

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

// Regex para encontrar e extrair o deadline da descrição
const DEADLINE_REGEX = /\[DEADLINE:\s*(.*?)]/i;

// Helper para converter string de tempo UTC para string de tempo de Brasília
const convertUtcToBrasilia = (date: string, time: string): { data: string | null, hora_brasilia: string | null } => {
  if (!date || !time) {
    return { data: null, hora_brasilia: null };
  }
  const utcDateTimeString = `${date}T${time}:00Z`; // Assume time is HH:MM
  const utcDate = parseISO(utcDateTimeString);
  if (!isValid(utcDate)) {
    console.warn(`CLIENT: Invalid UTC date/time string for conversion: ${utcDateTimeString}`);
    return { data: null, hora_brasilia: null };
  }
  try {
    const brasiliaDate = toZonedTime(utcDate, 'America/Sao_Paulo'); // Usando toZonedTime
    return {
      data: format(brasiliaDate, 'yyyy-MM-dd'),
      hora_brasilia: format(brasiliaDate, 'HH:mm'),
    };
  } catch (tzError: any) {
    console.error(`CLIENT: Error converting timezone for ${utcDateTimeString}:`, tzError);
    return { data: null, hora_brasilia: null };
  }
};

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

    // Extrair deadline da descrição atualizada
    const deadlineMatch = rawUpdatedTask.description?.match(DEADLINE_REGEX);
    const extractedDeadline = deadlineMatch ? deadlineMatch[1] : null;

    return {
      id: rawUpdatedTask.id,
      content: rawUpdatedTask.content,
      description: rawUpdatedTask.description,
      due: processedDue,
      priority: rawUpdatedTask.priority,
      is_completed: rawUpdatedTask.is_completed,
      project_id: rawUpdatedTask.project_id,
      parent_id: rawUpdatedTask.parent_id,
      deadline: extractedDeadline, // Incluir o campo deadline extraído
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

    // Extrair deadline da descrição
    const deadlineMatch = task.description?.match(DEADLINE_REGEX);
    const extractedDeadline = deadlineMatch ? deadlineMatch[1] : null;

    return {
      id: task.id,
      content: task.content,
      description: task.description,
      due: processedDue,
      priority: task.priority,
      is_completed: task.is_completed,
      project_id: task.project_id,
      parent_id: task.parent_id,
      deadline: extractedDeadline, // Incluir o campo deadline extraído
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

  // Extrair deadline da descrição atualizada
  const deadlineMatch = rawUpdatedTask.description?.match(DEADLINE_REGEX);
  const extractedDeadline = deadlineMatch ? deadlineMatch[1] : null;

  return {
    id: rawUpdatedTask.id,
    content: rawUpdatedTask.content,
    description: rawUpdatedTask.description,
    due: processedDue,
    priority: rawUpdatedTask.priority,
    is_completed: rawUpdatedTask.is_completed,
    project_id: rawUpdatedTask.project_id,
    parent_id: rawUpdatedTask.parent_id,
    deadline: extractedDeadline, // Incluir o campo deadline extraído
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

  // Extrair deadline da descrição atualizada
  const deadlineMatch = rawUpdatedTask.description?.match(DEADLINE_REGEX);
  const extractedDeadline = deadlineMatch ? deadlineMatch[1] : null;

  return {
    id: rawUpdatedTask.id,
    content: rawUpdatedTask.content,
    description: rawUpdatedTask.description,
    due: processedDue,
    priority: rawUpdatedTask.priority,
    is_completed: rawUpdatedTask.is_completed,
    project_id: rawUpdatedTask.project_id,
    parent_id: rawUpdatedTask.parent_id,
    deadline: extractedDeadline, // Incluir o campo deadline extraído
  };
}

/**
 * Atualiza o campo 'deadline' de uma tarefa, armazenando-o na descrição.
 * @param taskId O ID da tarefa a ser atualizada.
 * @param newDeadline A nova string de deadline (YYYY-MM-DDTHH:MM:SS) ou null para remover.
 * @returns O objeto TodoistTask atualizado ou undefined em caso de erro.
 */
export async function updateTaskDeadline(taskId: string, newDeadline: string | null): Promise<TodoistTask | undefined> {
  try {
    // 1. Obter a tarefa atual para pegar a descrição
    const currentTask = await handleApiCall(() => getTasks(`id: ${taskId}`), "Obtendo tarefa para atualizar deadline...");
    if (!currentTask || currentTask.length === 0) {
      throw new Error("Tarefa não encontrada para atualizar deadline.");
    }
    const taskToUpdate = currentTask[0];
    let currentDescription = taskToUpdate.description || '';

    // 2. Remover qualquer deadline antigo da descrição
    let updatedDescription = currentDescription.replace(DEADLINE_REGEX, '').trim();

    // 3. Adicionar o novo deadline se não for null
    if (newDeadline) {
      updatedDescription = `${updatedDescription}\n[DEADLINE: ${newDeadline}]`.trim();
    }

    // 4. Chamar a função serverless para atualizar a descrição
    const response = await fetch('/api/update-task-description', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId, contentToAppend: updatedDescription }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Erro ao atualizar deadline da tarefa: ${response.statusText}`);
    }

    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message || 'Erro ao atualizar deadline da tarefa.');
    }
    
    // Mapear a tarefa atualizada para o tipo TodoistTask
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

    // Extrair deadline da descrição atualizada
    const deadlineMatch = rawUpdatedTask.description?.match(DEADLINE_REGEX);
    const extractedDeadline = deadlineMatch ? deadlineMatch[1] : null;

    return {
      id: rawUpdatedTask.id,
      content: rawUpdatedTask.content,
      description: rawUpdatedTask.description,
      due: processedDue,
      priority: rawUpdatedTask.priority,
      is_completed: rawUpdatedTask.is_completed,
      project_id: rawUpdatedTask.project_id,
      parent_id: rawUpdatedTask.parent_id,
      deadline: extractedDeadline, // Incluir o campo deadline extraído
    };

  } catch (error: any) {
    console.error("Client-side error in updateTaskDeadline:", error);
    throw error;
  }
}


/**
 * Obtém sugestões de data e hora da IA para uma tarefa.
 * @param taskContent O conteúdo (título) da tarefa.
 * @param taskDescription A descrição da tarefa.
 * @param systemPrompt O prompt do sistema personalizado para a IA.
 * @param currentDateTime A hora atual no fuso horário de Brasília (ISO string com offset).
 * @param existingAgenda Um array de objetos representando a agenda existente.
 * @returns Um objeto AISuggestionResponse com sugestões de data/hora ou undefined em caso de erro.
 */
export async function getAISuggestedTimes(
  taskContent: string,
  taskDescription: string,
  systemPrompt: string,
  currentDateTime: string,
  existingAgenda: any[]
): Promise<AISuggestionResponse | undefined> {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error("CLIENT: VITE_GEMINI_API_KEY environment variable not set.");
    throw new Error("Chave da API do Gemini não configurada. Por favor, adicione-a ao seu arquivo .env.");
  }

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const processedAgendaExistente = existingAgenda.map((item: any) => {
      if (item.data && item.hora_utc) {
        const { data, hora_brasilia } = convertUtcToBrasilia(item.data, item.hora_utc);
        if (data && hora_brasilia) {
          return {
            tarefa: item.tarefa,
            data: data,
            hora_brasilia: hora_brasilia,
            duracao_min: item.duracao_min,
            prioridade: item.prioridade,
          };
        }
      }
      return null;
    }).filter(Boolean);

    const userPromptContent = {
      hora_atual: currentDateTime,
      nova_tarefa: {
        descricao: taskContent,
        contexto_adicional: taskDescription,
      },
      agenda_existente: processedAgendaExistente,
    };

    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: JSON.stringify(userPromptContent) }] },
        ],
      }),
    });

    if (!geminiResponse.ok) {
      let errorMessage = `Erro na API Gemini: Status ${geminiResponse.status}`;
      let errorDetails = '';
      const contentType = geminiResponse.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await geminiResponse.json();
          errorDetails = errorData.error?.message || errorData.message || JSON.stringify(errorData);
          errorMessage += `. Detalhes: ${errorDetails}`;
        } catch (jsonError: any) {
          console.warn("CLIENT: Failed to parse Gemini API error response as JSON:", jsonError);
          errorMessage += `. Resposta JSON malformada. Erro de parsing: ${jsonError.message}`;
        }
      } else {
        const textError = await geminiResponse.text();
        errorDetails = textError.substring(0, 500);
        errorMessage += `. Resposta: ${errorDetails}`;
      }
      
      console.error("CLIENT: Gemini API Error Response - Status:", geminiResponse.status, "Status Text:", geminiResponse.statusText, "Details:", errorDetails);
      throw new Error(errorMessage);
    }

    const rawGeminiData = await geminiResponse.text();
    console.log("CLIENT: Gemini API response received. Length:", rawGeminiData.length);

    const markdownMatch = rawGeminiData.match(/```json\n([\s\S]*?)\n```/);
    let aiResponseContentString = markdownMatch && markdownMatch[1] ? markdownMatch[1] : rawGeminiData;

    let parsedSuggestions;
    try {
      parsedSuggestions = JSON.parse(aiResponseContentString);
      console.log("CLIENT: Successfully parsed AI response as JSON.");
    } catch (jsonParseError: any) {
      console.error("CLIENT: Failed to parse AI response as JSON:", aiResponseContentString, "Error:", jsonParseError);
      throw new Error(`Falha ao analisar a resposta da IA como JSON: ${jsonParseError.message}`);
    }

    if (!parsedSuggestions || typeof parsedSuggestions !== 'object' || parsedSuggestions === null) {
      console.error("CLIENT: A resposta da IA não é um objeto JSON válido ou é nula.");
      throw new Error("A resposta da IA não está no formato esperado (objeto principal ausente ou inválido).");
    }
    if (!Object.prototype.hasOwnProperty.call(parsedSuggestions, 'sugestoes')) {
      console.error("CLIENT: A resposta da IA não possui a propriedade 'sugestoes'.");
      throw new Error("A resposta da IA não está no formato esperado (propriedade 'sugestoes' ausente).");
    }
    if (Object.prototype.toString.call(parsedSuggestions.sugestoes) !== '[object Array]') {
      console.error("CLIENT: A propriedade 'sugestoes' da resposta da IA não é um array. Tipo real:", typeof parsedSuggestions.sugestoes, "Valor:", parsedSuggestions.sugestoes);
      throw new Error("A resposta da IA não está no formato esperado (propriedade 'sugestoes' não é um array).");
    }

    return {
      sugestoes: parsedSuggestions.sugestoes,
      metadata: parsedSuggestions.metadata,
    };

  } catch (error: any) {
    console.error(`CLIENT: Error during Gemini API call or parsing:`, error.message, error.stack);
    throw error;
  }
}