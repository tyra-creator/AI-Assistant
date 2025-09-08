import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Uniform CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

// Helper to wrap fetch with timeout
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const resp = await fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
  return resp;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method === 'GET') {
      return healthCheck();
    }

    if (req.method !== 'POST') {
      return errorResponse(`Method ${req.method} not allowed`, 405, { allowed_methods: ['POST', 'GET', 'OPTIONS'] });
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return errorResponse('Invalid content type', 400, { required_content_type: 'application/json' });
    }

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return errorResponse('Invalid JSON body', 400, { details: e.message });
    }

    if (!body.message) {
      return errorResponse('Message is required', 400, {
        example: { message: "Schedule a meeting", conversation_state: {} }
      });
    }

    // Pass the authorization header for calendar integration
    const authHeader = req.headers.get('Authorization');
    const reply = await processMessage(body.message, body.conversation_state || {}, body.session_id || null, authHeader);
    return new Response(JSON.stringify(reply), { headers: corsHeaders });

  } catch (err) {
    console.error('Unhandled:', err);
    return errorResponse('Internal server error', 500, {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    });
  }
});

function healthCheck() {
  return new Response(JSON.stringify({
    status: 'healthy',
    version: '3.9 (Stable)',
    timestamp: new Date().toISOString(),
    environment: {
      OPENROUTER_API_KEY: !!Deno.env.get('OPENROUTER_API_KEY'),
      CALENDAR_FUNCTION_URL: !!Deno.env.get('CALENDAR_FUNCTION_URL')
    }
  }), { headers: corsHeaders });
}

function errorResponse(error: string, status = 400, details: any = {}) {
  return new Response(JSON.stringify({ error, ...details }), { status, headers: corsHeaders });
}

async function processMessage(message: string, state: any, sessionId: string | null = null, authHeader?: string | null) {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY environment variable not set');

  console.log('Processing message:', message);
  console.log('Current state:', JSON.stringify(state, null, 2));

  // Extract proper state structure - handle both frontend and backend formats
  const currentState = state || {};
  const loopCount = currentState.loopCount || 0;
  
  // Loop prevention - break circular conversations
  if (loopCount > 3) {
    console.log('Breaking loop at count:', loopCount);
    return {
      response: "Let me help you start fresh. Please tell me what kind of meeting you'd like to schedule.",
      state: {}
    };
  }

  // Improved confirmation detection - exact word matching (meeting flow)
  const isConfirmation = /\b(confirm|yes|ok|correct)\b/i.test(message.trim());

  // Email draft flow handling
  if (currentState.emailDraftFlow) {
    const draftState = currentState.emailDraftFlow;
    const lower = message.trim().toLowerCase();

    // Awaiting initial confirmation to start drafting
    if (draftState.awaitingConfirmation) {
      if (isDraftConfirmation(message)) {
        const emails: any[] = draftState.emails || [];
        const batchCount = Math.min(2, Math.max(0, emails.length));
        if (batchCount === 0) {
          return { response: 'I could not find any emails to draft replies for.', state: {} };
        }
        const draftsText = await generateDraftsForEmails(emails, 0, batchCount, apiKey);
        return {
          response: `✍️ Here are draft replies for the first ${batchCount} email(s):\n\n${draftsText}\n\nReply "next" to draft the next two, or "cancel" to stop.`,
          state: {
            ...currentState,
            emailDraftFlow: { ...draftState, nextIndex: batchCount, awaitingConfirmation: false, autoDrafting: true }
          }
        };
      }
      if (isDraftCancel(message)) {
        return { response: 'Okay, I will not draft replies now. Ask me anytime if you want me to draft responses.', state: {} };
      }
      return {
        response: 'Would you like me to draft replies to these emails? Reply "yes" to begin or "no" to cancel.',
        state: { ...currentState }
      };
    }

    // Auto-drafting flow (after confirmation)
    if (draftState.autoDrafting) {
      if (isDraftCancel(message)) {
        return { response: 'Drafting cancelled. No drafts were sent or saved.', state: {} };
      }
      if (isDraftNext(message)) {
        const emails: any[] = draftState.emails || [];
        const start = draftState.nextIndex || 0;
        if (start >= emails.length) {
          return { response: '✅ All drafts have already been prepared for your unread emails.', state: {} };
        }
        const batchCount = Math.min(2, emails.length - start);
        const draftsText = await generateDraftsForEmails(emails, start, batchCount, apiKey);
        const newNext = start + batchCount;
        const done = newNext >= emails.length;
        return {
          response: `${draftsText}\n\n${done ? '✅ All drafts prepared.' : 'Reply "next" to draft the next two, or "cancel" to stop.'}`,
          state: done ? {} : { ...currentState, emailDraftFlow: { ...draftState, nextIndex: newNext, autoDrafting: true } }
        };
      }
      // Any other input during auto-drafting
      return {
        response: 'Type "next" to draft the next two replies, or "cancel" to stop.',
        state: { ...currentState }
      };
    }
  }

  if (isConfirmation && currentState.readyToConfirm) {
    console.log('Processing confirmation...');
    return await handleConfirmation(currentState, authHeader);
  }

  // Check if this is a meeting request
  if (isMeetingRequest(message) || currentState.meetingContext) {
    console.log('Handling meeting context...');
    return await handleMeetingFlow(message, { ...currentState, loopCount: loopCount + 1 });
  }

  // Check if this is an email request (e.g., "show my unread emails")
  if (isEmailRequest(message)) {
    console.log('Handling email intent...');
    return await handleEmailRequest(authHeader);
  }

  // Default response
  const response = await generateResponse(message, apiKey);
  return {
    response: response || "I'm here to help you schedule meetings or manage your calendar and email.",
    state: {}
  };
}

