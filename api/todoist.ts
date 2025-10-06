import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Função Serverless para criar tarefas no Todoist.
 * Aceita um array de objetos de tarefas via POST e as envia para a API do Todoist.
 * O token de autenticação do Todoist é obtido de uma variável de ambiente VERCEL_TODOIST_TOKEN.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Garante que apenas requisições POST sejam aceitas
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are supported.' });
  }

  // Obtém o token do Todoist da variável de ambiente
  const todoistToken = process.env.VITE_TODOIST_TOKEN;
  if (!todoistToken) {
    console.error("VITE_TODOIST_TOKEN environment variable not set.");
    return res.status(500).json({ error: 'Server Configuration Error', message: 'Todoist API token is not configured on the server.' });
  }

  const tasksToCreate = req.body;

  // Valida se o corpo da requisição é um array de tarefas
  if (!Array.isArray(tasksToCreate)) {
    return res.status(400).json({ error: 'Bad Request', message: 'Request body must be an array of tasks.' });
  }

  const results = [];
  const errors = [];

  // Processa cada tarefa no array
  for (const task of tasksToCreate) {
    try {
      const response = await fetch('https://api.todoist.com/rest/v2/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${todoistToken}`,
          'Content-Type': 'application/json',
          // 'X-Request-Id' é necessário para garantir idempotência na API do Todoist
          'X-Request-Id': `${Date.now()}-${Math.random().toString(36).substring(2, 15)}` 
        },
        body: JSON.stringify(task)
      });

      if (!response.ok) {
        let errorMessage = `Failed to create task: ${response.statusText}`;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch (jsonError: any) {
            console.warn("Failed to parse JSON error response from Todoist API in /api/todoist:", jsonError);
            errorMessage = `Failed to create task: Invalid API response (non-JSON or malformed JSON). Details: ${jsonError.message}`;
          }
        }
        throw new Error(errorMessage);
      }

      const createdTask = await response.json();
      results.push(createdTask);
    } catch (error: any) {
      console.error(`Error creating task: ${task.content || 'unknown'}:`, error.message);
      errors.push({ task: task.content || 'unknown', error: error.message });
    }
  }

  // Retorna a resposta com base no sucesso ou falha das operações
  if (errors.length > 0) {
    return res.status(500).json({
      status: 'error',
      message: 'Some tasks failed to create.',
      successfulTasks: results,
      failedTasks: errors
    });
  }

  return res.status(200).json({
    status: 'success',
    message: 'All tasks created successfully.',
    tasks: results
  });
}