import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You generate short, professional email subject lines.

RULES:
- Maximum 8-10 words
- No emojis
- No filler words ("Just", "Quick", "FYI")
- Include context from the message (review, meeting, update, etc.)
- If a time is provided, include it when relevant
- Output ONLY the subject line — no quotes, no explanation

EXAMPLES:
Message: "Please review the deliverables before the meeting" | Time: "5 pm"
Output: Deliverables Review — Meeting at 5 PM

Message: "join the meeting" | Time: "tomorrow at 10 am"
Output: Meeting Invitation — Tomorrow at 10 AM

Message: "I hope you are feeling okay" | Time: none
Output: Checking In

Message: "Here are the project updates for this week" | Time: none
Output: Weekly Project Update`;

const FALLBACK = "Regarding your message";

export async function generateSubjectLine(message, time) {
  if (!message) return FALLBACK;

  const userPrompt = time
    ? `Message: "${message}" | Time: "${time}"`
    : `Message: "${message}" | Time: none`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 30,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const subject = response.choices[0].message.content.trim();
    return subject || FALLBACK;
  } catch {
    return FALLBACK;
  }
}
