export async function summarizeText(prompt: string): Promise<string> {
  if (process.env.FAKE_LLM === 'true') {
    return 'The customer shared feedback about their recent experience and is waiting on follow-up from the support team.'
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LLM API error ${response.status}: ${text}`)
  }

  const data: any = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM returned an unexpected response shape')
  }
  return content
}
