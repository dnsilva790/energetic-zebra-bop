import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Função Serverless para obter sugestões de horário da IA Gemini para uma tarefa.
 * Aceita taskContent e taskDescription via POST e retorna sugestões de data/hora.
 * O token de autenticação do Gemini é obtido de uma variável de ambiente VERCEL_GEMINI_API_KEY.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are supported.' });
  }

  const geminiApiKey = process.env.VITE_GEMINI_API_KEY; // Usando a mesma variável de ambiente
  if (!geminiApiKey) {
    console.error("VITE_GEMINI_API_KEY environment variable not set.");
    return res.status(500).json({ error: 'Server Configuration Error', message: 'Gemini API key is not configured on the server.' });
  }

  const { taskContent, taskDescription, systemPrompt: customSystemPrompt } = req.body; // Recebe o customSystemPrompt

  if (!taskContent) {
    return res.status(400).json({ error: 'Bad Request', message: 'Missing taskContent in request body.' });
  }

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

  // Obter a data atual para passar para a IA
  const today = new Date();
  const todayDateString = today.toISOString().split('T')[0]; // Formato YYYY-MM-DD

  // Usar o prompt personalizado se fornecido, caso contrário, usar o padrão
  const finalSystemPrompt = customSystemPrompt || `Você é um assistente de produtividade. Dada uma tarefa, sugira 3 a 5 datas e horários ideais para sua conclusão, considerando a complexidade e o tipo de tarefa. Formate cada sugestão como 'YYYY-MM-DD HH:MM - Breve justificativa' ou 'YYYY-MM-DD - Breve justificativa' se não houver horário específico. Priorize sugestões para os próximos 7 dias úteis a partir da data atual. Evite sugerir datas muito distantes no futuro.`;
  const userPrompt = `A data de hoje é ${todayDateString}. Minha tarefa é: "${taskContent}". Descrição: "${taskDescription || 'Nenhuma descrição.'}". Sugira horários.`;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: finalSystemPrompt }] }, // Usa o prompt final
          { role: 'model', parts: [{ text: "Ok, entendi. Por favor, forneça a tarefa." }] }, 
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
      }),
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (jsonError) {
        console.error("Failed to parse Gemini API error response as JSON:", jsonError);
        throw new Error(`Erro na API Gemini: ${response.statusText}. Resposta não-JSON ou vazia.`);
      }
      console.error("Gemini API Error Response:", errorData); 
      throw new Error(errorData.error?.message || `Erro na API Gemini: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível obter sugestões da IA.";

    if (typeof aiResponseContent !== 'string') {
      console.error("Tipo inesperado para aiResponseContent:", typeof aiResponseContent, "Valor:", aiResponseContent);
      throw new Error("O conteúdo da resposta da IA não é uma string. Não é possível processar as sugestões.");
    }

    const datePattern = /(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/;
    
    const processedLines = aiResponseContent.split('\n')
      .map((line: string) => {
        const match = line.match(datePattern);
        return match ? match[1] : null; 
      })
      .filter(Boolean); 

    let suggestions: string[];
    try {
      console.log("Tipo de processedLines antes do slice:", typeof processedLines);
      console.log("Valor de processedLines antes do slice:", processedLines);

      if (!Array.isArray(processedLines)) {
        throw new Error("processedLines não é um array. Não é possível chamar .slice().");
      }
      suggestions = processedLines.slice(0, 5) as string[];
    } catch (sliceError: any) {
      console.error("Erro durante o fatiamento das sugestões:", sliceError);
      throw new Error(`Falha ao fatiar sugestões: ${sliceError.message}`);
    }

    return res.status(200).json({
      status: 'success',
      message: 'AI suggestions retrieved successfully.',
      suggestions: suggestions,
    });

  } catch (error: any) {
    console.error(`Error getting AI suggestions for task ${taskContent}:`, error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get AI suggestions.',
      error: error.message,
    });
  }
}