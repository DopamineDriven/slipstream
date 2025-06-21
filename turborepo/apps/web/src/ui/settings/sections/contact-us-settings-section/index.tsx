"use client";

import type { User } from "next-auth";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Mail,
  MessageSquare as MessageSquareQuestion,
  Send,
  Textarea
} from "@t3-chat-clone/ui";
import { Label } from "@/ui/atoms/label";

export function ContactUsSettingsSection({ user }: { user?: User }) {
  return (
    <Card className="bg-brand-component border-brand-border text-brand-text">
      <CardHeader>
        <div className="mb-2 flex items-center">
          <MessageSquareQuestion className="text-brand-primary mr-2 h-6 w-6" />
          <CardTitle className="text-brand-text-emphasis">
            Contact Us & Support
          </CardTitle>
        </div>
        <CardDescription className="text-brand-text-muted">
          Have questions or need assistance? Reach out to our support team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4">
          <div>
            <Label htmlFor="contact-name" className="text-brand-text-muted">
              Your Name
            </Label>
            <Input
              id="contact-name"
              placeholder={user?.name ?? "Enter your name"}
              className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
            />
          </div>
          <div>
            <Label htmlFor="contact-email" className="text-brand-text-muted">
              Your Email
            </Label>
            <Input
              id="contact-email"
              type="email"
              placeholder={user?.email ?? "Enter your email address"}
              className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
            />
          </div>
          <div>
            <Label htmlFor="contact-subject" className="text-brand-text-muted">
              Subject
            </Label>
            <Input
              id="contact-subject"
              placeholder="Inquiry Subject"
              className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
            />
          </div>
          <div>
            <Label htmlFor="contact-message" className="text-brand-text-muted">
              Message
            </Label>
            <Textarea
              id="contact-message"
              placeholder="Describe your issue or question in detail..."
              className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text min-h-[120px]"
            />
          </div>
          <Button
            type="submit"
            className="bg-brand-primary text-brand-primaryForeground hover:bg-brand-primary/90">
            <Send className="mr-2 h-4 w-4" /> Send Message
          </Button>
        </form>
        <div className="border-brand-border border-t pt-4">
          <h4 className="text-md text-brand-text-emphasis mb-2 font-medium">
            Other ways to get help:
          </h4>
          <ul className="space-y-1 text-sm">
            <li>
              <a
                href="#"
                className="text-brand-primary flex items-center hover:underline"
                onClick={e => e.preventDefault()}>
                <Mail className="mr-2 h-4 w-4" /> Email us at coming@soon.com
              </a>
            </li>
            <li>
              <a
                href="#"
                className="text-brand-primary flex items-center hover:underline"
                onClick={e => e.preventDefault()}>
                <MessageSquareQuestion className="mr-2 h-4 w-4" /> FAQ page
                coming soon
              </a>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
