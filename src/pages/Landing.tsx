import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, Shield, Clock, Brain, Users, CheckCircle, MessageSquare } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { InterfaceMockup } from '@/components/InterfaceMockup';
import { TestimonialCard } from '@/components/TestimonialCard';

export default function Landing() {
  const navigate = useNavigate();

  // Check if user is authenticated and redirect to app
  // Temporarily disabled to view landing page
  /*
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/app');
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate('/app');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);
  */

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      {/* Header */}
      <header className="container mx-auto px-6 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img 
              src="/lovable-uploads/059ad0dd-de4f-441d-9d82-e61c507b3136.png" 
              alt="VirtuAI Assistant Icon" 
              className="h-10 w-10"
            />
            <span className="text-xl font-montserrat font-bold text-foreground">VirtuAI Assistant</span>
          </div>
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <a href="#about" className="text-muted-foreground hover:text-foreground transition-colors">About</a>
            <Link to="/login" className="text-muted-foreground hover:text-foreground transition-colors">Login</Link>
            <Link to="/signup">
              <Button variant="default" size="sm">Get Started</Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Content */}
          <div className="space-y-8">
            <div>
              <h1 className="text-4xl md:text-6xl font-montserrat font-bold text-foreground mb-6 leading-tight">
                Say Goodbye to Missed Meetings, Lost Emails & Endless Admin.
              </h1>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Our AI assistant manages your day like a top-tier executive assistant — across web and WhatsApp.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/signup">
                <Button size="lg" className="text-lg px-8 py-6 rounded-full w-full sm:w-auto">
                  Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button variant="outline" size="lg" className="text-lg px-8 py-6 rounded-full w-full sm:w-auto">
                <MessageSquare className="mr-2 h-5 w-5" />
                Try WhatsApp Demo
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex items-center space-x-6 text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>14-day free trial</span>
              </div>
            </div>
          </div>

          {/* Right Side - Interface Mockup */}
          <div className="lg:pl-8">
            <InterfaceMockup />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-montserrat font-bold text-foreground mb-4">
            Intelligent Automation at Your Service
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Experience enterprise-grade AI that learns your workflow and optimizes every interaction.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-montserrat font-semibold mb-2">Lightning Fast</h3>
            <p className="text-muted-foreground">Process tasks 10x faster with AI-powered automation and intelligent workflows.</p>
          </div>

          <div className="text-center p-6">
            <div className="bg-primary/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-montserrat font-semibold mb-2">Intelligent Insights</h3>
            <p className="text-muted-foreground">Get smart recommendations and predictive analytics to make better decisions.</p>
          </div>

          <div className="text-center p-6">
            <div className="bg-accent/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-accent" />
            </div>
            <h3 className="text-xl font-montserrat font-semibold mb-2">Enterprise Security</h3>
            <p className="text-muted-foreground">Bank-level security with end-to-end encryption and compliance standards.</p>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-montserrat font-bold text-foreground mb-4">
            Loved by executives worldwide
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            See how top professionals are transforming their productivity with VirtuAI Assistant.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <TestimonialCard
            name="Sarah Chen"
            role="CEO"
            company="TechFlow Inc"
            content="VirtuAI has completely transformed how I manage my day. It's like having the world's best executive assistant, available 24/7. My productivity has increased by 300%."
          />
          <TestimonialCard
            name="Michael Rodriguez"
            role="VP of Sales"
            company="Global Dynamics"
            content="The WhatsApp integration is a game-changer. I can schedule meetings, draft emails, and manage my calendar while I'm on the go. It's incredibly intuitive and powerful."
          />
          <TestimonialCard
            name="Dr. Emily Watson"
            role="Managing Director"
            company="Innovation Labs"
            content="The AI understands context better than any tool I've used. It drafts emails in my writing style and never misses a detail. It's like having a mind reader as an assistant."
          />
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-primary/5 py-20">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-primary mb-2">15M+</div>
              <div className="text-muted-foreground">Hours saved annually</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary mb-2">99.9%</div>
              <div className="text-muted-foreground">Uptime reliability</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary mb-2">500+</div>
              <div className="text-muted-foreground">Enterprise customers</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-4xl font-montserrat font-bold text-foreground mb-6">
            Ready to transform your productivity?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join executives who have revolutionized their workflow with AI that handles your day—before you even start it.
          </p>
          <Link to="/signup">
            <Button size="lg" className="text-lg px-8 py-6 rounded-full">
              Start Your Free Trial <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="container mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <img 
                  src="/lovable-uploads/059ad0dd-de4f-441d-9d82-e61c507b3136.png" 
                  alt="VirtuAI Assistant Icon" 
                  className="h-8 w-8"
                />
                <span className="font-montserrat font-bold">VirtuAI Assistant</span>
              </div>
              <p className="text-muted-foreground">Your AI Executive Partner</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#security" className="hover:text-foreground transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#about" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#careers" className="hover:text-foreground transition-colors">Careers</a></li>
                <li><a href="#contact" className="hover:text-foreground transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#docs" className="hover:text-foreground transition-colors">Documentation</a></li>
                <li><a href="#help" className="hover:text-foreground transition-colors">Help Center</a></li>
                <li><a href="#status" className="hover:text-foreground transition-colors">Status</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-muted-foreground">
            <p>&copy; 2024 VirtuAI Assistant. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}