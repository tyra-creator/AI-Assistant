import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarRequest {
  action: 'get_events' | 'create_event' | 'update_event' | 'delete_event';
  date?: string;
  start_date?: string;
  end_date?: string;
  event?: {
    title: string;
    description?: string;
    start: string;
    end: string;
    attendees?: string[];
  };
  eventId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get user from JWT
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const requestData: CalendarRequest = await req.json();

    // Get user's OAuth tokens from profiles
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      throw new Error('User profile not found');
    }

    // For now, we'll implement a basic calendar service
    // In a real implementation, you would use the OAuth tokens to call
    // Google Calendar API or Microsoft Graph API

    switch (requestData.action) {
      case 'get_events':
        // Mock calendar events - in real implementation, call actual APIs
        const mockEvents = [
          {
            id: '1',
            title: 'Team Meeting',
            start: '2024-01-15T10:00:00Z',
            end: '2024-01-15T11:00:00Z',
            description: 'Weekly team sync'
          },
          {
            id: '2',
            title: 'Doctor Appointment',
            start: '2024-01-16T14:30:00Z',
            end: '2024-01-16T15:30:00Z',
            description: 'Annual checkup'
          }
        ];

        // Filter by date if specified
        let filteredEvents = mockEvents;
        if (requestData.date) {
          const targetDate = new Date(requestData.date).toDateString();
          filteredEvents = mockEvents.filter(event => 
            new Date(event.start).toDateString() === targetDate
          );
        } else if (requestData.start_date && requestData.end_date) {
          const startDate = new Date(requestData.start_date);
          const endDate = new Date(requestData.end_date);
          filteredEvents = mockEvents.filter(event => {
            const eventDate = new Date(event.start);
            return eventDate >= startDate && eventDate <= endDate;
          });
        }

        return new Response(JSON.stringify({
          events: filteredEvents,
          message: `Found ${filteredEvents.length} calendar events`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'create_event':
        // Mock event creation
        const newEvent = {
          id: Date.now().toString(),
          ...requestData.event
        };

        return new Response(JSON.stringify({
          event: newEvent,
          message: 'Event created successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      default:
        throw new Error(`Unsupported action: ${requestData.action}`);
    }

  } catch (error) {
    console.error('Error in calendar-integration function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});