function isMeetingRequest(message: string): boolean {
  const meetingKeywords = ['meeting', 'schedule', 'calendar', 'appointment', 'call'];
  const lowerMessage = message.toLowerCase();
  return meetingKeywords.some(keyword => lowerMessage.includes(keyword));
}

async function handleMeetingFlow(message: string, state: any) {
  console.log('Extracting meeting details from:', message);
  
  const details = extractMeetingDetails(message, state);
  console.log('Extracted details:', details);

  // Check if we have both title and time
  if (details.title && details.time) {
    // Ready to confirm
    return {
      response: `Please confirm meeting details:\nTitle: ${details.title}\nTime: ${details.time}\n\nReply "confirm" to schedule or provide corrections.`,
      state: {
        meetingContext: true,
        readyToConfirm: true,
        meetingDetails: details
      }
    };
  }

  // Missing information
  const missing = [];
  if (!details.title) missing.push('title');
  if (!details.time) missing.push('time');

  return {
    response: `To schedule your meeting, please provide:\n${missing.map(field => 
      field === 'title' ? '• Meeting title' : '• Date and time (e.g. "Tomorrow 2-3pm")'
    ).join('\n')}`,
    state: {
      meetingContext: true,
      partialDetails: details
    }
  };
}

function extractMeetingDetails(message: string, state: any) {
  const existing = state.partialDetails || {};
  const details = { title: existing.title || null, time: existing.time || null };
  
  console.log('=== EXTRACTION START ===');
  console.log('Input message:', message);
  console.log('Existing details:', existing);
  
  // Normalize and clean input message
  let normalizedMessage = message.toLowerCase().trim();
  let cleanMessage = message.trim();
  
  // Remove filler words and normalize
  normalizedMessage = normalizedMessage
    .replace(/\s+(please|could you|can you|would you)\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log('Normalized message:', normalizedMessage);

  // Fix comma-separated format handling (e.g., "sales meeting, today 5pm")
  const commaMatch = normalizedMessage.match(/^([^,]+),\s*(.+)$/);
  console.log('Comma separated match:', commaMatch);
  
  if (commaMatch) {
    const [, potentialTitle, potentialTimeSection] = commaMatch;
    console.log('Potential title from comma format:', potentialTitle.trim());
    console.log('Potential time section:', potentialTimeSection.trim());
    
    // Improved time validation - check for actual time patterns
    const timeIndicators = /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|at\s+\d|\b(?:today|tomorrow|tonight|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i;
    const hasTimeIndicator = timeIndicators.test(potentialTimeSection);
    console.log('Has time indicator:', hasTimeIndicator, 'in:', potentialTimeSection);
    
    if (hasTimeIndicator && potentialTitle.trim().length > 1) {
      // Set title from comma format with basic cleaning
      if (!details.title) {
        const cleanTitle = potentialTitle.trim()
          .replace(/^(?:book|schedule|set up|create)\s+(?:a\s+)?/i, '') // Remove action prefixes
          .replace(/\s+meeting$/i, '') // Remove " meeting" suffix
          .trim();
        
        if (cleanTitle.length > 1) {
          details.title = cleanTitle;
          console.log('Set title from comma format:', details.title);
        }
      }
      
      // Extract time from the time section with better patterns
      if (!details.time) {
        let timeExtracted = potentialTimeSection.trim();
        
        // Try to find specific time patterns first
        const specificTimeMatch = timeExtracted.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
        if (specificTimeMatch) {
          timeExtracted = specificTimeMatch[1];
        }
        
        details.time = timeExtracted;
        console.log('Set time from comma format:', details.time);
      }
    }
  }

  // Simplified time patterns for better detection
  const timePatterns = [
    // Specific time formats (highest priority)
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    // Day + time combinations
    /\b(today|tomorrow)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(today|tomorrow)\b/i,
    // Time with "at"
    /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    // Just days (lower priority)
    /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  ];

  // Extract time if not already found
  if (!details.time) {
    console.log('Looking for time patterns...');
    for (const pattern of timePatterns) {
      const timeMatch = cleanMessage.match(pattern);
      if (timeMatch) {
        // Extract the most specific time found
        details.time = timeMatch[1] || timeMatch[0];
        details.time = details.time.trim();
        console.log('Found time:', details.time);
        break;
      }
    }
  }
  
  // Better message cleaning for title extraction
  if (details.time) {
    console.log('Cleaning message, removing time:', details.time);
    const escapedTime = details.time.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Remove the time and related words more carefully
    cleanMessage = cleanMessage
      .replace(new RegExp(`\\b(?:at\\s+)?${escapedTime}\\b`, 'gi'), '')
      .replace(/\b(?:today|tomorrow|tonight)\b/gi, '')
      .replace(/\b(?:at|on|for)\s*$/gi, '') // Remove hanging prepositions
      .replace(/^,\s*|,\s*$|^\s*,|,\s*$/g, '') // Remove commas more thoroughly
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    
    console.log('Clean message after time removal:', cleanMessage);
  }

  // Improved title extraction patterns (ordered by specificity)
  const titlePatterns = [
    // Explicit title indicators
    /(?:title|subject|name|regarding|about):\s*(.+?)(?:\s+(?:at|on|for).*)?$/i,
    
    // Meeting scheduling with clear structure
    /(?:let'?s\s+meet\s+about|schedule\s+(?:a\s+)?meeting\s+(?:for|about|regarding))\s+(.+?)(?:\s+(?:at|on|for).*)?$/i,
    /(?:set\s+up|create|book)\s+(?:a\s+)?(?:meeting|appointment)\s+(?:for|about|regarding|called|titled)\s+["']?(.+?)["']?(?:\s+(?:at|on|for).*)?$/i,
    
    // Clear meeting context
    /(?:meeting|appointment|call|session)\s+(?:for|about|regarding|called|titled|on|with)\s+["']?(.+?)["']?(?:\s+(?:at|on|for).*)?$/i,
    /(?:have\s+(?:a\s+)?(?:meeting|call)\s+(?:about|on|regarding))\s+(.+?)(?:\s+(?:at|on|for).*)?$/i,
    
    // Discussion patterns
    /(?:we\s+(?:will|need\s+to)\s+discuss|let'?s\s+talk\s+about|agenda\s+(?:is|includes?))\s+(.+?)(?:\s+(?:at|on|for).*)?$/i,
    
    // Quoted titles
    /["'`](.+?)["'`]/i,
    
    // After action words (book, schedule, etc.)
    /^(?:book|schedule|set up|create)\s+(?:a\s+)?(?:meeting\s+(?:for|about)\s+)?(.+?)$/i,
    
    // Simple fallback - capture remaining content as title
    /^(.+?)(?:\s+meeting)?$/i
  ];

  // Extract title if not already found
  if (!details.title && cleanMessage) {
    console.log('Trying title extraction on:', cleanMessage);
    
    for (let i = 0; i < titlePatterns.length; i++) {
      const pattern = titlePatterns[i];
      console.log(`Trying pattern ${i + 1}:`, pattern);
      const titleMatch = cleanMessage.match(pattern);
      console.log('Pattern match result:', titleMatch);
      
      if (titleMatch && titleMatch[1] && titleMatch[1].trim()) {
        let extractedTitle = titleMatch[1].trim();
        console.log('Raw extracted title:', extractedTitle);
        
        // Improved title cleaning
        extractedTitle = extractedTitle
          .replace(/^(?:a\s+|the\s+|an\s+)?(?:meeting\s+(?:for|about|regarding)\s+)?/i, '') // Remove prefixes
          .replace(/\s+(?:meeting|appointment|call|session)$/i, '') // Remove suffixes  
          .replace(/[.,;!?]*$/, '') // Remove trailing punctuation
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim();
        
        console.log('Cleaned extracted title:', extractedTitle);
        
        // Improved validation - more lenient for real meeting titles
        const isValidTitle = extractedTitle.length >= 2 && 
                           !extractedTitle.match(/^(?:can|could|will|would|should|may|might|do|does|did|is|are|was|were|have|has|had)\s/i) &&
                           !extractedTitle.match(/^(?:you|i|we|they|he|she|it)\s/i) &&
                           !extractedTitle.match(/^(?:book|set|schedule|create)$/i) &&
                           !extractedTitle.match(/^(?:today|tomorrow|at|on|for|with)$/i);
        
        if (isValidTitle) {
          details.title = extractedTitle;
          console.log('Successfully extracted title:', details.title);
          break;
        } else {
          console.log('Rejected title (invalid):', extractedTitle);
        }
      }
    }
  }

  // Use existing title if still missing and valid
  if (!details.title && existing.title) {
    details.title = existing.title;
    console.log('Using existing title:', details.title);
  }

  // Final validation and normalization
  if (details.title) {
    // Clean up any remaining artifacts
    details.title = details.title
      .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9.,\s]+$/g, '') // Remove special chars from ends
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    
    if (details.title.length < 2) {
      console.log('Title too short, removing:', details.title);
      details.title = null;
    }
  }

  console.log('Final extracted details:', details);
  return details;
}

async function handleConfirmation(state: any, authHeader?: string | null) {
  console.log('Handling confirmation with state:', state);
  
  if (!state.meetingDetails) {
    return {
      response: "I don't have meeting details to confirm. Please start over with your meeting request.",
      state: {}
    };
  }

  const { title, time } = state.meetingDetails;
  
  try {
    // Convert time to proper ISO format for calendar API
    const startTime = convertToISODateTime(time);
    const endTime = addOneHour(startTime);
    
    console.log(`Creating calendar event: ${title} from ${startTime} to ${endTime}`);
    
    // Call the calendar integration function with user's auth header
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Use user's auth header if available, otherwise fall back to service role
    if (authHeader) {
      headers['Authorization'] = authHeader;
    } else {
      headers['Authorization'] = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
      console.log('Warning: No user auth header available, using service role');
    }
    
    console.log('Calling calendar integration with headers:', Object.keys(headers));
    
    const calendarResponse = await fetch('https://xqnqssvypvwnedpaylwz.supabase.co/functions/v1/calendar-integration', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'create_event',
        event: {
          title: title,
          description: `Meeting created via AI assistant`,
          start: startTime,
          end: endTime,
          location: 'TBD'
        }
      }),
    });

    console.log('Calendar response status:', calendarResponse.status);
    
    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error('Calendar integration failed:', errorText);
      
      // Check if it's an authentication error
      if (calendarResponse.status === 401 || errorText.includes('Unauthorized') || errorText.includes('invalid claim')) {
        return {
          response: `❌ Please log in to your account first to create calendar events. Once logged in, you can schedule meetings directly from this chat.`,
          state: {}
        };
      }
      
      return {
        response: `❌ Sorry, I couldn't create the calendar event. Error: ${errorText}\n\nPlease try again or check your calendar connection.`,
        state: {}
      };
    }

    const calendarResult = await calendarResponse.json();
    console.log('Calendar event created:', calendarResult);
    
    return {
      response: `✅ Meeting scheduled successfully!\n\nTitle: ${title}\nTime: ${time}\n\nYour meeting has been added to your calendar.`,
      state: {}
    };
    
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return {
      response: `❌ Sorry, I couldn't create the calendar event due to an error: ${error.message}\n\nPlease try again or check your calendar connection.`,
      state: {}
    };
  }
}

function isEmailRequest(message: string): boolean {
  const emailKeywords = ['unread email', 'unread emails', 'inbox', 'show emails', 'check email', 'new emails', 'my emails'];
  const lower = message.toLowerCase();
  return emailKeywords.some(k => lower.includes(k));
}

async function handleEmailRequest(authHeader?: string | null) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    } else {
      headers['Authorization'] = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
      console.log('Warning: No user auth header available for email intent, using service role');
    }

    const resp = await fetch('https://xqnqssvypvwnedpaylwz.supabase.co/functions/v1/email-integration', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'get_emails', folder: 'inbox' })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Email integration failed:', resp.status, errText);
      if (resp.status === 401 || errText.includes('Unauthorized')) {
        return {
          response: '❌ Please log in and connect your Google or Microsoft account to read your inbox.',
          state: {}
        };
      }
      return { response: `❌ Sorry, I couldn't fetch your unread emails. ${errText}`, state: {} };
    }

    const data = await resp.json();
    const emails = (data.emails || []) as Array<any>;
    if (!emails.length) {
      return { response: '📭 You have no unread emails.', state: {} };
    }

    const top = emails.slice(0, 5);
    const summary = top.map((e, i) => `${i + 1}. [${e.provider}] From: ${e.from || 'Unknown'} | Subject: ${e.subject || '(no subject)'} | Received: ${new Date(e.received_at).toLocaleString()}`).join('\n');

    // Keep only minimal fields for drafting context
    const simplified = emails.map((e: any) => ({
      id: e.id,
      provider: e.provider,
      from: e.from || 'Unknown',
      subject: e.subject || '(no subject)',
      body_preview: e.body_preview || '',
      received_at: e.received_at
    }));

    return {
      response: `📬 I found ${emails.length} unread email(s). Here are the latest ${top.length}—\n${summary}\n\nWould you like me to draft replies to these emails? Reply "yes" to begin or "no" to cancel.`,
      state: {
        emailDraftFlow: {
          emails: simplified,
          nextIndex: 0,
          awaitingConfirmation: true,
          autoDrafting: false
        }
      }
    };
  } catch (error: any) {
    console.error('Error handling email request:', error);
    return { response: `❌ Error fetching unread emails: ${error.message}`, state: {} };
  }
}

