import { MessageCircle } from "lucide-react";

export default function MessagesIndex() {
  return (
    <section data-open="false" className="text-muted-foreground hidden flex-col items-center justify-center gap-2 p-8 text-center md:flex">
      <MessageCircle className="size-8" aria-hidden="true" />
      <p className="text-foreground font-heading font-bold">Select a conversation</p>
      <p className="max-w-xs text-sm">Or start a new one from a person&rsquo;s profile. You can message people who allow messages from you.</p>
    </section>
  );
}
