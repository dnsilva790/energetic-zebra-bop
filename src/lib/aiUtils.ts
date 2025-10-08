import { TodoistTask } from "./types";
import { AI_CONTEXT_PROMPT_KEY } from "./constants";

const DEFAULT_AI_CONTEXT_PROMPT = `Dada a seguinte tarefa, classifique-a como 'pessoal' ou 'profissional'. Responda apenas com 'pessoal' ou 'profissional'.`;

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export const getAIContextPrompt = (): string => {
  return localStorage.getItem(AI_CONTEXT_PROMPT_KEY) || DEFAULT_AI_CONTEXT_PROMPT;
};

export const classifyTaskContext = async (task: TodoistTask): Promise<'pessoal' | 'profissional' | 'indefinido'> => {
  if (!GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not configured. Cannot classify task context.");
    return 'indefinido';
  }

  const systemPrompt = getAIContextPrompt();
  const taskDetails = `Tarefa: "${task.content}". Descrição: "${task.description || 'Nenhuma descrição.'}".`;
  const prompt = `${systemPrompt}\n${taskDetails}`;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      let errorMessage = `Erro na API Gemini: ${response.status} ${response.statusText}`;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorData.message || errorMessage;
        } catch (jsonError: any) {
          console.warn("Failed to parse JSON error response from Gemini API:", jsonError);
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const candidates = data.candidates;
    const aiResponseContent = (Array.isArray(candidates) && candidates.length > 0 && candidates[0]?.content?.parts?.[0]?.text) || "indefinido";
    
    console.log(`classifyTaskContext - Raw AI response for "${task.content}": "${aiResponseContent}"`); // Add this log
    
    const classification = aiResponseContent.toLowerCase().trim();

    if (classification === 'pessoal' || classification === 'profissional') {
      return classification;
    }
    return 'indefinido';

  } catch (error: any) {
    console.error(`Error classifying task context for "${task.content}":`, error);
    // Re-throw the error so the calling component can handle it more specifically
    throw error; 
  }
};