// Drafting helpers
function isDraftConfirmation(msg: string): boolean {
  return /\b(yes|confirm|ok|okay|sure|please do|go ahead)\b/i.test(msg.trim());
}
function isDraftCancel(msg: string): boolean {
  return /\b(no|cancel|stop|never mind|no thanks|not now)\b/i.test(msg.trim());
}
function isDraftNext(msg: string): boolean {
  return /\b(next|continue|more|proceed)\b/i.test(msg.trim());
}

interface EmailMeta {
  id: string;
  provider: string;
  from: string;
  subject: string;
  body_preview: string;
  received_at: string;
}

async function generateDraftsForEmails(allEmails: EmailMeta[], startIndex: number, batchSize: number, apiKey: string): Promise<string> {
  const batch = allEmails.slice(startIndex, startIndex + batchSize);
  if (!batch.length) return 'No emails to draft.';

  const context = batch.map((e, idx) => (
    `Email ${idx + 1}:
From: ${e.from}
Subject: ${e.subject}
BodyPreview: ${e.body_preview?.slice(0, 400) || '(no preview)'}
ReceivedAt: ${new Date(e.received_at).toLocaleString()}`
  )).join('\n\n');

  const body = {
    model: 'deepseek/deepseek-chat',
    messages: [
      {
        role: 'system',
        content: 'You are an expert executive assistant that drafts clear, concise, professional email replies. For EACH email context, produce a numbered draft with: 1) a suggested Subject line prefixed with "Subject:", and 2) a short polite reply body. Keep it neutral, actionable, and under 120 words per draft. Do not include extra commentary.'
      },
      {
        role: 'user',
        content: `Draft professional replies for these emails. Output strictly as:\n1) Subject: ...\nDraft reply: ...\n\n2) Subject: ...\nDraft reply: ...\n\nEmails:\n\n${context}`
      }
    ],
    max_tokens: 700,
    temperature: 0.3
  };

  try {
    const resp = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    }, 20000);

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || 'Drafts generated.';
  } catch (e) {
    console.error('Error generating drafts:', e);
    return '⚠️ I had trouble generating drafts just now. Please try again.';
  }
}

