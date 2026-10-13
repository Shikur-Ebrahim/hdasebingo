import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';

const router = Router();

// Models to try in order — if one fails, try the next
const MODELS = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
];

async function callGroq(messages: object[], modelIndex = 0): Promise<string> {
  if (modelIndex >= MODELS.length) {
    throw new Error('All models failed');
  }
  const model = MODELS[modelIndex];
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 500 }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Groq model ${model} failed (${response.status}):`, errText);
    return callGroq(messages, modelIndex + 1);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  console.log(`Groq responded using model: ${model}`);
  return data.choices[0].message.content;
}

router.post('/chat', validateTelegramAuth, async (req: AuthRequest, res) => {
  try {
    const { message, history } = req.body;
    const user = req.telegramUser;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const systemPrompt = `You are the official AI Support Agent for Hdasebingo, a Telegram mini-app bingo game in Ethiopia.
Be helpful, concise, and friendly. Answer in the same language the user writes in (Amharic or English).
Game Rules:
- Players select Medeb (stake): 10, 20, 50, or 100 ETB.
- A game needs minimum 2 players to start.
- Players can buy up to 2 cartelas per game.
- Derash (Prize Pool) = 80% of total stakes if 3+ unique players join, otherwise 100%.
- To win: get 5 numbers in a complete row (horizontal or vertical) on your cartela.
- Deposits and withdrawals are available via CBE, BOA, Telebirr, and M-Pesa. Do not mention Chapa.
- The user you are talking to is named ${user?.first_name || 'Player'}.
Keep answers short and clear. Use emojis to be friendly.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).slice(-10),
      { role: 'user', content: message },
    ];

    const reply = await callGroq(messages);
    res.json({ reply });

  } catch (error) {
    console.error('Support Chat Error:', error);
    res.status(500).json({ error: 'AI support temporarily unavailable. Please try again.' });
  }
});

export default router;
