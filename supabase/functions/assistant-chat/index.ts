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
  const lowerMessage = message.toLowerCase().trim();
  
  // Don't trigger on simple time responses or confirmations
  if (/^(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i.test(lowerMessage)) {
    return false;
  }
  if (/^\d{1,2}(?::\d{2})?\s*(?:am|pm)$/i.test(lowerMessage)) {
    return false;
  }
  if (/^(?:yes|no|ok|confirm|cancel|next)$/i.test(lowerMessage)) {
    return false;
  }
  
  // Must have both meeting keywords AND action words for initial request
  const meetingKeywords = ['meeting', 'schedule', 'calendar', 'appointment', 'call', 'event'];
  const actionWords = ['book', 'schedule', 'set up', 'create', 'plan', 'arrange', 'need', 'want', 'have'];
  
  const hasMeetingKeyword = meetingKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasActionWord = actionWords.some(action => lowerMessage.includes(action));
  
  console.log('Meeting request detection:', { hasMeetingKeyword, hasActionWord, message: lowerMessage });
  
  return hasMeetingKeyword && hasActionWord;
}

async function handleMeetingFlow(message: string, state: any) {
  console.log('=== MEETING FLOW START ===');
  console.log('Message:', message);
  console.log('State:', JSON.stringify(state, null, 2));
  
  // Step 1: Initial meeting request - ask for title explicitly
  if (!state.askedForTitle && !state.partialDetails) {
    console.log('Initial meeting request - asking for title');
    return {
      response: "I'll help you schedule a meeting. What would you like to call this meeting?",
      state: {
        meetingContext: true,
        askedForTitle: true,
        extractionAttempts: 1
      }
    };
  }
  
  // Step 2: User provided title response
  if (state.askedForTitle && !state.partialDetails?.title) {
    console.log('Processing title response');
    
    // Try to extract details (might have title + time in one message)
    const details = extractMeetingDetails(message, state);
    console.log('Extracted from title response:', details);
    
    // If we got both title and time, go to confirmation
    if (details.title && details.time) {
      return {
        response: `Perfect! Please confirm:\nTitle: ${details.title}\nTime: ${details.time}\n\nReply "confirm" to schedule.`,
        state: {
          meetingContext: true,
          readyToConfirm: true,
          meetingDetails: details
        }
      };
    }
    
    // If we got title but no time, ask for time
    if (details.title) {
      return {
        response: `Great! "${details.title}" it is. When would you like to schedule this meeting?\n\nExamples: "Tomorrow 2pm", "Friday at 10:30am", "Next Monday 3pm"`,
        state: {
          meetingContext: true,
          askedForTime: true,
          partialDetails: { title: details.title, time: null },
          extractionAttempts: (state.extractionAttempts || 0) + 1
        }
      };
    }
    
    // Couldn't extract valid title - ask again
    console.log('No valid title extracted, asking again');
    return {
      response: "I couldn't get a clear meeting title. Please provide a simple name for the meeting.\n\nExamples: \"Sales review\", \"Team standup\", \"Client call\"",
      state: {
        meetingContext: true,
        askedForTitle: true,
        extractionAttempts: (state.extractionAttempts || 0) + 1
      }
    };
  }
  
  // Step 3: User provided time response
  if (state.askedForTime && state.partialDetails?.title && !state.partialDetails?.time) {
    console.log('Processing time response');
    
    const details = extractMeetingDetails(message, state);
    console.log('Extracted from time response:', details);
    
    if (details.time) {
      return {
        response: `Perfect! Please confirm:\nTitle: ${details.title}\nTime: ${details.time}\n\nReply "confirm" to schedule.`,
        state: {
          meetingContext: true,
          readyToConfirm: true,
          meetingDetails: details
        }
      };
    }
    
    // Couldn't extract valid time - ask again
    console.log('No valid time extracted, asking again');
    return {
      response: "I need a valid date and time. Please provide when you'd like the meeting.\n\nExamples: \"Tomorrow 2pm\", \"Friday 10:30am\", \"Today at 5pm\"",
      state: {
        meetingContext: true,
        askedForTime: true,
        partialDetails: state.partialDetails,
        extractionAttempts: (state.extractionAttempts || 0) + 1
      }
    };
  }
  
  // Step 4: Fallback - try to extract from any state
  console.log('Fallback extraction attempt');
  const details = extractMeetingDetails(message, state);
  console.log('Fallback extracted:', details);
  
  if (details.title && details.time) {
    return {
      response: `Please confirm:\nTitle: ${details.title}\nTime: ${details.time}\n\nReply "confirm" to schedule.`,
      state: {
        meetingContext: true,
        readyToConfirm: true,
        meetingDetails: details
      }
    };
  }
  
  // Still missing something - provide guidance
  const hasTitle = !!details.title;
  const hasTime = !!details.time;
  
  if (!hasTitle) {
    return {
      response: "What would you like to call this meeting?\n\nExamples: \"Sales review\", \"Team standup\", \"Client presentation\"",
      state: {
        meetingContext: true,
        askedForTitle: true,
        partialDetails: details,
        extractionAttempts: (state.extractionAttempts || 0) + 1
      }
    };
  }
  
  if (!hasTime) {
    return {
      response: `When would you like to schedule "${details.title}"?\n\nExamples: "Tomorrow 2pm", "Friday 10:30am", "Next Monday 3pm"`,
      state: {
        meetingContext: true,
        askedForTime: true,
        partialDetails: details,
        extractionAttempts: (state.extractionAttempts || 0) + 1
      }
    };
  }
  
  console.log('=== MEETING FLOW END ===');
  return {
    response: "I'm having trouble understanding. Let's start over. What meeting would you like to schedule?",
    state: {}
  };
}

