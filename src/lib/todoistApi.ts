import { toast } from "sonner";
import { TodoistTask, TodoistProject, AISuggestion, AISuggestionResponse } from "./types"; 
import { format, parseISO, isValid } from "date-fns";
import { toZonedTime } from 'date-fns-tz'; 

const TODOIST_CONFIG = {
  baseURL: 'https://api.todoist.com/rest/v2',
};

// Chave para o prompt de sugestão de IA
const AI_SUGGESTION_SYSTEM_PROMPT_KEY = 'ai_suggestion_system_prompt';
const DEFAULT_SUGGESTION_SYSTEM_PROMPT = `Você é um assistente de IA especializado em produtividade e organização de tarefas, com foco em pessoas com TDAH. Sua função é analisar uma nova tarefa e a agenda existente do usuário para sugerir 3 horários ideais para a execução da tarefa.

As sugestões devem ser baseadas em:
1.  **Prioridade da tarefa**: Tarefas P1 (prioridade 4) são urgentes, P2 (prioridade 3) são importantes, P3 (prioridade 2) são médias, P4 (prioridade 1) são baixas.
2.  **Demanda cognitiva da tarefa**: Alta, Média, Baixa.
3.  **Duração estimada**: Em minutos.
4.  **Janelas de produtividade do usuário**:
    *   "Ouro": Períodos de alta energia e foco (manhã cedo).
    *   "Intermediária": Períodos de energia moderada (final da manhã, início da tarde).
    *   "Declínio": Períodos de baixa energia (final da tarde, noite).
    *   "Pessoal": Horários fora do trabalho, para tarefas pessoais.
5.  **Conflitos com a agenda existente**: Evitar sobreposições.

Para cada sugestão, forneça:
-   \`data\`: Data no formato YYYY-MM-DD.
-   \`hora\`: Hora no formato HH:MM (fuso horário de Brasília).
-   \`prioridade_sugestao\`: Um número de 1 (melhor) a 5 (pior) para a qualidade da sugestão.
-   \`badge\`: Uma string curta para a UI (ex: "🟢 HOJE", "⭐ IDEAL", "✅ VIÁVEL", "⚠️ SUBÓTIMO").
-   \`titulo\`: Um título curto para a sugestão (máx. 50 caracteres).
-   \`justificativa\`: 1-2 frases explicando por que essa sugestão é boa.
-   \`janela\`: A janela de produtividade ("ouro", "intermediaria", "declinio", "pessoal").
-   \`reasoning\`: (Interno, para debug) Um breve raciocínio sobre a escolha.

A resposta DEVE ser um objeto JSON, formatado dentro de um bloco de código markdown \`\`\`json\`, com as seguintes chaves:
-   \`sugestoes\`: Um array de objetos \`AISuggestion\`.
-   \`metadata\`: Um objeto \`AITaskMetadata\` contendo:
    -   \`tipo_tarefa\`: "PROFISSIONAL" ou "PESSOAL".
    -   \`demanda_cognitiva\`: "ALTA", "MEDIA" ou "BAIXA".
    -   \`duracao_estimada_min\`: Número estimado de minutos.
    -   \`tarefas_p4_ignoradas\`: Número de tarefas P4 ignoradas na agenda (se aplicável).

Exemplo de JSON de saída:
\`\`\`json
{
  "sugestoes": [
    {
      "data": "2024-08-01",
      "hora": "09:00",
      "prioridade_sugestao": 1,
      "badge": "⭐ IDEAL",
      "titulo": "Manhã de alta energia",
      "justificativa": "Aproveite seu pico de foco para esta tarefa complexa.",
      "janela": "ouro",
      "reasoning": "Alta demanda cognitiva, janela ouro disponível."
    },
    {
      "data": "2024-08-01",
      "hora": "14:30",
      "prioridade_sugestao": 2,
      "badge": "✅ VIÁVEL",
      "titulo": "Pós-almoço, bom para foco",
      "justificativa": "Período intermediário, ideal para tarefas de média complexidade.",
      "janela": "intermediaria",
      "reasoning": "Média demanda cognitiva, janela intermediária disponível."
    }
  ],
  "metadata": {
    "tipo_tarefa": "PROFISSIONAL",
    "demanda_cognitiva": "ALTA",
    "duracao_estimada_min": 60,
    "tarefas_p4_ignoradas": 0
  }
}
\`\`\`
`;

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
 * @param currentDateTime A hora atual no fuso horário de Brasília (ISO string com offset).
 * @param existingAgenda Um array de objetos representando a agenda existente.
 * @returns Um objeto AISuggestionResponse com sugestões de data/hora ou undefined em caso de erro.
 */
export async function getAISuggestedTimes(
  taskContent: string,
  taskDescription: string,
  currentDateTime: string,
  existingAgenda: TodoistTask[] // Alterado para TodoistTask[]
): Promise<AISuggestionResponse | undefined> {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error("CLIENT: VITE_GEMINI_API_KEY environment variable not set.");
    throw new Error("Chave da API do Gemini não configurada. Por favor, adicione-a ao seu arquivo .env.");
  }

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const systemPrompt = localStorage.getItem(AI_SUGGESTION_SYSTEM_PROMPT_KEY) || DEFAULT_SUGGESTION_SYSTEM_PROMPT;

  try {
    const processedAgendaExistente = existingAgenda.map((task: TodoistTask) => {
      if (task.due?.date) {
        // Convertendo a data de vencimento da tarefa para o formato esperado pela IA
        const dueDate = parseISO(task.due.date);
        if (isValid(dueDate)) {
          const timeString = task.due.string.match(/(\d{2}:\d{2})/); // Tenta extrair HH:MM
          const hora_utc = timeString ? timeString[1] : '09:00'; // Default para 09:00 se não houver hora

          const { data, hora_brasilia } = convertUtcToBrasilia(format(dueDate, 'yyyy-MM-dd'), hora_utc);
          
          return {
            tarefa: task.content,
            data: data,
            hora_brasilia: hora_brasilia,
            duracao_estimada_min: 60, // Placeholder, IA pode inferir ou usuário pode definir
            prioridade: task.priority,
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
          errorMessage = `Erro ao obter sugestões da IA: Resposta JSON malformada. Erro de parsing: ${jsonError.message}`;
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
    console.log("CLIENT: Raw Gemini API response:", rawGeminiData); // Log the raw response

    const markdownMatch = rawGeminiData.match(/```json\n([\s\S]*?)\n```/);
    let aiResponseContentString = markdownMatch && markdownMatch[1] ? markdownMatch[1] : rawGeminiData;
    console.log("CLIENT: Extracted AI response content string (after markdown match):", aiResponseContentString); // Log extracted string

    let parsedSuggestions;
    try {
      parsedSuggestions = JSON.parse(aiResponseContentString);
      console.log("CLIENT: Successfully parsed AI response as JSON.");
      console.log("CLIENT: Parsed AI response object:", parsedSuggestions); // Log the parsed object
    } catch (jsonParseError: any) {
      console.error("CLIENT: Failed to parse AI response as JSON:", aiResponseContentString, "Error:", jsonParseError);
      throw new Error(`Falha ao analisar a resposta da IA como JSON: ${jsonParseError.message}`);
    }

    if (!parsedSuggestions || typeof parsedSuggestions !== 'object' || parsedSuggestions === null) {
      console.error("CLIENT: A resposta da IA não é um objeto JSON válido ou é nula.");
      throw new Error("A resposta da IA não está no formato esperado (objeto principal ausente ou inválido).");
    }
    console.log("CLIENT: Checking for 'sugestoes' property in parsed object."); // New log
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