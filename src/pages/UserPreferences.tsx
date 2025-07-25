import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { User, Settings, ArrowRight, Brain, Clock, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const UserPreferences = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState({
    fullName: "",
    jobTitle: "",
    company: "",
    primaryGoals: "",
    communicationStyle: "professional",
    responseSpeed: "balanced",
    voiceNotifications: true,
    smartSuggestions: true,
    learningMode: true,
    timeZone: "",
    workingHours: ""
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setPreferences(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Preferences saved!",
      description: "Your AI assistant is now personalized for you.",
    });
    navigate("/app");
  };

  const handleSkip = () => {
    navigate("/app");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Personalize Your Experience</h1>
          <p className="text-muted-foreground">
            Help us tailor your AI assistant to work better for you
          </p>
        </div>

        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl text-foreground">AI Personalization</CardTitle>
            <CardDescription className="text-muted-foreground">
              Configure your AI assistant to match your working style
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Personal Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">About You</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-foreground">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      value={preferences.fullName}
                      onChange={(e) => handleInputChange("fullName", e.target.value)}
                      className="bg-background/50 border-primary/30 focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jobTitle" className="text-foreground">Job Title</Label>
                    <Input
                      id="jobTitle"
                      type="text"
                      placeholder="Product Manager"
                      value={preferences.jobTitle}
                      onChange={(e) => handleInputChange("jobTitle", e.target.value)}
                      className="bg-background/50 border-primary/30 focus:border-primary"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company" className="text-foreground">Company</Label>
                  <Input
                    id="company"
                    type="text"
                    placeholder="Acme Corp"
                    value={preferences.company}
                    onChange={(e) => handleInputChange("company", e.target.value)}
                    className="bg-background/50 border-primary/30 focus:border-primary"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="primaryGoals" className="text-foreground">Primary Goals</Label>
                  <Textarea
                    id="primaryGoals"
                    placeholder="What would you like to achieve with this AI assistant? (e.g., improve productivity, automate tasks, get insights)"
                    value={preferences.primaryGoals}
                    onChange={(e) => handleInputChange("primaryGoals", e.target.value)}
                    className="bg-background/50 border-primary/30 focus:border-primary min-h-[100px]"
                  />
                </div>
              </div>

              {/* AI Behavior Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">AI Behavior</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-foreground">Communication Style</Label>
                      <div className="space-y-2">
                        {["casual", "professional", "technical"].map((style) => (
                          <label key={style} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="communicationStyle"
                              value={style}
                              checked={preferences.communicationStyle === style}
                              onChange={(e) => handleInputChange("communicationStyle", e.target.value)}
                              className="text-primary"
                            />
                            <span className="text-foreground capitalize">{style}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-foreground">Response Speed</Label>
                      <div className="space-y-2">
                        {[
                          { value: "quick", label: "Quick & Concise" },
                          { value: "balanced", label: "Balanced" },
                          { value: "detailed", label: "Detailed & Thorough" }
                        ].map((option) => (
                          <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="responseSpeed"
                              value={option.value}
                              checked={preferences.responseSpeed === option.value}
                              onChange={(e) => handleInputChange("responseSpeed", e.target.value)}
                              className="text-primary"
                            />
                            <span className="text-foreground">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="timeZone" className="text-foreground">Time Zone</Label>
                      <Input
                        id="timeZone"
                        type="text"
                        placeholder="EST, PST, GMT+2, etc."
                        value={preferences.timeZone}
                        onChange={(e) => handleInputChange("timeZone", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="workingHours" className="text-foreground">Working Hours</Label>
                      <Input
                        id="workingHours"
                        type="text"
                        placeholder="9 AM - 5 PM"
                        value={preferences.workingHours}
                        onChange={(e) => handleInputChange("workingHours", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature Preferences */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Bell className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Features</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-card/30 rounded-lg border border-primary/10">
                    <div className="space-y-1">
                      <Label className="text-foreground">Voice Notifications</Label>
                      <p className="text-sm text-muted-foreground">Get audio alerts for important updates</p>
                    </div>
                    <Switch
                      checked={preferences.voiceNotifications}
                      onCheckedChange={(checked) => handleInputChange("voiceNotifications", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-card/30 rounded-lg border border-primary/10">
                    <div className="space-y-1">
                      <Label className="text-foreground">Smart Suggestions</Label>
                      <p className="text-sm text-muted-foreground">AI-powered recommendations based on your activity</p>
                    </div>
                    <Switch
                      checked={preferences.smartSuggestions}
                      onCheckedChange={(checked) => handleInputChange("smartSuggestions", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-card/30 rounded-lg border border-primary/10">
                    <div className="space-y-1">
                      <Label className="text-foreground">Learning Mode</Label>
                      <p className="text-sm text-muted-foreground">Allow AI to learn from your preferences over time</p>
                    </div>
                    <Switch
                      checked={preferences.learningMode}
                      onCheckedChange={(checked) => handleInputChange("learningMode", checked)}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSkip}
                  className="border-primary/30 hover:bg-primary/10"
                >
                  Skip for now
                </Button>
                <Button
                  type="submit"
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground flex-1"
                >
                  Complete Setup
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserPreferences;