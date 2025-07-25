import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { User, Clock, ArrowRight, Brain, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const UserPreferences = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState({
    preferredName: "",
    preferredTitle: "",
    whatsappNumber: "",
    jobTitleRole: "",
    industry: "",
    workingDays: [] as string[],
    workingHoursStart: "",
    workingHoursEnd: "",
    dndHoursStart: "",
    dndHoursEnd: "",
    meetingTimesStart: "",
    meetingTimesEnd: "",
    breakTimeStart: "",
    breakTimeEnd: ""
  });

  const handleInputChange = (field: string, value: string | boolean | string[]) => {
    setPreferences(prev => ({ ...prev, [field]: value }));
  };

  const handleWorkingDayToggle = (day: string) => {
    setPreferences(prev => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter(d => d !== day)
        : [...prev.workingDays, day]
    }));
  };

  const industries = [
    "Technology",
    "Healthcare",
    "Finance",
    "Education",
    "Retail",
    "Manufacturing",
    "Real Estate",
    "Marketing",
    "Consulting",
    "Legal",
    "Other"
  ];

  const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
                  <h3 className="text-lg font-semibold text-foreground">Personal Details</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="preferredName" className="text-foreground">Preferred Name</Label>
                    <Input
                      id="preferredName"
                      type="text"
                      placeholder="How should I address you?"
                      value={preferences.preferredName}
                      onChange={(e) => handleInputChange("preferredName", e.target.value)}
                      className="bg-background/50 border-primary/30 focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferredTitle" className="text-foreground">Preferred Title</Label>
                    <Input
                      id="preferredTitle"
                      type="text"
                      placeholder="Mr./Ms./Dr./etc."
                      value={preferences.preferredTitle}
                      onChange={(e) => handleInputChange("preferredTitle", e.target.value)}
                      className="bg-background/50 border-primary/30 focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="whatsappNumber" className="text-foreground">WhatsApp Number</Label>
                    <Input
                      id="whatsappNumber"
                      type="tel"
                      placeholder="+1 234 567 8900"
                      value={preferences.whatsappNumber}
                      onChange={(e) => handleInputChange("whatsappNumber", e.target.value)}
                      className="bg-background/50 border-primary/30 focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jobTitleRole" className="text-foreground">Job Title/Role</Label>
                    <Input
                      id="jobTitleRole"
                      type="text"
                      placeholder="Product Manager, Developer, etc."
                      value={preferences.jobTitleRole}
                      onChange={(e) => handleInputChange("jobTitleRole", e.target.value)}
                      className="bg-background/50 border-primary/30 focus:border-primary"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry" className="text-foreground">Industry</Label>
                  <Select value={preferences.industry} onValueChange={(value) => handleInputChange("industry", value)}>
                    <SelectTrigger className="bg-background/50 border-primary/30 focus:border-primary">
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((industry) => (
                        <SelectItem key={industry} value={industry.toLowerCase()}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Work Schedule */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Work Schedule</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label className="text-foreground">Working Days</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {weekDays.map((day) => (
                        <div key={day} className="flex items-center space-x-2">
                          <Checkbox
                            id={day}
                            checked={preferences.workingDays.includes(day)}
                            onCheckedChange={() => handleWorkingDayToggle(day)}
                          />
                          <Label htmlFor={day} className="text-sm text-foreground cursor-pointer">
                            {day.slice(0, 3)}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Working Hours Start</Label>
                      <Input
                        type="time"
                        value={preferences.workingHoursStart}
                        onChange={(e) => handleInputChange("workingHoursStart", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Working Hours End</Label>
                      <Input
                        type="time"
                        value={preferences.workingHoursEnd}
                        onChange={(e) => handleInputChange("workingHoursEnd", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Time Preferences */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Time Preferences</h3>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Do Not Disturb - Start</Label>
                      <Input
                        type="time"
                        value={preferences.dndHoursStart}
                        onChange={(e) => handleInputChange("dndHoursStart", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Do Not Disturb - End</Label>
                      <Input
                        type="time"
                        value={preferences.dndHoursEnd}
                        onChange={(e) => handleInputChange("dndHoursEnd", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Preferred Meeting Times - Start</Label>
                      <Input
                        type="time"
                        value={preferences.meetingTimesStart}
                        onChange={(e) => handleInputChange("meetingTimesStart", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Preferred Meeting Times - End</Label>
                      <Input
                        type="time"
                        value={preferences.meetingTimesEnd}
                        onChange={(e) => handleInputChange("meetingTimesEnd", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Break/Lunch Time - Start (Optional)</Label>
                      <Input
                        type="time"
                        value={preferences.breakTimeStart}
                        onChange={(e) => handleInputChange("breakTimeStart", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Break/Lunch Time - End (Optional)</Label>
                      <Input
                        type="time"
                        value={preferences.breakTimeEnd}
                        onChange={(e) => handleInputChange("breakTimeEnd", e.target.value)}
                        className="bg-background/50 border-primary/30 focus:border-primary"
                      />
                    </div>
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