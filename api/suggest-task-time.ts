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

  const { taskContent, taskDescription } = req.body;

  if (!taskContent) {
    return res.status(400).json({ error: 'Bad Request', message: 'Missing taskContent in request body.' });
  }

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

  const systemPrompt = `Você é um assistente de produtividade. Dada uma tarefa, sugira 3 a 5 datas e horários ideais para sua conclusão, considerando a complexidade e o tipo de tarefa. Formate cada sugestão como 'YYYY-MM-DD HH:MM - Breve justificativa' ou 'YYYY-MM-DD - Breve justificativa' se não houver horário específico. Use a data atual como referência para 'hoje'. Priorize sugestões para os próximos dias úteis.`;
  const userPrompt = `Minha tarefa é: "${taskContent}". Descrição: "${taskDescription || 'Nenhuma descrição.'}". Sugira horários.`;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: "Ok, entendi. Por favor, forneça a tarefa." }] }, // Exemplo de resposta do modelo para o prompt do sistema
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
      console.error("Gemini API Error Response:", errorData); // Log detalhado do erro
      throw new Error(errorData.error?.message || `Erro na API Gemini: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível obter sugestões da IA.";

    // Adicionando uma verificação defensiva para o tipo de aiResponseContent
    if (typeof aiResponseContent !== 'string') {
      console.error("Tipo inesperado para aiResponseContent:", typeof aiResponseContent, "Valor:", aiResponseContent);
      throw new Error("O conteúdo da resposta da IA não é uma string. Não é possível processar as sugestões.");
    }

    const datePattern = /(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/;
    
    const processedLines = aiResponseContent.split('\n')
      .map((line: string) => {
        const match = line.match(datePattern);
        return match ? match[1] : null; // Retorna apenas a parte da data/hora
      })
      .filter(Boolean); // Isso deve sempre retornar um array

    let suggestions: string[];
    try {
      // Logs para depuração antes do slice
      console.log("Tipo de processedLines antes do slice:", typeof processedLines);
      console.log("Valor de processedLines antes do slice:", processedLines);

      // Verificação final para garantir que é um array antes de chamar slice
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