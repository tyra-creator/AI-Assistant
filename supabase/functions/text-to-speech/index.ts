import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeXml(unsafe: string) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, voice } = await req.json()

    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('Text is required')
    }

    const selectedVoice = (voice && typeof voice === 'string' && voice.trim()) || 'en-US-AriaNeural'

    console.log('[Edge TTS] Generating speech for text (first 100 chars):', text.substring(0, 100) + '...')
    console.log('[Edge TTS] Using voice:', selectedVoice)

    // 1) Obtain a bearer token from Edge TTS public endpoint
    const tokenRes = await fetch('https://edge.microsoft.com/tts/v1/issueToken', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Supabase-Edge-Function)'
      }
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error('[Edge TTS] Failed to get token:', tokenRes.status, body)
      throw new Error('Failed to obtain TTS token')
    }

    const token = await tokenRes.text()

    // 2) Build SSML request
    const ssml = `<?xml version="1.0" encoding="utf-8"?>\n<speak version="1.0" xml:lang="en-US">\n  <voice xml:lang="en-US" xml:gender="Female" name="${selectedVoice}">\n    <prosody rate="0%" pitch="0%">${escapeXml(text)}</prosody>\n  </voice>\n</speak>`

    // 3) Synthesize speech using Edge consumer endpoint
    const synthRes = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'Mozilla/5.0 (compatible; Supabase-Edge-Function)',
        'Accept': '*/*'
      },
      body: ssml,
    })

    if (!synthRes.ok) {
      const body = await synthRes.text()
      console.error('[Edge TTS] Synthesis failed:', synthRes.status, body)
      throw new Error('Failed to generate speech')
    }

    // Get the audio data as array buffer
    const arrayBuffer = await synthRes.arrayBuffer()

    // Convert to base64 for transmission
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    console.log('[Edge TTS] Speech generated successfully, audio size (bytes):', arrayBuffer.byteLength)

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        contentType: 'audio/mpeg',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    const message = (error as Error)?.message || 'Unknown error'
    console.error('[Edge TTS] Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})