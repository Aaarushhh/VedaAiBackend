import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
});

export interface QuestionType {
  type: string;
  count: number;
  marks: number;
}

export interface GeneratedQuestion {
  id: number;
  text: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  marks: number;
  type: string;
  answer?: string;
}

export interface GeneratedSection {
  title: string;
  instruction: string;
  questions: GeneratedQuestion[];
}

export interface GeneratedPaper {
  schoolName: string;
  subject: string;
  className: string;
  timeAllowed: string;
  maxMarks: number;
  sections: GeneratedSection[];
  answerKey: { questionId: number; answer: string }[];
}

const paperResponseSchema = {
  type: Type.OBJECT,
  properties: {
    schoolName: { type: Type.STRING },
    subject: { type: Type.STRING },
    className: { type: Type.STRING },
    timeAllowed: { type: Type.STRING },
    maxMarks: { type: Type.NUMBER },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          instruction: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.NUMBER },
                text: { type: Type.STRING },
                difficulty: {
                  type: Type.STRING,
                  enum: ['Easy', 'Medium', 'Hard'],
                },
                marks: { type: Type.NUMBER },
                type: { type: Type.STRING },
                answer: { type: Type.STRING },
              },
              required: ['id', 'text', 'difficulty', 'marks', 'type', 'answer'],
              propertyOrdering: ['id', 'text', 'difficulty', 'marks', 'type', 'answer'],
            },
          },
        },
        required: ['title', 'instruction', 'questions'],
        propertyOrdering: ['title', 'instruction', 'questions'],
      },
    },
    answerKey: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionId: { type: Type.NUMBER },
          answer: { type: Type.STRING },
        },
        required: ['questionId', 'answer'],
        propertyOrdering: ['questionId', 'answer'],
      },
    },
  },
  required: [
    'schoolName',
    'subject',
    'className',
    'timeAllowed',
    'maxMarks',
    'sections',
    'answerKey',
  ],
  propertyOrdering: [
    'schoolName',
    'subject',
    'className',
    'timeAllowed',
    'maxMarks',
    'sections',
    'answerKey',
  ],
};

const MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (err: any): boolean => {
  const status = err?.status ?? err?.response?.status;
  if (typeof status === 'number' && RETRYABLE_STATUS.has(status)) return true;
  const msg = String(err?.message ?? '');
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|overloaded|high demand/i.test(msg);
};

const callGeminiWithFallback = async (prompt: string): Promise<string> => {
  const MAX_ATTEMPTS_PER_MODEL = 3;
  let lastError: unknown;

  for (const model of MODEL_FALLBACK_CHAIN) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: paperResponseSchema,
            maxOutputTokens: 32768,
            temperature: 0.7,
          },
        });
        const text = (response.text ?? '').trim();
        if (!text) throw new Error(`Empty response from ${model}`);
        return text;
      } catch (err) {
        lastError = err;
        const retryable = isRetryableError(err);
        console.warn(
          `[aiService] ${model} attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL} failed${retryable ? ' (retryable)' : ''}:`,
          (err as Error)?.message ?? err
        );
        if (!retryable) break; // non-retryable -> try next model immediately
        if (attempt < MAX_ATTEMPTS_PER_MODEL) {
          const delayMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
          await sleep(delayMs);
        }
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All Gemini models failed');
};

export const generateQuestionPaper = async (
  title: string,
  questionTypes: QuestionType[],
  additionalInstructions: string,
  totalMarks: number
): Promise<GeneratedPaper> => {

  const prompt = `You are an expert teacher creating a structured question paper.

Subject/Topic: ${title}
Total Marks: ${totalMarks}
Additional Instructions: ${additionalInstructions || 'None'}

Question Requirements:
${questionTypes.map(qt => `- ${qt.type}: ${qt.count} questions, ${qt.marks} marks each`).join('\n')}

Rules:
- Group questions by type into sections (Section A, Section B, Section C, etc., in the order listed above).
- Each section's "instruction" should be a short directive like "Attempt all questions" or "Answer any three".
- Assign difficulty per question: "Easy" for 1-mark questions, "Medium" for 2-3 mark questions, "Hard" for 4+ mark questions.
- "id" must be globally unique across all sections, starting at 1 and incrementing.
- "answerKey" must contain one entry per question with the matching questionId.
- Default schoolName: "Delhi Public School, Sector-4, Bokaro".
- Default className: "Class 10th".
- Default timeAllowed: "90 minutes".
- maxMarks must equal ${totalMarks}.
- subject must equal "${title}".
- Make questions academically appropriate and directly relevant to the subject.`;

  const responseText = await callGeminiWithFallback(prompt);

  try {
    return JSON.parse(responseText) as GeneratedPaper;
  } catch (err) {
    console.error('Failed to parse Gemini JSON. Raw response head:', responseText.slice(0, 500));
    console.error('Raw response tail:', responseText.slice(-500));
    throw new Error('Gemini returned malformed JSON');
  }
};
