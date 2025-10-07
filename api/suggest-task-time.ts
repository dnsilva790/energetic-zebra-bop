import type { VercelRequest, VercelResponse } from '@vercel/node';
import { format, parseISO, isValid } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// Helper to convert UTC time string to Brasília time string
const convertUtcToBrasilia = (date: string, time: string): { data: string | null, hora_brasilia: string | null } => {
  if (!date || !time) {
    return { data: null, hora_brasilia: null };
  }
  const utcDateTimeString = `${date}T${time}:00Z`; // Assume time is HH:MM
  const utcDate = parseISO(utcDateTimeString);
  if (!isValid(utcDate)) {
    console.warn(`SERVERLESS: Invalid UTC date/time string for conversion: ${utcDateTimeString}`);
    return { data: null, hora_brasilia: null };
  }
  try {
    const brasiliaDate = toZonedTime(utcDate, 'America/Sao_Paulo'); // Usando toZonedTime
    return {
      data: format(brasiliaDate, 'yyyy-MM-dd'),
      hora_brasilia: format(brasiliaDate, 'HH:mm'),
    };
  } catch (tzError: any) {
    console.error(`SERVERLESS: Error converting timezone for ${utcDateTimeString}:`, tzError);
    return { data: null, hora_brasilia: null };
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== suggest-task-time called ===');
  console.log('Request body:', req.body);
  console.log('Environment check:', {
    hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
    // Do NOT log the actual key!
  });

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are supported.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error("SERVERLESS: GEMINI_API_KEY environment variable not set.");
      return res.status(500).json({ error: 'Server Configuration Error', message: 'Gemini API key is not configured on the server.' });
    }

    const { systemPrompt, hora_atual, nova_tarefa, agenda_existente } = req.body;

    if (!systemPrompt || !hora_atual || !nova_tarefa || !agenda_existente) {
      console.error("SERVERLESS: Missing required fields in request body.", { systemPrompt: !!systemPrompt, hora_atual: !!hora_atual, nova_tarefa: !!nova_tarefa, agenda_existente: !!agenda_existente });
      return res.status(400).json({ error: 'Bad Request', message: 'Missing systemPrompt, hora_atual, nova_tarefa, or agenda_existente in request body.' });
    }

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const processedAgendaExistente = agenda_existente.map((item: any) => {
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
      hora_atual: hora_atual,
      nova_tarefa: nova_tarefa,
      agenda_existente: processedAgendaExistente,
    };

    console.log("SERVERLESS: User prompt content sent to Gemini:", JSON.stringify(userPromptContent, null, 2));

    let geminiResponse;
    try {
      geminiResponse = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            { role: 'user', parts: [{ text: JSON.stringify(userPromptContent) }] },
          ],
          generationConfig: {
            responseMimeType: "application/json", // This makes Gemini return a parsed JSON object in 'text'
          },
        }),
      });

      if (!geminiResponse.ok) {
        let errorData;
        const contentType = geminiResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            errorData = await geminiResponse.json();
          } catch (jsonError: any) {
            console.error("SERVERLESS: Failed to parse Gemini API error response as JSON:", jsonError);
            throw new Error(`Erro na API Gemini: ${geminiResponse.statusText}. Resposta não-JSON ou malformada.`);
          }
        } else {
          const textError = await geminiResponse.text();
          console.error("SERVERLESS: Gemini API Non-JSON Error Response:", textError);
          throw new Error(`Erro na API Gemini: ${geminiResponse.statusText}. Resposta: ${textError.substring(0, 500)}`);
        }
        console.error("SERVERLESS: Gemini API Error Response:", errorData);
        throw new Error(errorData.error?.message || `Erro na API Gemini: ${geminiResponse.statusText}`);
      }

      const rawGeminiData = await geminiResponse.text();
      console.log("SERVERLESS: Raw Gemini response (full API response):", rawGeminiData);

      const data = JSON.parse(rawGeminiData);
      let aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

      let parsedSuggestions;
      if (typeof aiResponseContent === 'object' && aiResponseContent !== null) {
        // If Gemini already returned a parsed JSON object (due to responseMimeType)
        parsedSuggestions = aiResponseContent;
        console.log("SERVERLESS: AI response content was already a parsed object.");
      } else if (typeof aiResponseContent === 'string') {
        // If it's a string, first try to extract from a Markdown code block
        const markdownMatch = aiResponseContent.match(/```json\n([\s\S]*?)\n```/);
        if (markdownMatch && markdownMatch[1]) {
          console.log("SERVERLESS: AI response content is a Markdown JSON string, attempting to extract and parse.");
          try {
            parsedSuggestions = JSON.parse(markdownMatch[1]);
          } catch (jsonParseError: any) {
            console.error("SERVERLESS: Failed to parse extracted Markdown JSON:", markdownMatch[1], "Error:", jsonParseError);
            throw new Error(`Falha ao analisar o JSON extraído do Markdown: ${jsonParseError.message}`);
          }
        } else {
          // Fallback: if it's a string but not a Markdown block, try to parse it directly
          console.log("SERVERLESS: AI response content is a plain JSON string, attempting JSON.parse.");
          try {
            parsedSuggestions = JSON.parse(aiResponseContent);
          } catch (jsonParseError: any) {
            console.error("SERVERLESS: Failed to parse AI response as JSON:", aiResponseContent, "Error:", jsonParseError);
            throw new Error(`Falha ao analisar a resposta da IA como JSON: ${jsonParseError.message}`);
          }
        }
      } else {
        console.error("SERVERLESS: Unexpected type for aiResponseContent after processing:", typeof aiResponseContent, "Value:", aiResponseContent);
        throw new Error("O conteúdo da resposta da IA não é uma string ou objeto JSON válido.");
      }

      // --- START NEW DIAGNOSTIC LOGS AND REFINED VALIDATION ---
      console.log("SERVERLESS: Final parsedSuggestions object:", JSON.stringify(parsedSuggestions, null, 2));
      console.log("SERVERLESS: Type of parsedSuggestions:", typeof parsedSuggestions);
      console.log("SERVERLESS: Is parsedSuggestions null?", parsedSuggestions === null);
      console.log("SERVERLESS: Does parsedSuggestions have 'sugestoes' property?", Object.prototype.hasOwnProperty.call(parsedSuggestions, 'sugestoes'));
      console.log("SERVERLESS: Type of parsedSuggestions.sugestoes:", typeof parsedSuggestions.sugestoes);
      console.log("SERVERLESS: Is parsedSuggestions.sugestoes an array?", Array.isArray(parsedSuggestions.sugestoes));

      if (!parsedSuggestions || typeof parsedSuggestions !== 'object' || parsedSuggestions === null || !Object.prototype.hasOwnProperty.call(parsedSuggestions, 'sugestoes') || !Array.isArray(parsedSuggestions.sugestoes)) {
        console.error("SERVERLESS: AI response does not contain a 'sugestoes' array or is not a valid object structure. Details:", {
          isParsedSuggestionsNull: parsedSuggestions === null,
          isParsedSuggestionsObject: typeof parsedSuggestions === 'object',
          hasSugestoesProperty: Object.prototype.hasOwnProperty.call(parsedSuggestions, 'sugestoes'),
          isSugestoesArray: Array.isArray(parsedSuggestions.sugestoes),
          parsedSuggestionsContent: parsedSuggestions // Log the full content for debugging
        });
        throw new Error("A resposta da IA não está no formato esperado (missing 'sugestoes' array ou estrutura inválida).");
      }
      // --- END NEW DIAGNOSTIC LOGS AND REFINED VALIDATION ---

      return res.status(200).json({
        status: 'success',
        message: 'AI suggestions retrieved successfully.',
        suggestions: parsedSuggestions.sugestoes,
        metadata: parsedSuggestions.metadata,
      });

    } catch (geminiCallError: any) {
      console.error(`SERVERLESS: Error during Gemini API call or parsing:`, geminiCallError.message, geminiCallError.stack);
      throw geminiCallError;
    }

  } catch (error: any) {
    console.error('ERROR in suggest-task-time:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    
    return res.status(500).json({ 
      error: 'Failed to get AI suggestions due to an internal server error.',
      details: error.message
    });
  }
}