function extractMeetingDetails(message: string, state: any) {
  const existing = state.partialDetails || {};
  const details = { title: existing.title || null, time: existing.time || null };
  
  console.log('=== EXTRACTION START ===');
  console.log('Input message:', message);
  console.log('Existing details:', existing);
  console.log('Asked for title?', state.askedForTitle);
  console.log('Asked for time?', state.askedForTime);
  
  // Step 4: Better Message Processing - Enhanced normalization
  let normalizedMessage = message.toLowerCase().trim();
  let cleanMessage = message.trim();
  
  // Comprehensive message cleaning
  normalizedMessage = normalizedMessage
    .replace(/\s+(please|could\s+you|can\s+you|would\s+you|will\s+you)\s+/g, ' ')
    .replace(/[^\w\s:,'".-]/g, ' ') // Remove special chars except common punctuation
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();
  
  console.log('Normalized message:', normalizedMessage);
  console.log('Clean message for processing:', cleanMessage);

  // Step 1: Enhanced Comma-Separated Format Detection
  const commaMatch = normalizedMessage.match(/^([^,]+),\s*(.+)$/);
  console.log('=== COMMA FORMAT ANALYSIS ===');
  console.log('Comma separated match:', commaMatch);
  
  if (commaMatch) {
    const [, potentialTitle, potentialTimeSection] = commaMatch;
    const cleanPotentialTitle = potentialTitle.trim();
    const cleanTimeSection = potentialTimeSection.trim();
    
    console.log('Potential title from comma format:', `"${cleanPotentialTitle}"`);
    console.log('Potential time section:', `"${cleanTimeSection}"`);
    
    // Step 1: Improved time validation with comprehensive patterns
    const timeIndicators = /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|(?:today|tomorrow|tonight|this\s+(?:morning|afternoon|evening))|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:this|next)\s+(?:week|month)|(?:morning|afternoon|evening|night)|\d+\s*(?:pm|am)|\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;
    
    const hasTimeIndicator = timeIndicators.test(cleanTimeSection);
    console.log('Time indicator analysis:', {
      hasTimeIndicator,
      timeSection: cleanTimeSection,
      regex: timeIndicators.toString()
    });
    
    // Step 1: Take precedence if comma format has valid time and reasonable title
    if (hasTimeIndicator && cleanPotentialTitle.length >= 2) {
      console.log('=== COMMA FORMAT TAKES PRECEDENCE ===');
      
      // Extract and clean title from comma format
      if (!details.title) {
        let cleanTitle = cleanPotentialTitle
          .replace(/^(?:book|schedule|set\s+up|create|plan|arrange)\s+(?:a\s+)?(?:meeting\s+(?:for|about|regarding|with)\s+)?/i, '') // Remove action prefixes
          .replace(/^(?:a\s+|the\s+|an\s+)(?:meeting\s+(?:for|about|regarding|with)\s+)?/i, '') // Remove article prefixes
          .replace(/^(?:new\s+|quick\s+|brief\s+|urgent\s+)?/i, '') // Remove common adjectives
          .replace(/\s+(?:meeting|appointment|call|session)$/i, '') // Remove meeting-type suffixes
          .replace(/[.,;!?]*$/, '') // Remove trailing punctuation
          .trim();
        
        console.log('Cleaned title from comma format:', `"${cleanTitle}"`);
        
        if (cleanTitle.length >= 2) {
          details.title = cleanTitle;
          console.log('✅ Set title from comma format:', details.title);
        }
      }
      
      // Extract time from the time section
      if (!details.time) {
        let timeExtracted = cleanTimeSection;
        
        // Try to find specific time patterns first
        const specificTimeMatch = timeExtracted.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
        if (specificTimeMatch) {
          timeExtracted = specificTimeMatch[1];
          console.log('Extracted specific time:', specificTimeMatch[1]);
        } else {
          // Use the whole time section for day-based times
          console.log('Using full time section:', timeExtracted);
        }
        
        details.time = timeExtracted;
        console.log('✅ Set time from comma format:', details.time);
      }
      
      // If both title and time extracted from comma format, return early
      if (details.title && details.time) {
        console.log('=== COMMA FORMAT SUCCESS - EARLY RETURN ===');
        console.log('Final extracted details:', details);
        return details;
      }
    } else {
      console.log('❌ Comma format rejected:', {
        hasTimeIndicator,
        titleLength: cleanPotentialTitle.length,
        reason: !hasTimeIndicator ? 'No time indicator' : 'Title too short'
      });
    }
  }

  // Step 2: Enhanced time patterns with better prioritization
  const timePatterns = [
    // Step 3: Specific time formats (highest priority)
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    // Day + time combinations (high priority)
    /\b(today|tomorrow|tonight)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(today|tomorrow|tonight)\b/i,
    // Time with "at" (medium priority)
    /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    // Time ranges (medium priority)
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    // Days only (lower priority)
    /\b(today|tomorrow|tonight|this\s+(?:morning|afternoon|evening))\b/i,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    // Relative times (lowest priority)
    /\b(next\s+week|this\s+week|next\s+month)\b/i
  ];

  // Extract time if not already found
  if (!details.time) {
    console.log('=== TIME EXTRACTION ANALYSIS ===');
    for (let i = 0; i < timePatterns.length; i++) {
      const pattern = timePatterns[i];
      const timeMatch = cleanMessage.match(pattern);
      console.log(`Time pattern ${i + 1} (${pattern}):`, timeMatch ? `Match: "${timeMatch[1] || timeMatch[0]}"` : 'No match');
      
      if (timeMatch) {
        // Extract the most specific time found
        details.time = (timeMatch[1] || timeMatch[0]).trim();
        console.log('✅ Found time:', details.time);
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

  // Enhanced title extraction patterns (ordered by reliability for natural language)
  const titlePatterns = [
    // Quoted titles (highest priority - most explicit)
    /["'`](.+?)["'`]/i,
    
    // Explicit title indicators
    /(?:title|subject|name|regarding|about):\s*(.+?)(?:\s+(?:at|on|for).*)?$/i,
    
    // Clear meeting context with prepositions
    /(?:meeting|appointment|call|session)\s+(?:for|about|regarding|called|titled|on|with)\s+["']?(.+?)["']?(?:\s+(?:at|on|for).*)?$/i,
    /(?:have\s+(?:a\s+)?(?:meeting|call)\s+(?:about|on|regarding))\s+(.+?)(?:\s+(?:at|on|for).*)?$/i,
    
    // Scheduling with structure
    /(?:let'?s\s+meet\s+about|schedule\s+(?:a\s+)?meeting\s+(?:for|about|regarding))\s+(.+?)(?:\s+(?:at|on|for).*)?$/i,
    /(?:set\s+up|create|book)\s+(?:a\s+)?(?:meeting|appointment)\s+(?:for|about|regarding|called|titled)\s+["']?(.+?)["']?(?:\s+(?:at|on|for).*)?$/i,
    
    // Discussion patterns
    /(?:we\s+(?:will|need\s+to)\s+discuss|let'?s\s+talk\s+about|agenda\s+(?:is|includes?))\s+(.+?)(?:\s+(?:at|on|for).*)?$/i,
    
    // After action words - more permissive for natural language
    /^(?:book|schedule|set\s+up|create|plan|arrange)\s+(?:a\s+)?(?:meeting\s+(?:for|about|with)\s+)?(.+?)$/i,
    
    // Simple fallback - capture main content, clean better
    /^(.+?)(?:\s+(?:meeting|appointment|call|session))?$/i
  ];

  // Extract title if not already found
  if (!details.title && cleanMessage) {
    console.log('Trying title extraction on:', cleanMessage);
    
    // If we explicitly asked for title, be more lenient - treat whole message as potential title
    if (state.askedForTitle && !state.partialDetails?.title) {
      console.log('Processing explicit title response');
      
      // Clean up the message more aggressively for title-only responses
      let potentialTitle = cleanMessage
        .replace(/^(?:it'?s|the\s+meeting\s+is|call\s+it|name\s+it|title\s+is)\s+/i, '')
        .replace(/^(?:a\s+|the\s+|an\s+)?(?:meeting\s+(?:for|about|regarding|with|called|named|titled)\s+)?/i, '')
        .replace(/^(?:book|schedule|set\s+up|create|plan|arrange)\s+(?:a\s+)?(?:meeting\s+(?:for|about|with|called)\s+)?/i, '')
        .replace(/\s+(?:meeting|appointment|call|session)$/i, '')
        .replace(/[.,;!?]*$/, '')
        .trim();
      
      console.log('Cleaned title from explicit response:', potentialTitle);
      
      // Simple validation for explicit title responses
      if (potentialTitle.length >= 2 && potentialTitle.length <= 100 && !potentialTitle.match(/^[\s.,!?-]+$/)) {
        details.title = potentialTitle;
        console.log('✅ Accepted title from explicit response:', details.title);
        return details;
      }
    }
    
    for (let i = 0; i < titlePatterns.length; i++) {
      const pattern = titlePatterns[i];
      console.log(`Trying pattern ${i + 1}:`, pattern);
      const titleMatch = cleanMessage.match(pattern);
      console.log('Pattern match result:', titleMatch);
      
      if (titleMatch && titleMatch[1] && titleMatch[1].trim()) {
        let extractedTitle = titleMatch[1].trim();
        console.log('Raw extracted title:', extractedTitle);
        
        // Enhanced title cleaning for natural language
        extractedTitle = extractedTitle
          .replace(/^(?:a\s+|the\s+|an\s+)?(?:meeting\s+(?:for|about|regarding|with)\s+)?/i, '') // Remove prefixes
          .replace(/^(?:new\s+|quick\s+|brief\s+)?/i, '') // Remove common adjectives  
          .replace(/\s+(?:meeting|appointment|call|session)$/i, '') // Remove suffixes  
          .replace(/[.,;!?]*$/, '') // Remove trailing punctuation
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim();
        
        console.log('Cleaned extracted title:', extractedTitle);
        
        // Step 2: More conservative validation - prevent extracting vague phrases
        const isValidTitle = extractedTitle.length >= 3 && 
                           extractedTitle.length <= 100 &&
                           // Reject obvious questions/commands
                           !extractedTitle.match(/^(?:can\s+you|could\s+you|will\s+you|would\s+you|help\s+me|should\s+i|may\s+i|might\s+i|please\s+(?:can|could))\s/i) &&
                           // Reject pronouns at start
                           !extractedTitle.match(/^(?:you|they|he|she|it|i|we)\s/i) &&
                           // Don't allow just action words or incomplete phrases
                           !extractedTitle.match(/^(?:book|set|schedule|create|plan|arrange)\s*(?:a|the|an)?$/i) &&
                           // Don't allow just time/location words
                           !extractedTitle.match(/^(?:today|tomorrow|at|on|for|with|and|or|but)$/i) &&
                           // Don't allow just time as title
                           !extractedTitle.match(/^\d+\s*(?:am|pm|:\d+)$/i) &&
                           // Don't allow just articles
                           !extractedTitle.match(/^(?:the|a|an)$/i) &&
                           // NEW: Reject vague incomplete phrases like "help me book a"
                           !extractedTitle.match(/^(?:help\s+me|i\s+need|i\s+want)\s+(?:to\s+)?(?:book|schedule|set\s+up|create)\s+a$/i);
        
        console.log('Title validation result:', {
          title: extractedTitle,
          length: extractedTitle.length,
          isValid: isValidTitle,
          checks: {
            lengthCheck: extractedTitle.length >= 2,
            questionCheck: !extractedTitle.match(/^(?:can\s+you|could\s+you|will\s+you|would\s+you|should\s+i|may\s+i|might\s+i|please\s+(?:can|could))\s/i),
            pronounCheck: !extractedTitle.match(/^(?:you|they|he|she|it)\s/i),
            actionWordCheck: !extractedTitle.match(/^(?:book|set|schedule|create|plan|arrange)$/i),
            timeLocationCheck: !extractedTitle.match(/^(?:today|tomorrow|at|on|for|with|and|or|but)$/i),
            timeAsTitle: !extractedTitle.match(/^\d+\s*(?:am|pm|:\d+)$/i),
            articleCheck: !extractedTitle.match(/^(?:the|a|an)$/i)
          }
        });
        
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

  // Step 4: Enhanced final validation and normalization  
  if (details.title) {
    console.log('=== FINAL TITLE PROCESSING ===');
    console.log('Title before final cleaning:', details.title);
    
    // Clean up any remaining artifacts more carefully
    details.title = details.title
      .replace(/^[^a-zA-Z0-9]+/, '') // Remove special chars from start only
      .replace(/[^a-zA-Z0-9.,\s\-'"%&()]+$/, '') // Remove special chars from end, keep common business chars
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    
    console.log('Title after final cleaning:', details.title);
    
    // More lenient length check but ensure quality
    if (details.title.length < 2 || details.title.length > 100) {
      console.log('Title rejected - invalid length:', details.title.length);
      details.title = null;
    } else if (details.title.match(/^[\s.,!?-]+$/)) {
      console.log('Title rejected - only punctuation:', details.title);
      details.title = null;
    }
  }

  // Step 5: Add success/failure logging for debugging
  console.log('=== EXTRACTION SUMMARY ===');
  console.log('Title extraction:', details.title ? `✅ "${details.title}"` : '❌ Failed');
  console.log('Time extraction:', details.time ? `✅ "${details.time}"` : '❌ Failed'); 
  console.log('Input was:', message);
  console.log('Normalized was:', normalizedMessage);
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
  
  // Validate meeting details before creating event
  if (!title || !time) {
    console.error('Missing required meeting details:', { title, time });
    return {
      response: '❌ I need both a meeting title and time to create the event. Please provide both details.',
      state: {}
    };
  }
  
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
    
    const eventData = {
      title: title,
      description: `Meeting created via AI assistant`,
      start: startTime,
      end: endTime,
      location: 'TBD',
      timeZone: 'Africa/Johannesburg' // CAT timezone (UTC+2)
    };
    
    const requestBody = {
      action: 'create_event',
      event: eventData
    };
    
    console.log('Calendar request body:', JSON.stringify(requestBody, null, 2));
    
    const calendarResponse = await fetch('https://xqnqssvypvwnedpaylwz.supabase.co/functions/v1/calendar-integration', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    console.log('Calendar response status:', calendarResponse.status);
    const responseText = await calendarResponse.text();
    console.log('Calendar response body:', responseText);
    
    if (!calendarResponse.ok) {
      console.error('Calendar integration failed:', responseText);
      
      // Enhanced error handling with specific messages
      let userMessage = 'Failed to create calendar event';
      
      try {
        const errorData = JSON.parse(responseText);
        console.log('Parsed error data:', errorData);
        
        if (errorData.needsAuth || calendarResponse.status === 401) {
          return {
            response: `❌ I couldn't create the calendar event because your calendar connection expired. Please reconnect your Google or Microsoft account in the settings and try again.`,
            state: {}
          };
        }
        
        // Handle specific error types
        if (errorData.type === 'auth') {
          userMessage = 'Calendar authorization expired. Please reconnect your account.';
        } else if (errorData.type === 'quota') {
          userMessage = 'Too many requests to calendar service. Please try again in a few minutes.';
        } else if (errorData.type === 'timeout') {
          userMessage = 'Calendar request timed out. Please try again.';
        } else if (errorData.type === 'validation') {
          userMessage = 'Invalid event data. Please check the meeting details.';
        } else {
          userMessage = errorData.error || userMessage;
        }
        
      } catch (e) {
        console.error('Failed to parse calendar error response:', e);
        // Check if it's an authentication error by status
        if (calendarResponse.status === 401 || responseText.includes('Unauthorized') || responseText.includes('invalid claim')) {
          return {
            response: `❌ Please log in to your account first to create calendar events. Once logged in, you can schedule meetings directly from this chat.`,
            state: {}
          };
        }
      }
      
      const eventTime = new Date(startTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      
      return {
        response: `❌ I had trouble creating the calendar event: ${userMessage}. You can manually add "${title}" to your calendar for ${eventTime}.`,
        state: {}
      };
    }

    const calendarResult = JSON.parse(responseText);
    console.log('Calendar event created successfully:', calendarResult);
    
    // Enhanced success message with more details
    const eventTime = new Date(startTime).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    let successMessage = `✅ Perfect! I've successfully created your meeting "${title}" for ${eventTime}.`;
    
    // Add provider-specific information
    if (calendarResult.event?.provider) {
      successMessage += ` The event has been added to your ${calendarResult.event.provider} calendar.`;
    } else {
      successMessage += ` The event has been added to your calendar.`;
    }
    
    // Add calendar link if available
    if (calendarResult.calendarUrl) {
      successMessage += ` You can view it in your calendar at: ${calendarResult.calendarUrl}`;
    }
    
    // Add event verification status
    if (calendarResult.event?.verified === false) {
      successMessage += ' (Note: Event verification is still in progress)';
    }
    
    return {
      response: successMessage,
      state: {}
    };
    
  } catch (error) {
    console.error('Error creating calendar event:', error);
    
    const eventTime = new Date(convertToISODateTime(time)).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    
    // Provide specific error messages based on error type
    if (error.message?.includes('timeout')) {
      return {
        response: `❌ The calendar request timed out. Please try again or manually add "${title}" for ${eventTime}.`,
        state: {}
      };
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      return {
        response: `❌ Network error while connecting to calendar service. Please check your connection and try again.`,
        state: {}
      };
    }
    
    return {
      response: `❌ I had trouble connecting to your calendar service. You can manually add "${title}" for ${eventTime}.`,
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

// Helper function to convert time strings to ISO format with enhanced parsing and timezone support
// All times are interpreted as CAT (Central Africa Time, UTC+2) by default
function convertToISODateTime(timeString: string): string {
  console.log('Converting time string:', timeString);
  
  const now = new Date();
  
  // Default to CAT timezone (UTC+2) - users expect times in their local CAT timezone
  let userTimezone = 'CAT';
  let timezoneOffset = 2; // CAT is UTC+2
  
  // Allow override for other timezones if explicitly mentioned
  if (timeString.includes('EST')) {
    userTimezone = 'EST';
    timezoneOffset = -5; // EST is UTC-5
  } else if (timeString.includes('PST')) {
    userTimezone = 'PST';
    timezoneOffset = -8; // PST is UTC-8
  } else if (timeString.includes('GMT') || timeString.includes('UTC')) {
    userTimezone = 'UTC';
    timezoneOffset = 0; // UTC
  }
  
  // Get target date in CAT timezone (convert current UTC to CAT)
  const nowInCAT = new Date(now.getTime() + (timezoneOffset * 60 * 60 * 1000));
  let targetDate = nowInCAT.toISOString().split('T')[0];
  
  // Handle relative dates (in CAT timezone)
  if (timeString.toLowerCase().includes('tomorrow')) {
    const tomorrow = new Date(nowInCAT);
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDate = tomorrow.toISOString().split('T')[0];
  } else if (timeString.toLowerCase().includes('next week')) {
    const nextWeek = new Date(nowInCAT);
    nextWeek.setDate(nextWeek.getDate() + 7);
    targetDate = nextWeek.toISOString().split('T')[0];
  }
  
  // Handle specific dates (YYYY-MM-DD format)
  const dateMatch = timeString.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    targetDate = dateMatch[1];
  }
  
  // Enhanced parsing for time ranges - take the first time
  let processedTimeString = timeString;
  
  // Handle time ranges by extracting the start time
  const rangeMatch = timeString.match(/(\d{1,2})(:\d{2})?\s*(am|pm)\s*[-–]/i);
  if (rangeMatch) {
    processedTimeString = rangeMatch[0].replace(/[-–]$/, '').trim();
    console.log('Extracted start time from range:', processedTimeString);
  }
  
  // Parse time from various formats
  const timeMatch = processedTimeString.match(/(\d{1,2})(:\d{2})?\s*(am|pm)/i);
  if (!timeMatch) {
    console.warn('No time pattern found, defaulting to current time + 1 hour');
    // Default to current time + 1 hour if parsing fails
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    return oneHourLater.toISOString();
  }
  
  let hour = parseInt(timeMatch[1]);
  const minute = timeMatch[2] ? parseInt(timeMatch[2].substring(1)) : 0;
  const ampm = timeMatch[3].toLowerCase();
  
  console.log('Parsed time components:', { hour, minute, ampm, userTimezone, timezoneOffset });
  console.log(`Interpreting time as ${userTimezone} (UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset})`);
  
  // Convert to 24-hour format
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  
  // Apply timezone offset to convert to UTC
  const utcHour = hour - timezoneOffset;
  
  // Handle day boundary crossing
  let finalDate = targetDate;
  let finalHour = utcHour;
  
  if (utcHour < 0) {
    // Previous day
    const date = new Date(targetDate);
    date.setDate(date.getDate() - 1);
    finalDate = date.toISOString().split('T')[0];
    finalHour = 24 + utcHour;
  } else if (utcHour >= 24) {
    // Next day
    const date = new Date(targetDate);
    date.setDate(date.getDate() + 1);
    finalDate = date.toISOString().split('T')[0];
    finalHour = utcHour - 24;
  }
  
  finalHour = Math.max(0, Math.min(23, finalHour));
  
  const result = `${finalDate}T${finalHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00.000Z`;
  console.log('Final converted datetime:', result);
  
  return result;
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