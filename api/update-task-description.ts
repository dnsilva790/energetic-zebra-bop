import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Função Serverless para atualizar a descrição de uma tarefa no Todoist.
 * Aceita taskId e contentToAppend via POST, recupera a descrição atual,
 * anexa o novo conteúdo com um timestamp e atualiza a tarefa.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are supported.' });
  }

  const todoistToken = process.env.VITE_TODOIST_TOKEN;
  if (!todoistToken) {
    console.error("VITE_TODOIST_TOKEN environment variable not set.");
    return res.status(500).json({ error: 'Server Configuration Error', message: 'Todoist API token is not configured on the server.' });
  }

  const { taskId, contentToAppend } = req.body;

  if (!taskId || !contentToAppend) {
    return res.status(400).json({ error: 'Bad Request', message: 'Missing taskId or contentToAppend in request body.' });
  }

  try {
    // 1. Recuperar a tarefa existente para obter a descrição atual
    const getResponse = await fetch(`https://api.todoist.com/rest/v2/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${todoistToken}`,
      },
    });

    if (!getResponse.ok) {
      const errorData = await getResponse.json();
      throw new Error(errorData.error || `Failed to fetch task: ${getResponse.statusText}`);
    }
    const existingTask = await getResponse.json();
    const currentDescription = existingTask.description || '';

    // 2. Gerar o carimbo de data/hora
    const timestamp = new Date().toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const timestampSeparator = `\n\n--- [${timestamp}] - PASSO SEISO ---\n`;

    // 3. Construir a nova descrição
    const newDescription = `${currentDescription}${timestampSeparator}${contentToAppend}`;

    // 4. Atualizar a tarefa com a nova descrição
    const updateResponse = await fetch(`https://api.todoist.com/rest/v2/tasks/${taskId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${todoistToken}`,
        'Content-Type': 'application/json',
        // 'X-Request-Id' é necessário para garantir idempotência na API do Todoist
        'X-Request-Id': `${Date.now()}-${Math.random().toString(36).substring(2, 15)}` 
      },
      body: JSON.stringify({ description: newDescription }),
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(errorData.error || `Failed to update task description: ${updateResponse.statusText}`);
    }

    const updatedTask = await updateResponse.json();
    return res.status(200).json({
      status: 'success',
      message: 'Task description updated successfully.',
      task: updatedTask,
    });

  } catch (error: any) {
    console.error(`Error updating task description for task ${taskId}:`, error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update task description.',
      error: error.message,
    });
  }
}