// Helper function to convert time strings to ISO format with enhanced parsing
function convertToISODateTime(timeString: string): string {
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // Get YYYY-MM-DD
  
  // Enhanced parsing for time ranges - take the first time
  let processedTimeString = timeString;
  
  // Handle time ranges by extracting the start time
  const rangeMatch = timeString.match(/(\d{1,2})(:\d{2})?\s*(am|pm)\s*[-–]/i);
  if (rangeMatch) {
    processedTimeString = rangeMatch[0].replace(/[-–]$/, '').trim();
  }
  
  // Parse time from various formats
  const timeMatch = processedTimeString.match(/(\d{1,2})(:\d{2})?\s*(am|pm)/i);
  if (!timeMatch) {
    // Default to current time + 1 hour if parsing fails
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    return oneHourLater.toISOString();
  }
  
  let hour = parseInt(timeMatch[1]);
  const minute = timeMatch[2] ? parseInt(timeMatch[2].substring(1)) : 0;
  const ampm = timeMatch[3].toLowerCase();
  
  // Convert to 24-hour format
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  
  // Check if time mentions "today" or "tomorrow"
  let targetDate = today;
  if (timeString.toLowerCase().includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDate = tomorrow.toISOString().split('T')[0];
  }
  
  // Handle timezone offsets (basic support for CAT = UTC+2)
  let offsetHours = 0;
  if (timeString.includes('CAT')) {
    offsetHours = -2; // CAT is UTC+2, so we subtract 2 to get UTC
  }
  
  const finalHour = Math.max(0, Math.min(23, hour + offsetHours));
  
  return `${targetDate}T${finalHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
}

// Helper function to add one hour to a datetime string
function addOneHour(isoString: string): string {
  const date = new Date(isoString);
  date.setHours(date.getHours() + 1);
  return date.toISOString();
}

async function generateResponse(message: string, apiKey: string) {
  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful business assistant focused on productivity and scheduling. Keep responses concise and professional.'
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I'm here to help with your scheduling needs.";
  } catch (error) {
    console.error('Error generating response:', error);
    return "I'm here to help with your scheduling and productivity needs.";
  }
}