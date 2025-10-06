import type { VercelRequest, VercelResponse } from '@vercel/node';
import { format, parseISO, isValid } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz'; // Importar especificamente utcToZonedTime

// Helper to convert UTC time string to Brasília time string
const convertUtcToBrasilia = (date: string, time: string): { data: string | null, hora_brasilia: string | null } => {
  if (!date || !time) {
    return { data: null, hora_brasilia: null };
  }
  const utcDateTimeString = `${date}T${time}:00Z`; // Assume time is HH:MM
  const utcDate = parseISO(utcDateTimeString);
  if (!isValid(utcDate)) {
    console.warn(`Invalid UTC date/time string for conversion: ${utcDateTimeString}`);
    return { data: null, hora_brasilia: null };
  }
  try {
    const brasiliaDate = utcToZonedTime(utcDate, 'America/Sao_Paulo');
    return {
      data: format(brasiliaDate, 'yyyy-MM-dd'),
      hora_brasilia: format(brasiliaDate, 'HH:mm'),
    };
  } catch (tzError: any) {
    console.error(`Error converting timezone for ${utcDateTimeString}:`, tzError);
    return { data: null, hora_brasilia: null };
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { // Outer try-catch to catch any unhandled errors in the function
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are supported.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY; 
    if (!geminiApiKey) {
      console.error("GEMINI_API_KEY environment variable not set.");
      return res.status(500).json({ error: 'Server Configuration Error', message: 'Gemini API key is not configured on the server.' });
    }

    const { systemPrompt, hora_atual, nova_tarefa, agenda_existente } = req.body;

    if (!systemPrompt || !hora_atual || !nova_tarefa || !agenda_existente) {
      return res.status(400).json({ error: 'Bad Request', message: 'Missing systemPrompt, hora_atual, nova_tarefa, or agenda_existente in request body.' });
    }

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`; // Usando 1.5-flash para melhor manipulação de JSON

    // Convert existing agenda tasks from UTC to Brasília for the prompt
    const processedAgendaExistente = agenda_existente.map((item: any) => {
      if (item.data && item.hora_utc) {
        const { data, hora_brasilia } = convertUtcToBrasilia(item.data, item.hora_utc);
        if (data && hora_brasilia) { // Apenas inclui se ambos data e hora_brasilia são válidos
          return {
            tarefa: item.tarefa,
            data: data,
            hora_brasilia: hora_brasilia, // Adiciona hora_brasilia para clareza no prompt
            duracao_min: item.duracao_min,
            prioridade: item.prioridade,
          };
        }
      }
      return null; // Retorna nulo para itens inválidos, que serão filtrados
    }).filter(Boolean); // Remove quaisquer itens nulos

    const userPromptContent = {
      hora_atual: hora_atual, // Isso já deve estar no horário de Brasília com offset do cliente
      nova_tarefa: nova_tarefa,
      agenda_existente: processedAgendaExistente,
    };

    let geminiResponse;
    try {
      geminiResponse = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: "Ok, entendi. Por favor, forneça o contexto da tarefa e da agenda." }] },
            { role: 'user', parts: [{ text: JSON.stringify(userPromptContent) }] },
          ],
          generationConfig: {
            responseMimeType: "application/json", // Solicita saída JSON
          },
        }),
      });

      if (!geminiResponse.ok) {
        let errorData;
        const contentType = geminiResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            errorData = await geminiResponse.json();
          } catch (jsonError) {
            console.error("Failed to parse Gemini API error response as JSON:", jsonError);
            throw new Error(`Erro na API Gemini: ${geminiResponse.statusText}. Resposta não-JSON ou malformada.`);
          }
        } else {
          const textError = await geminiResponse.text();
          console.error("Gemini API Non-JSON Error Response:", textError);
          throw new Error(`Erro na API Gemini: ${geminiResponse.statusText}. Resposta: ${textError.substring(0, 200)}`);
        }
        console.error("Gemini API Error Response:", errorData);
        throw new Error(errorData.error?.message || `Erro na API Gemini: ${geminiResponse.statusText}`);
      }

      const data = await geminiResponse.json();
      const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof aiResponseContent !== 'string') {
        console.error("Unexpected type for aiResponseContent:", typeof aiResponseContent, "Value:", aiResponseContent);
        throw new Error("O conteúdo da resposta da IA não é uma string. Não é possível processar as sugestões.");
      }

      let parsedSuggestions;
      try {
        parsedSuggestions = JSON.parse(aiResponseContent);
      } catch (jsonParseError: any) {
        console.error("Failed to parse AI response as JSON:", jsonParseContent, "Raw content:", aiResponseContent);
        throw new Error(`Falha ao analisar a resposta da IA como JSON: ${jsonParseError.message}`);
      }

      // Validate the structure of parsedSuggestions
      if (!parsedSuggestions || !Array.isArray(parsedSuggestions.sugestoes)) {
        console.error("AI response does not contain a 'sugestoes' array:", parsedSuggestions);
        throw new Error("A resposta da IA não está no formato esperado (missing 'sugestoes' array).");
      }

      return res.status(200).json({
        status: 'success',
        message: 'AI suggestions retrieved successfully.',
        suggestions: parsedSuggestions.sugestoes, // Retorna as sugestões estruturadas
        metadata: parsedSuggestions.metadata,
      });

    } catch (geminiCallError: any) {
      console.error(`Error during Gemini API call or parsing:`, geminiCallError.message);
      // Re-throw to be caught by the outer try-catch
      throw geminiCallError;
    }

  } catch (error: any) {
    console.error(`Unhandled error in /api/suggest-task-time:`, error.message, error.stack);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get AI suggestions due to an internal server error.',
      error: error.message,
    });
  }
}